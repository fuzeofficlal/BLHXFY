import { transSkill } from "./skill-npc";
import { getCommSkillMap, skillState } from '../store/skill-npc'
import config from '../config'
import { replaceTextInDom } from '../utils'
import { renderStoryScript } from '../story/translationUI'

const weaponSkill = async (data, pathname) => {
  if (!data) return data
  await getCommSkillMap()
  const domPairs = []
  const sidebarList = []

  if (data.name) {
    sidebarList.push({
      id: 'weapon_name',
      charcter1_name: '武器名字',
      detail: data.name,
      detail_origin: data.name
    })
  }

  const processSkill = (skill, typeLabel) => {
    if (!skill || !skill.comment) return
    const trans = transSkill(skill.comment, skillState)
    
    sidebarList.push({
      id: typeLabel,
      charcter1_name: `${typeLabel}: ${skill.name || ''}`,
      detail: trans || skill.comment,
      detail_origin: skill.comment
    })

    if (trans) {
      if (config.safeMode) {
        domPairs.push({ from: skill.comment, to: trans })
      } else {
        skill.comment = trans
      }
    }
  }

  if (data.skill1) {
    processSkill(data.skill1, '第一技能')
  }
  if (data.skill2) {
    processSkill(data.skill2, '第二技能')
  }
  if (data.special_skill) {
    processSkill(data.special_skill, '奥义技能')
  }

  if (sidebarList.length > 0) {
    console.info('[BLHXFY] Weapon skill processed. Path:', pathname, 'List:', sidebarList)
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

export default weaponSkill


