import config from '../config'
import request from './request'

const TIMEOUT = 180000 // 3分钟硬超时

const aiTrans = async (csv, nameMap, category = 'scenario') => {
  if (!config.aiApiKey) {
    return null
  }

  const todayStr = new Date().toISOString().split('T')[0]
  let countInfo = { date: todayStr, count: 0 }
  try {
    const saved = localStorage.getItem('blhxfy:ai_trans_count')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.date === todayStr) {
        countInfo = parsed
      }
    }
  } catch (e) {}

  const isDev = (typeof DEV !== 'undefined' && DEV) || 
                (config.devToken === 'BLHXFY_Dev_Secret_2026') || 
                (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1'))

  if (!isDev && countInfo.count >= 100) {
    console.warn(`[AITrans] 已达到今日 AI 翻译上限 (100次)，为防止额度超支，将走常规翻译模式。`)
    return null
  }

  let prompt = ''
  if (category === 'skill') {
    const nameContext = nameMap ? Array.from(nameMap.entries())
      .map(([jp, trans]) => `${jp}->${trans}`)
      .join(',') : ''

    prompt = `Translate GBF NPC skill names, descriptions, and character intro biography to Chinese.
This is for the game "Granblue Fantasy" (碧蓝幻想, GBF). Use accurate game terminology.
For example:
- "ダメージ" -> "伤害"
- "アビリティ" -> "技能"
- "トリプルアタック" -> "三连击 (TA)"
- "ダブルアタック" -> "二连击 (DA)"
- "テンション" -> "Tension"
- "ターン" -> "回合"
- "奥義" -> "奥义"
- "回復" -> "回复"

Reference Names: ${nameContext}.

Input: A JSON object with "npc_name" and "skills" list.
Output: A JSON object in the EXACT same format as input but with translated "npc_name", and translated "name" and "detail" keys inside the "skills" list.
Example Input:
{
  "npc_name": "ルリア",
  "skills": [
    {"id": "special", "name": "アイシクルネイル", "detail": "敵に水属性ダメージ(特大)"}
  ]
}
Example Output:
{
  "npc_name": "露莉亚",
  "skills": [
    {"id": "special", "name": "冰针重爪", "detail": "对敌方造成水属性伤害(特大)"}
  ]
}
Output ONLY the raw JSON. No explanation, no markdown.`
  } else {
    const nameContext = nameMap ? Array.from(nameMap.entries())
      .map(([jp, trans]) => `${jp}->${trans}`)
      .join(',') : ''

    prompt = `Translate GBF scenario to Chinese. 
Reference Names: ${nameContext}.

Input: JSON array of objects (id, name, text).
Output: A JSON object with TWO keys:
1. "name_map": Object for NEW character names (Japanese:Chinese). Skip names in Reference Names.
2. "trans_map": Object for dialogue (id:translated_text).

Example:
{
  "name_map": {"JP_Name": "CN_Name"},
  "trans_map": {"0-chapter_name": "Translated Title", "12345": "Translated Text..."}
}

Output ONLY the JSON. No explanation, no markdown.
IMPORTANT: 
1. Use the EXACT "id" from input.
2. DO NOT include character names or colons in "trans_map" values. ONLY the dialogue.`
  }

  const provider = (config.llmProvider || 'custom').toLowerCase()
  let endpoint = (config.aiApiEndpoint || '').trim()
  let headers = {
    'Content-Type': 'application/json'
  }
  let body = ''

  // 1. 根据 Provider 组装 Endpoint, Headers 和 Body
  if (provider === 'openai') {
    if (!endpoint) {
      endpoint = 'https://api.openai.com/v1/chat/completions'
    } else if (!endpoint.endsWith('/chat/completions') && !endpoint.endsWith('/v1')) {
      endpoint = endpoint.replace(/\/+$/, '') + '/v1/chat/completions'
    } else if (endpoint.endsWith('/v1')) {
      endpoint = endpoint.replace(/\/+$/, '') + '/chat/completions'
    }
    headers['Authorization'] = `Bearer ${config.aiApiKey}`
    body = JSON.stringify({
      model: config.aiModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: csv }
      ],
      response_format: { type: "json_object" }
    })
  } else if (provider === 'anthropic') {
    if (!endpoint) {
      endpoint = 'https://api.anthropic.com/v1/messages'
    }
    headers['x-api-key'] = config.aiApiKey
    headers['anthropic-version'] = '2023-06-01'
    body = JSON.stringify({
      model: config.aiModel || 'claude-3-5-sonnet-latest',
      max_tokens: 4000,
      system: prompt,
      messages: [
        { role: 'user', content: csv }
      ]
    })
  } else if (provider === 'gemini') {
    const model = config.aiModel || 'gemini-1.5-flash'
    if (!endpoint) {
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.aiApiKey}`
    } else {
      // 携带 key 到 URL 中
      if (!endpoint.includes('?key=') && !endpoint.includes('&key=')) {
        endpoint = endpoint.replace(/\/+$/, '') + `?key=${config.aiApiKey}`
      }
    }
    body = JSON.stringify({
      contents: [{
        parts: [{ text: `${prompt}\n\nInput:\n${csv}` }]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  } else {
    // custom 或其他默认情况 (通用 OpenAI 兼容格式，但不强加 response_format)
    if (!endpoint) {
      endpoint = 'https://api.deepseek.com/v1/chat/completions'
    } else if (!endpoint.endsWith('/chat/completions') && !endpoint.endsWith('/v1')) {
      endpoint = endpoint.replace(/\/+$/, '') + '/v1/chat/completions'
    } else if (endpoint.endsWith('/v1')) {
      endpoint = endpoint.replace(/\/+$/, '') + '/chat/completions'
    }
    headers['Authorization'] = `Bearer ${config.aiApiKey}`
    body = JSON.stringify({
      model: config.aiModel,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: csv }
      ]
    })
  }

  console.info(`[AITrans] 准备调用大模型翻译. Provider: ${provider}, Endpoint: ${endpoint}, Model: ${config.aiModel || 'default'}`)

  // 2. 解析返回结果
  const parseResult = (data) => {
    let result = ''
    try {
      if (provider === 'openai' || provider === 'custom') {
        if (data && data.choices && data.choices[0] && data.choices[0].message) {
          result = data.choices[0].message.content.trim()
        }
      } else if (provider === 'anthropic') {
        if (data && data.content && data.content[0]) {
          result = data.content[0].text.trim()
        }
      } else if (provider === 'gemini') {
        if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
          result = data.candidates[0].content.parts[0].text.trim()
        }
      }

      console.info(`[AITrans] 大模型返回原始响应文本:`, result)

      if (!result) return null

      // 清洗 JSON 格式
      result = result.replace(/^```json\n?/, '').replace(/\n?```$/, '')
      
      try {
        const parsed = JSON.parse(result)
        console.info(`[AITrans] 成功解析翻译 JSON:`, parsed)
        return parsed
      } catch (e) {
        // 兜底尝试：截取第一个 '{' 到对应的最后一个 '}'
        const start = result.indexOf('{')
        if (start !== -1) {
          let depth = 0
          let end = -1
          for (let i = start; i < result.length; i++) {
            if (result[i] === '{') depth++
            else if (result[i] === '}') depth--
            
            if (depth === 0) {
              end = i
              break
            }
          }
          if (end !== -1) {
            const cleanJson = result.substring(start, end + 1)
            const parsed = JSON.parse(cleanJson)
            console.info(`[AITrans] 截取 JSON 兜底成功解析:`, parsed)
            return parsed
          }
        }
        console.error('AI output is not valid JSON:', result.slice(0, 100))
      }
    } catch (err) {
      console.error('Failed to parse AI translation result:', err)
    }
    return null
  }

  const timeoutPromise = new Promise((resolve) => 
    setTimeout(() => resolve('timeout'), TIMEOUT)
  )

  const requestTask = async () => {
    try {
      const hasGmXhr = typeof GM_xmlhttpRequest !== 'undefined' || (typeof window !== 'undefined' && !!window.GM_xmlhttpRequest)
      
      if (hasGmXhr) {
        try {
          console.info(`[AITrans] 检测到 GM_xmlhttpRequest，优先使用 GM request 进行跨域请求...`)
          const response = await request(endpoint, {
            method: 'POST',
            headers,
            data: body
          })
          console.info(`[AITrans] GM request 请求完成.`)
          let data = typeof response === 'string' ? JSON.parse(response) : response
          console.info(`[AITrans] GM request 成功获得响应.`)
          return parseResult(data)
        } catch (e) {
          console.warn(`[AITrans] GM request 请求发生异常 (将尝试原生 fetch 兜底):`, e)
        }
      }

      try {
        console.info(`[AITrans] 正在尝试使用原生 fetch 发送翻译请求...`)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时限制
        
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        console.info(`[AITrans] 原生 fetch 请求完成. Status: ${res.status}`)
        if (res.ok) {
          const data = await res.json()
          console.info(`[AITrans] 原生 fetch 成功获得 JSON 响应`)
          return parseResult(data)
        } else {
          const errText = await res.text().catch(() => '')
          console.warn(`[AITrans] 原生 fetch 失败, 响应码: ${res.status}, 响应内容:`, errText)
        }
      } catch (e) {
        console.error(`[AITrans] 原生 fetch 请求发生异常:`, e)
      }
    } catch (err) {
      console.warn('Internal AI request task error:', err)
    }
    return null
  }

  try {
    const finalResult = await Promise.race([requestTask(), timeoutPromise])
    if (finalResult === 'timeout') {
      console.error(`[AITrans] 大模型翻译接口调用超时 (限制 ${TIMEOUT/1000} 秒)`)
      return null
    }
    if (finalResult && !isDev) {
      countInfo.count++
      localStorage.setItem('blhxfy:ai_trans_count', JSON.stringify(countInfo))
      console.info(`[AITrans] 今日大模型翻译已累计调用 ${countInfo.count}/100 次`)
    }
    return finalResult
  } catch (err) {
    console.error(`[AITrans] 大模型请求发生未知异常:`, err)
    return null
  }
}

export default aiTrans
