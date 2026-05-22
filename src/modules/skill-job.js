import getSkillData from '../store/skill-job'
import replaceTurn from '../utils/replaceTurn'
import transBuff from './buff'
import config from '../config'
import { replaceTextInDom } from '../utils'
import { renderStoryScript } from '../story/translationUI'

const startTrans = async (data, domPairs, sidebarList, typeLabel) => {
  for (let key in data) {
    if (data[key]) {
      const trans = await getSkillData(data[key].action_id)
      const ability = data[key]
      
      let transName = ability.name
      let transDetail = ability.comment

      if (trans) {
        transName = trans.name
        transDetail = trans.detail
        if (config.safeMode) {
          if (ability.name && trans.name) {
            domPairs.push({ from: ability.name, to: trans.name })
          }
          if (ability.comment && trans.detail) {
            domPairs.push({ from: ability.comment, to: trans.detail })
          }
        } else {
          ability.name = trans.name
          ability.comment = trans.detail
        }
      }
      
      let recastStr = ''
      let turnStr = ''
      let recastOrigin = ''
      let turnOrigin = ''

      if (ability.recast_comment) {
        recastOrigin = ability.recast_comment
        const transRecast = replaceTurn(ability.recast_comment)
        recastStr = transRecast
        if (config.safeMode) {
          domPairs.push({ from: ability.recast_comment, to: transRecast })
        } else {
          ability.recast_comment = transRecast
        }
      }
      if (ability.turn_comment) {
        turnOrigin = ability.turn_comment
        const transTurn = replaceTurn(ability.turn_comment)
        turnStr = transTurn
        if (config.safeMode) {
          domPairs.push({ from: ability.turn_comment, to: transTurn })
        } else {
          ability.turn_comment = transTurn
        }
      }
      if (ability.ability_detail) {
        await transBuff(ability.ability_detail).catch(() => {})
      }

      // 添加到侧边栏对照列表
      let sidebarDetail = transDetail || ''
      if (recastStr) sidebarDetail += ` | 使用间隔: ${recastStr}`
      if (turnStr) sidebarDetail += ` | 持续效果: ${turnStr}`

      let sidebarOrigin = ability.comment || ''
      if (recastOrigin) sidebarOrigin += ` | ${recastOrigin}`
      if (turnOrigin) sidebarOrigin += ` | ${turnOrigin}`

      sidebarList.push({
        id: ability.action_id || key,
        charcter1_name: `${typeLabel}: ${transName}`,
        detail: sidebarDetail,
        detail_origin: sidebarOrigin
      })
    }
  }
  return data
}

const replaceSkill = async (data, domPairs, sidebarList) => {
  if (data.ability) {
    data.ability = await startTrans(data.ability, domPairs, sidebarList, '主动技能')
  }
  if (data.support_ability) {
    data.support_ability = await startTrans(data.support_ability, domPairs, sidebarList, '被动技能')
  }
  return data
}

const transSkill = async (data, pathname) => {
  if (!data) return data
  const domPairs = []
  const sidebarList = []

  if (/\/party\/job_equipped\/\d+/.test(pathname)) {
    if (data.job) {
      data.job = await replaceSkill(data.job, domPairs, sidebarList)
    }
  } else if (pathname.includes('/party_ability_subaction/')) {
    if (data.list) {
      data.list = await startTrans(data.list, domPairs, sidebarList, '技能列表')
    }
  } else if (/\/party\/ability_list\/\d+\//.test(pathname)) {
    data = await replaceSkill(data, domPairs, sidebarList)
  } else if (/\/party\/job_info\/\d+\//.test(pathname)) {
    if (data.after_job_master) {
      data.after_job_master = await replaceSkill(data.after_job_master, domPairs, sidebarList)
    }
    if (data.before_job_info) {
      data.before_job_info = await replaceSkill(data.before_job_info, domPairs, sidebarList)
    }
  } else if (/\/zenith\/ability_list\/\d+/.test(pathname)) {
    if (data.ability_list) {
      data.ability_list = await startTrans(data.ability_list, domPairs, sidebarList, '限界技能')
    }
  }

  if (sidebarList.length > 0) {
    console.info('[BLHXFY] Job skill processed. Path:', pathname, 'List:', sidebarList)
    renderStoryScript(pathname, sidebarList)
  }

  if (config.safeMode && domPairs.length > 0) {
    setTimeout(() => {
      domPairs.forEach(pair => {
        replaceTextInDom(pair.from, pair.to)
      })
    }, 150)
  }

  return data
}

export default transSkill


