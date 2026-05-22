import config from '../config'

/**
 * 云端共享汉化缓存数据库接口
 * 对接 Cloudflare Workers + KV 存储
 */

const SALT = 'BLHXFY_Cloud_Cache_Salt_2026'

const sha256 = async (message) => {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 将 LLM 翻译出的剧情文本片段缓存上传到云端
 * @param {string} sceneName 剧情场景标识（如 scene_12345）
 * @param {Map|object} transMap 翻译映射表，包含每一句 ID 对应的翻译文字
 */
export const uploadTranslationCache = async (sceneName, transMap) => {
  if (!config.cloudCacheUrl || !sceneName || !transMap) return

  // 转换为普通的 JSON 对象以便传输
  let transData = transMap
  if (transMap instanceof Map) {
    transData = {}
    for (let [key, val] of transMap.entries()) {
      // 避免上传无意义的配置属性，只上传翻译文本
      if (val && typeof val === 'object') {
        transData[key] = val
      }
    }
  }

  if (Object.keys(transData).length === 0) return

  console.info(`[CloudCache] 准备上传剧情 LLM 汉化数据 -> 场景名: ${sceneName}`, transData)

  try {
    const baseUrl = config.cloudCacheUrl.replace(/\/+$/, '')
    const expectedPlainText = sceneName + JSON.stringify(transData) + SALT
    const signature = await sha256(expectedPlainText)

    const headers = {
      'Content-Type': 'application/json',
      'X-BLHXFY-Signature': signature
    }
    if ((typeof DEV !== 'undefined' && DEV) || config.devToken === 'BLHXFY_Dev_Secret_2026') {
      headers['X-BLHXFY-Developer'] = 'BLHXFY_Dev_Secret_2026'
    }

    const response = await fetch(`${baseUrl}/api/story/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        scene: sceneName,
        translations: transData
      })
    })
    if (!response.ok) {
      console.warn('[CloudCache] 云端缓存上传响应异常:', response.status)
    } else {
      console.info('[CloudCache] 剧情 LLM 汉化成功缓存至云端')
    }
  } catch (err) {
    console.error('[CloudCache] 云端缓存上传请求失败:', err)
  }
}

/**
 * 从云端缓存中查询当前剧情的共享翻译
 * @param {string} sceneName 剧情场景标识
 * @returns {Promise<Map|null>} 成功则返回翻译的 Map，否则返回 null
 */
export const fetchTranslationCache = async (sceneName) => {
  if (!config.cloudCacheUrl || !sceneName) return null

  console.info(`[CloudCache] 尝试从云端获取剧情共享缓存 -> 场景名: ${sceneName}`)

  try {
    const baseUrl = config.cloudCacheUrl.replace(/\/+$/, '')
    const headers = {
      'Referer': 'https://game.granbluefantasy.jp/'
    }
    if ((typeof DEV !== 'undefined' && DEV) || config.devToken === 'BLHXFY_Dev_Secret_2026') {
      headers['X-BLHXFY-Developer'] = 'BLHXFY_Dev_Secret_2026'
    }

    const response = await fetch(`${baseUrl}/api/story/query?scene=${sceneName}`, {
      headers
    })
    if (response.ok) {
      const data = await response.json()
      if (data && data.translations && Object.keys(data.translations).length > 0) {
        const transMap = new Map()
        Object.entries(data.translations).forEach(([key, val]) => {
          transMap.set(key, val)
        })
        console.info(`[CloudCache] 成功获取云端共享汉化缓存: ${sceneName}`)
        return transMap
      }
    }
  } catch (err) {
    console.error('[CloudCache] 获取云端共享缓存失败:', err)
  }

  return null
}
