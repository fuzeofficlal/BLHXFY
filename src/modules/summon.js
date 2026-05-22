import { transSkill } from "./skill-npc";
import { getCommSkillMap, skillState } from '../store/skill-npc'
import replaceTurn from '../utils/replaceTurn'
import config from '../config'
import { replaceTextInDom } from '../utils'
import { renderStoryScript } from '../story/translationUI'

const processSkill = (skill, typeLabel, isCall, domPairs, sidebarList) => {
  if (!skill || !skill.comment) return
  const trans = transSkill(skill.comment, skillState)
  
  let recastStr = ''
  let startRecastStr = ''
  let recastOrigin = ''
  let startRecastOrigin = ''

  if (isCall) {
    if (skill.recast_comment) {
      recastOrigin = skill.recast_comment
      const transRecast = replaceTurn(skill.recast_comment)
      recastStr = transRecast
      if (config.safeMode) {
        domPairs.push({ from: skill.recast_comment, to: transRecast })
      } else {
        skill.recast_comment = transRecast
      }
    }
    if (skill.start_recast_comment) {
      startRecastOrigin = skill.start_recast_comment
      const transStartRecast = replaceTurn(skill.start_recast_comment)
      startRecastStr = transStartRecast
      if (config.safeMode) {
        domPairs.push({ from: skill.start_recast_comment, to: transStartRecast })
      } else {
        skill.start_recast_comment = transStartRecast
      }
    }
  }

  if (trans) {
    if (config.safeMode) {
      domPairs.push({ from: skill.comment, to: trans })
    } else {
      skill.comment = trans
    }
  }

  // 拼接展示文本，带上使用间隔等
  let sidebarDetail = trans || skill.comment || ''
  if (recastStr) sidebarDetail += ` | 使用间隔: ${recastStr}`
  if (startRecastStr) sidebarDetail += ` | 开场使用间隔: ${startRecastStr}`

  let sidebarOrigin = skill.comment || ''
  if (recastOrigin) sidebarOrigin += ` | ${recastOrigin}`
  if (startRecastOrigin) sidebarOrigin += ` | ${startRecastOrigin}`

  sidebarList.push({
    id: typeLabel,
    charcter1_name: `${typeLabel}: ${skill.name || ''}`,
    detail: sidebarDetail,
    detail_origin: sidebarOrigin
  })
}

const summonSkill = async (data, pathname) => {
  if (!data) return data
  await getCommSkillMap()
  const domPairs = []
  const sidebarList = []

  if (data.name) {
    sidebarList.push({
      id: 'summon_name',
      charcter1_name: '召唤石名字',
      detail: data.name,
      detail_origin: data.name
    })
  }

  if (data.skill) {
    processSkill(data.skill, '主加护', false, domPairs, sidebarList)
  }
  if (data.sub_skill) {
    processSkill(data.sub_skill, 'Sub加护', false, domPairs, sidebarList)
  }
  if (data.special_skill) {
    processSkill(data.special_skill, '召唤效果', true, domPairs, sidebarList)
  }

  if (sidebarList.length > 0) {
    console.info('[BLHXFY] Summon skill processed. Path:', pathname, 'List:', sidebarList)
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

export default summonSkill

