import getSkillData, { skillKeys, getLocalSkillData, getCommSkillMap, saveAutoTrans } from '../store/skill-npc'
import replaceTurn from '../utils/replaceTurn'
import transBuff from './buff'
import { splitSingleLineSkill, getPlusStr, trim, replaceTextInDom } from '../utils/'
import config from '../config'
import filter from '../utils/XSSFilter'
import { fetchTranslationCache, uploadTranslationCache } from '../store/cloudCache'
import aiTrans from '../utils/aiTrans'
import { renderStoryScript } from '../story/translationUI'

const elemtRE = '([光闇水火風土無全]|light|dark|water|wind|earth|fire|plain|all)'
const elemtMap = {
  light: '光', '光': '光',
  dark: '暗', '闇': '暗',
  water: '水', '水': '水',
  wind: '风', '風': '风',
  earth: '土', '土': '土',
  fire: '火', '火': '火',
  plain: '无', '無': '无',
  all: '全', '全': '全'
}
const numRE = '(\\d{1,10}\\.?\\d{0,4}?)'
const percentRE = '(\\d{1,10}\\.?\\d{0,4}?[%％])'

// 缓存已经翻译完成的 AI 译文以供后续快速复用
const aiTranslationMemory = new Map()

const parseRegExp = (str, nounRE) => {
  return str.replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)').replace(/\$elemt/g, elemtRE)
    .replace(/\$num/g, numRE)
    .replace(/\$percent/g, percentRE)
    .replace(/\$noun/g, nounRE)
}

const transSkill = (comment, { commSkillMap, nounMap, nounRE, autoTransCache }) => {
  if (autoTransCache.has(comment)) return autoTransCache.get(comment)
  let result = comment
  if (!result) return comment
  for (let [key, value] of commSkillMap) {
    if (!trim(key)) continue
    const { trans, type } = value
    if (type === '1') {
      const re = new RegExp(parseRegExp(key, nounRE), 'gi')
      result = result.replace(re, (...arr) => {
        let _trans = trans
        for (let i = 1; i < arr.length - 2; i++) {
          let eleKey = arr[i].toLowerCase()
          if (elemtMap[eleKey]) {
            _trans = _trans.replace(`$${i}`, elemtMap[eleKey])
          } else if (nounMap.has(eleKey)) {
            _trans = _trans.replace(`$${i}`, nounMap.get(eleKey))
          } else {
            _trans = _trans.replace(`$${i}`, arr[i])
          }
        }
        return _trans
      })
    } else if (type === '2') {
      let res, i = 0
      while (res !== result && i < 10) {
        res = result
        result = result.replace(key, trans)
        i++
      }
    } else if (type === '3') {
      result = result.replace(`(${key})`, `(${trans})`)
    }
  }
  autoTransCache.set(comment, result)
  saveAutoTrans()
  return result
}

const previewSkill = (npcId) => {
  jQuery('#cnt-detail')
  .off('click.blhxfy')
  .on('click.blhxfy', '.prt-evolution-star>div:eq(1)', function () {
    const csv = window.prompt('粘贴要预览的技能翻译CSV文本')
    if (csv) {
      sessionStorage.setItem('blhxfy:skill-preview', JSON.stringify({
        id: npcId,
        csv: splitSingleLineSkill(csv)
      }))
      location.reload()
    }
  }).on('click.blhxfy', '.prt-evolution-star>div:eq(2)', function () {
    if (confirm('清除技能预览？')) {
      sessionStorage.removeItem('blhxfy:skill-preview')
      location.reload()
    }
  })
}

// 辅助方法：获取技能在 XHR 中对应的具体 ability 数据结构
const getNpcAbility = (data, key1, key2, lbState) => {
  let ability = data[key1]
  if (!ability || (Array.isArray(ability) && !ability.length)) {
    if (!data.ability) return null
    ability = data.ability[key1]
    if (!ability || (Array.isArray(ability) && !ability.length)) return null
  }

  if (key1 === 'support_ability_of_npczenith' && !Array.isArray(ability)) {
    let lbLoopCount = 0
    let abTemp = ability
    for (let _k in ability) {
      if (lbState.count <= lbLoopCount) {
        ability = ability[_k]
        lbState.count++
        break
      }
      lbLoopCount++
    }
    if (abTemp === ability) {
      return null
    }
  }

  if (key2 !== 'special' && !key2.startsWith('skill-lb')) {
    const matched = key2.match(/(\d)$/)
    const order = matched ? matched[1] : '1'
    ability = ability[order]
    if (!ability) {
      return null
    }
  }
  return ability
}

// 解析从云端获取的结构化 JSON，映射为 skillData 存储键值格式
const parseCloudNpcData = (cloudData) => {
  if (!cloudData) return null
  const map = {}

  if (cloudData.npc_name) {
    map['npc'] = { name: cloudData.npc_name }
  }

  const validIdPattern = /^(special|skill-[a-zA-Z0-9_-]+|support-[a-zA-Z0-9_-]+|intro)$/
  if (Array.isArray(cloudData.skills)) {
    // 校验所有技能的 ID 是否符合新版的合法格式，如有不合法的旧格式则判定为无效缓存
    const hasInvalidId = cloudData.skills.some(skill => !validIdPattern.test(skill.id))
    if (hasInvalidId) {
      console.warn('[CloudCache] 云端缓存中检测到旧版的技能 ID 格式，忽略此缓存以触发重新翻译。')
      return null
    }

    cloudData.skills.forEach(skill => {
      map[skill.id] = { name: skill.name || '', detail: skill.detail || '' }
    })
  }
  return map
}

// 获取技能翻译结果，支持云端映射和传统 CSV 的基于名字的映射
const getTranslation = (ability, key1, key2, skillData, changed, level) => {
  if (!skillData) return null

  // 优先匹配大模型/云端的精准 key 键名
  if (skillData[key2]) {
    return skillData[key2]
  }

  // 兼容传统静态 CSV 翻译检索
  const abilityName = changed === 'ex' ? 'ex-' + ability.name : ability.name
  const [plus1, plus2, name] = getPlusStr(abilityName)
  let trans = skillData[`skill-${abilityName}`] || skillData[`skill-${name}`]
  if (!trans) {
    trans = skillData[`special-${abilityName}`] || skillData[`special-${name}`]
    if (!trans) {
      let list = skillData[key2 + '-lv']
      list && list.forEach(item => {
        if (level && level >= item.level) {
          trans = item.data
        }
      })
      if (!trans) {
        trans = skillData[key2 + plus2]
        if (!trans && !changed) {
          trans = skillData[key2]
        }
      }
    }
  }
  return trans
}

const repalceSkillText = function(ability, key1, key2, skillData, translated, changed, level) {
  if (ability.recast_comment) {
    ability.recast_comment = replaceTurn(ability.recast_comment)
  }
  if (ability.recast_additional_comment) {
    ability.recast_additional_comment = ability.recast_additional_comment.replace('リンクアビリティで連動', 'Link技能')
  }

  let trans = getTranslation(ability, key1, key2, skillData, changed, level)
  if (!trans) return

  if (trans.name) {
    const [plus1] = getPlusStr(changed === 'ex' ? 'ex-' + ability.name : ability.name)
    ability.name = trans.name + plus1
  }
  if (trans.detail) {
    const detail = trans.detail
    const rep = new RegExp(config.defaultName, 'g')
    const uname = config.displayName || config.userName
    const text = filter(detail.replace(rep, uname))
    ability.comment = text
    translated.set(key2, true)
  }
}

// 构造用于侧边栏中日对照展示的剧本数据流
const buildSidebarList = (data, skillData, keys, skillState, translated, rawComments) => {
  const sidebarList = []

  // 1. 角色名
  const originName = data.master ? data.master.name : data.name
  let transName = originName
  if (skillData && skillData['npc'] && skillData['npc'].name) {
    transName = skillData['npc'].name
  }
  sidebarList.push({
    id: 'npc_name',
    charcter1_name: '角色名字',
    detail: transName,
    detail_origin: originName
  })

  // 2. 背景介绍
  const originIntro = data.comment
  if (originIntro) {
    let transIntro = ''
    if (skillData && skillData['intro'] && skillData['intro'].detail) {
      transIntro = skillData['intro'].detail
    }
    sidebarList.push({
      id: 'npc_intro',
      charcter1_name: '背景介绍',
      detail: transIntro,
      detail_origin: originIntro
    })
  }

  // 3. 技能、奥义及被动列表
  const lbState = { count: 0 }
  for (let item of keys) {
    const key1 = item[0]
    const key2 = item[1]
    const ability = getNpcAbility(data, key1, key2, lbState)
    if (!ability) continue

    let typeLabel = '技能'
    if (key2 === 'special') {
      typeLabel = '奥义'
    } else if (key2.startsWith('skill-lb')) {
      typeLabel = 'LB被动'
    } else if (key1 === 'support_ability') {
      typeLabel = '被动技能'
    } else if (key1 === 'ability') {
      const match = key2.match(/(\d)$/)
      typeLabel = match ? `技能 ${match[1]}` : '主动技能'
    }

    let trans = getTranslation(ability, key1, key2, skillData)
    let transDetail = ''

    if (trans && trans.detail) {
      transDetail = trans.detail
    } else if (translated.get(key2)) {
      transDetail = (ability.comment || '').replace(/<[^>]+>/g, '')
    } else {
      transDetail = transSkill(ability.comment, skillState)
    }

    let transName = (trans && trans.name) ? trans.name : ability.name
    let originComment = (rawComments && rawComments.has(key2)) ? rawComments.get(key2) : ability.comment

    sidebarList.push({
      id: key2,
      charcter1_name: `${typeLabel}: ${transName}`,
      detail: transDetail,
      detail_origin: originComment ? originComment.replace(/<[^>]+>/g, '') : ''
    })
  }

  return sidebarList
}

  // 辅助函数：根据获取到的翻译结果（来自云端或大模型），热更新页面上的所有技能描述、技能名、角色名等 DOM 节点
const hotUpdateNpcDom = (npcId, originName, originIntro, result, keys, skillState, data, rawComments, rawNames, pathname, rawRecasts, rawLinks) => {
  if (!result) return

  let skillDataCloud
  let resultSkills = []
  let resultNpcName = ''

  if (result.npc_name && Array.isArray(result.skills)) {
    skillDataCloud = parseCloudNpcData(result)
    resultSkills = result.skills
    resultNpcName = result.npc_name
  } else {
    skillDataCloud = result
    resultSkills = []
    resultNpcName = result['npc'] ? result['npc'].name : ''
  }

  if (!skillDataCloud) return

  // A. 替换角色名字
  if (originName && resultNpcName) {
    replaceTextInDom(originName, resultNpcName)
  }

  // B. 替换冷却时间（使用间隔）与 Link 技能关联说明
  if (rawRecasts) {
    rawRecasts.forEach((originRecast, key2) => {
      if (originRecast) {
        replaceTextInDom(originRecast, replaceTurn(originRecast))
      }
    })
  }
  if (rawLinks) {
    rawLinks.forEach((originLink, key2) => {
      if (originLink) {
        replaceTextInDom(originLink, originLink.replace('リンクアビリティで連動', 'Link技能'))
      }
    })
  }

  // C. 替换技能名称
  rawNames.forEach((originSkillName, key2) => {
    const trans = skillDataCloud[key2]
    if (trans && trans.name && originSkillName) {
      replaceTextInDom(originSkillName, trans.name)
    }
  })

  // D. 仅在非安全模式下，通过包裹的 span 节点热更新技能描述（安全模式依靠侧栏或在未来进行文本定位）
  if (!config.safeMode) {
    resultSkills.forEach(skill => {
      if (skill.id !== 'intro') {
        const els = document.querySelectorAll(`.blhxfy-temp-skill[data-npc-id="${npcId}"][data-skill-id="${skill.id}"]`)
        els.forEach(el => {
          el.innerHTML = filter(skill.detail)
        })
      }
    })
  }

  // 2. 构造最新完整对照表并刷新侧边栏
  const updatedSidebarList = buildSidebarList(data, skillDataCloud, keys, skillState, new Map(), rawComments)
  renderStoryScript(pathname, updatedSidebarList)
}

// 异步 AI 翻译及 DOM 热更新、KV 缓存上传函数
const runAiSkillTransAsync = async (npcId, originName, originIntro, pathname, keys, skillState, data, rawComments, rawNames, rawRecasts, rawLinks) => {
  const sceneName = `skill_npc_${npcId}`

  // A. 查内存缓存
  if (aiTranslationMemory.has(npcId)) {
    const memoryResult = aiTranslationMemory.get(npcId)
    console.info(`[AITrans] NPC ${npcId} 命中内存翻译缓存`)
    setTimeout(() => {
      hotUpdateNpcDom(npcId, originName, originIntro, memoryResult, keys, skillState, data, rawComments, rawNames, pathname, rawRecasts, rawLinks)
    }, 150)
    return
  }

  // B. 查云端共享缓存
  const cloudCacheMap = await fetchTranslationCache(sceneName)
  if (cloudCacheMap) {
    const cloudData = {
      npc_name: cloudCacheMap.get('npc_name'),
      skills: cloudCacheMap.get('skills')
    }
    const skillDataCloud = parseCloudNpcData(cloudData)
    if (skillDataCloud) {
      console.info(`[CloudCache] 云端缓存有效命中，准备应用`)
      aiTranslationMemory.set(npcId, cloudData)
      setTimeout(() => {
        hotUpdateNpcDom(npcId, originName, originIntro, cloudData, keys, skillState, data, rawComments, rawNames, pathname, rawRecasts, rawLinks)
      }, 150)
      return
    }
  }

  // C. 内存与云端全未命中：进行大模型异步翻译
  if (config.aiTrans && config.aiApiKey) {
    console.info(`[AITrans] 准备为 NPC ${npcId} 异步调用大模型翻译`)
    const skillsForAi = []
    if (originIntro) {
      skillsForAi.push({
        id: 'intro',
        name: '紹介',
        detail: originIntro
      })
    }

    rawComments.forEach((comment, key2) => {
      const originNameStr = rawNames.get(key2) || ''
      skillsForAi.push({
        id: key2,
        name: originNameStr,
        detail: comment
      })
    })

    const inputJson = {
      npc_name: originName,
      skills: skillsForAi
    }

    try {
      const result = await aiTrans(JSON.stringify(inputJson), null, 'skill')
      if (result && result.npc_name && Array.isArray(result.skills)) {
        console.info(`[AITrans] NPC ${npcId} 异步翻译成功返回`, result)

        aiTranslationMemory.set(npcId, result)
        setTimeout(() => {
          hotUpdateNpcDom(npcId, originName, originIntro, result, keys, skillState, data, rawComments, rawNames, pathname, rawRecasts, rawLinks)
        }, 150)

        // 上传到云端缓存
        await uploadTranslationCache(sceneName, result)
      } else {
        console.warn(`[AITrans] 异步大模型翻译返回的数据结构异常`, result)
      }
    } catch (err) {
      console.error(`[AITrans] 异步大模型翻译发生异常:`, err)
    }
  }
}

const parseSkill = async (data, pathname) => {
  console.error("[blhxfy-npc] parseSkill called!", pathname);
  console.log("[blhxfy-npc] raw npc data:", JSON.stringify(data));
  if (Game.lang === 'en') return data
  let npcId
  let level
  if (pathname.includes('/npc/npc/')) {
    if (!data.master || !data.master.id) return data
    npcId = `${data.master.id}`
    level = data.param.level
  } else if (pathname.includes('/archive/npc_detail')) {
    if (!data.id) return data
    npcId = data.id
    level = data.max_level
  }

  previewSkill(npcId)

  let skillState = getLocalSkillData(npcId)
  if (!skillState) {
    skillState = await getSkillData(npcId)
  }
  let skillDataLocal = skillState ? skillState.skillMap.get(npcId) : null
  const keys = skillState ? skillState.skillKeys : []
  const translated = new Map()

  // 若本地静态 CSV 不存在，但内存中已有大模型翻译缓存，则直接提取并进行同步数据替换
  if (!skillDataLocal && aiTranslationMemory.has(npcId)) {
    const memoryResult = aiTranslationMemory.get(npcId)
    skillDataLocal = parseCloudNpcData(memoryResult)
  }

  // 收集原始名字、描述、冷却时间及Link关联，供安全模式和普通模式 DOM 替换使用
  const originName = data.master ? data.master.name : data.name
  const originIntro = data.comment
  const rawComments = new Map()
  const rawNames = new Map()
  const rawRecasts = new Map()
  const rawLinks = new Map()

  let lbCountTemp = 0
  for (let item of keys) {
    const key1 = item[0]
    const key2 = item[1]
    const ability = getNpcAbility(data, key1, key2, { count: lbCountTemp })
    if (!ability) continue
    rawComments.set(key2, ability.comment || '')
    rawNames.set(key2, ability.name || '')
    rawRecasts.set(key2, ability.recast_comment || '')
    rawLinks.set(key2, ability.recast_additional_comment || '')
  }

  // 2. 若存在本地静态 CSV 数据 或 内存大模型翻译缓存
  if (skillDataLocal) {
    if (!config.safeMode) {
      let lbCount = 0
      for (let item of keys) {
        const key1 = item[0]
        const key2 = item[1]
        const ability = getNpcAbility(data, key1, key2, { count: lbCount })
        if (!ability) continue

        await transBuff(ability.ability_detail).catch(() => {})

        const extraSkillKeys = ['display_action_ability_info', 'form_change_display_action_ability_info', 'select_display_action_ability_info']
        for (let extraKey of extraSkillKeys) {
          if (ability[extraKey] && ability[extraKey].action_ability) {
            const changedSkills = ability[extraKey].action_ability
            for (let changedItem of changedSkills) {
              await transBuff(changedItem.ability_detail).catch(() => {})
              if (changedItem.action_id !== ability.action_id) {
                if (changedItem.name === ability.name) {
                  repalceSkillText(changedItem, key1, key2, skillDataLocal, translated, 'ex', level)
                } else {
                  repalceSkillText(changedItem, key1, key2, skillDataLocal, translated, 'changed', level)
                }
              } else {
                repalceSkillText(changedItem, key1, key2, skillDataLocal, translated, null, level)
              }
            }
          }
        }

        repalceSkillText(ability, key1, key2, skillDataLocal, translated, null, level)
      }

      // 翻译角色名字和背景介绍
      if (data.master) {
        const trans = skillDataLocal['npc']
        if (trans && trans.name) {
          data.master.name = trans.name
          if (data.master.short_name === data.master.name) {
            data.master.short_name = trans.name
          }
          const intro = skillDataLocal['intro']
          if (intro && intro.name) data.master.evo_name = `[${intro.name}]${trans.name}`
        }
      } else if (data.name) {
        const trans = skillDataLocal['npc']
        if (trans && trans.name) {
          data.name = trans.name
          const intro = skillDataLocal['intro']
          if (intro && intro.name) data.evo_name = `[${intro.name}]${trans.name}`
        }
      }
      if (data.comment) {
        const trans = skillDataLocal['intro']
        if (trans && trans.detail) data.comment = trans.detail
      }

      await getCommSkillMap()
      keys.forEach(item => {
        if (!translated.get(item[1])) {
          const skill = getNpcAbility(data, item[0], item[1], { count: 0 })
          if (skill) {
            skill.comment = transSkill(skill.comment, skillState)
          }
        }
      })

      // 渲染侧栏对照展示
      const sidebarList = buildSidebarList(data, skillDataLocal, keys, skillState, translated)
      renderStoryScript(pathname, sidebarList)
    } else {
      // 安全模式：不修改 XHR 的 data，渲染侧栏，并在 150ms 延时后进行安全的 DOM 热汉化
      const sidebarList = buildSidebarList(data, skillDataLocal, keys, skillState, translated)
      renderStoryScript(pathname, sidebarList)

      setTimeout(() => {
        hotUpdateNpcDom(npcId, originName, originIntro, skillDataLocal, keys, skillState, data, rawComments, rawNames, pathname, rawRecasts, rawLinks)
      }, 150)
    }

    return data
  }

  // 3. 若本地 CSV 不存在：异步流程 (合并云端与大模型翻译)
  await getCommSkillMap()

  // A. 在 XHR 数据包交付前，完成保底先行（在普通模式下包裹 span 注入翻译）
  if (!config.safeMode) {
    let lbCount = 0
    for (let item of keys) {
      const key1 = item[0]
      const key2 = item[1]
      const ability = getNpcAbility(data, key1, key2, { count: lbCount })
      if (!ability) continue

      await transBuff(ability.ability_detail).catch(() => {})

      const transResult = transSkill(ability.comment || '', skillState)
      ability.comment = `<span class="blhxfy-temp-skill" data-npc-id="${npcId}" data-skill-id="${key2}">${transResult}</span>`
      translated.set(key2, true)
    }
  }

  // 渲染初始对照至侧边栏（此时使用正则翻译作为显示）
  const initialSidebarList = buildSidebarList(data, null, keys, skillState, translated, rawComments)
  renderStoryScript(pathname, initialSidebarList)

  // 异步加载流程
  runAiSkillTransAsync(npcId, originName, originIntro, pathname, keys, skillState, data, rawComments, rawNames, rawRecasts, rawLinks)

  return data
}

export { transSkill }
export default parseSkill
