interface Env {
  KV: KVNamespace;
}

const DEV_TOKEN = "BLHXFY_Dev_Secret_2026";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // 获取 Origin 动态回显，防止多 Origin 跨域被浏览器阻拦
    const origin = request.headers.get("Origin") || "*";
    
    // 跨域响应头设置
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-BLHXFY-Signature, X-BLHXFY-Developer",
      "Access-Control-Max-Age": "86400",
    };

    // 处理 OPTIONS 跨域预检请求
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // 开发者特权校验
      const devHeader = request.headers.get("X-BLHXFY-Developer");
      const isDeveloper = devHeader === DEV_TOKEN;

      // Referer 来源校验（允许 localhost、127.0.0.1 方便开发与测试）
      const referer = request.headers.get("Referer");
      if (!referer) {
        return new Response(JSON.stringify({ error: "Access denied. Referer header is required." }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      try {
        const refUrl = new URL(referer);
        const allowedHosts = ["game.granbluefantasy.jp", "gbf.game.mbga.jp", "localhost", "127.0.0.1"];
        if (!allowedHosts.includes(refUrl.hostname)) {
          return new Response(JSON.stringify({ error: "Access denied. Invalid Referer." }), {
            status: 403,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: "Access denied. Invalid Referer header format." }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // 1. 获取剧情翻译缓存 GET /api/story/query?scene=...
      if (url.pathname === "/api/story/query" && request.method === "GET") {
        const scene = url.searchParams.get("scene");
        if (!scene) {
          return new Response(JSON.stringify({ error: "Missing scene parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // A. 客户端 IP 频率限制（查询限流：对于角色技能提升到60次/分钟，剧情为10次/分钟，开发者免限流）
        const limit = scene.startsWith("skill_npc_") ? 60 : 10;
        if (!isDeveloper) {
          const ip = request.headers.get("CF-Connecting-IP") || "unknown";
          const minuteKey = `rate:query:${ip}:${Math.floor(Date.now() / 60000)}`;
          const countVal = await env.KV.get(minuteKey);
          const count = countVal ? parseInt(countVal, 10) : 0;
          
          if (count >= limit) {
            return new Response(JSON.stringify({ error: `Too many requests. Limit is ${limit} queries per minute.` }), {
              status: 429,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
          await env.KV.put(minuteKey, (count + 1).toString(), { expirationTtl: 120 });
        }

        const kvKey = `story:${scene}`;
        const dataStr = await env.KV.get(kvKey);
        
        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            if (isNpcCacheValid(data)) {
              return new Response(JSON.stringify({ translations: data.translations || {} }), {
                status: 200,
                headers: { "Content-Type": "application/json", ...corsHeaders },
              });
            }
          } catch (e) {}
        }

        return new Response(JSON.stringify({ translations: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // 2. 上传剧情翻译缓存 POST /api/story/upload
      if (url.pathname === "/api/story/upload" && request.method === "POST") {
        let body: any;
        try {
          body = await request.json();
        } catch (e) {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const { scene, translations } = body;
        if (!scene || !translations || typeof translations !== "object") {
          return new Response(JSON.stringify({ error: "Invalid parameters. 'scene' and 'translations' object are required." }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // A. 客户端 IP 频率限制（上传限流：对于角色技能提升到60次/分钟，剧情为10次/分钟，开发者免限流）
        const limit = scene.startsWith("skill_npc_") ? 60 : 10;
        if (!isDeveloper) {
          const ip = request.headers.get("CF-Connecting-IP") || "unknown";
          const minuteKey = `rate:upload:${ip}:${Math.floor(Date.now() / 60000)}`;
          const countVal = await env.KV.get(minuteKey);
          const count = countVal ? parseInt(countVal, 10) : 0;
          
          if (count >= limit) {
            return new Response(JSON.stringify({ error: `Too many requests. Limit is ${limit} uploads per minute.` }), {
              status: 429,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
          await env.KV.put(minuteKey, (count + 1).toString(), { expirationTtl: 120 });
        }

        // B. 每日限额限制（上传限流：100次/天，开发者免限流）
        if (!isDeveloper) {
          const ip = request.headers.get("CF-Connecting-IP") || "unknown";
          const todayStr = new Date().toISOString().split('T')[0];
          const dailyKey = `limit:daily:${ip}:${todayStr}`;
          const dailyVal = await env.KV.get(dailyKey);
          const dailyCount = dailyVal ? parseInt(dailyVal, 10) : 0;

          if (dailyCount >= 100) {
            return new Response(JSON.stringify({ error: "Daily upload limit reached (100 uploads per day)." }), {
              status: 429,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
          await env.KV.put(dailyKey, (dailyCount + 1).toString(), { expirationTtl: 172800 });
        }

        // C. scene 正则匹配校验
        const sceneRegex = /^[a-zA-Z0-9_-]+$/;
        if (!sceneRegex.test(scene)) {
          return new Response(JSON.stringify({ error: "Invalid scene parameter format." }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // D. 加盐签名校验
        const clientSignature = request.headers.get("X-BLHXFY-Signature");
        if (!clientSignature) {
          return new Response(JSON.stringify({ error: "Missing signature." }), {
            status: 403,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const expectedPlainText = scene + JSON.stringify(translations) + SALT;
        const expectedSignature = await sha256(expectedPlainText);
        if (clientSignature !== expectedSignature) {
          return new Response(JSON.stringify({ error: "Signature mismatch. Unauthorized upload." }), {
            status: 403,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // E. 只写一次校验（防脏数据覆写）
        const kvKey = `story:${scene}`;
        const existingDataStr = await env.KV.get(kvKey);
        if (existingDataStr) {
          try {
            const existingData = JSON.parse(existingDataStr);
            if (isNpcCacheValid(existingData)) {
              return new Response(JSON.stringify({ success: true, message: "Cache already exists, skip overwrite" }), {
                status: 200,
                headers: { "Content-Type": "application/json", ...corsHeaders },
              });
            }
          } catch (e) {}
        }

        // F. 数据安全清洗与 XSS 过滤
        const cleanedTranslations = sanitize(translations);
        if (Object.keys(cleanedTranslations).length === 0) {
          return new Response(JSON.stringify({ error: "No valid translation data remaining after sanitization." }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const saveData = {
          translations: cleanedTranslations,
          updated_at: Date.now()
        };

        // 将数据写入 KV
        await env.KV.put(kvKey, JSON.stringify(saveData));

        return new Response(JSON.stringify({ success: true, scene }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // 3. 服务健康检查首页 GET /
      if (url.pathname === "/" && request.method === "GET") {
        return new Response(JSON.stringify({
          status: "ok",
          message: "BLHXFY Cloud Cache Server is running",
          version: "1.0.0"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // 404 默认兜底
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};

// 安全辅助逻辑
const SALT = "BLHXFY_Cloud_Cache_Salt_2026";

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function sanitize(val: any): any {
  if (typeof val === 'string') {
    // 过滤掉所有 HTML 标签
    let clean = val.replace(/<\/?[^>]+(>|$)/g, "");
    // 限制单条翻译最大长度为 500 字符
    if (clean.length > 500) {
      clean = clean.substring(0, 500);
    }
    return clean;
  }
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const cleanObj: any = {};
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        if (key.length <= 100) {
          cleanObj[key] = sanitize(val[key]);
        }
      }
    }
    return cleanObj;
  }
  return val;
}

function isNpcCacheValid(data: any): boolean {
  if (!data || !data.translations) return false;
  const trans = data.translations;
  if (!trans.skills || !Array.isArray(trans.skills)) return true;
  const validIdPattern = /^(special|skill-[a-zA-Z0-9_-]+|support-[a-zA-Z0-9_-]+|intro)$/;
  return trans.skills.every((skill: any) => skill && typeof skill.id === 'string' && validIdPattern.test(skill.id));
}

