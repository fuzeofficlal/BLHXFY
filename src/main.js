import injectXHR from './xhr'
import eventMessage from './utils/eventMessage'
import CONFIG from './config'
import { toggleSidebar } from './story/translationUI'

const main = () => {
  injectXHR()
}

const init = () => {
  eventMessage()

  const win = window.unsafeWindow || window
  win.blhxfy || (win.blhxfy = {})
  win.blhxfy.toggleSidebar = toggleSidebar
  win.blhxfy.config = CONFIG
  // 根据记忆状态决定初始是否打开侧边栏
  const savedOpen = localStorage.getItem('blhxfy:sidebarOpen')
  toggleSidebar(savedOpen === '1')

  if (!CONFIG.storyOnly) {
    main()
  } else {
    let started = false
    const start = () => {
      if (!started) {
        started = true
        main()
        observer.disconnect()
      }
    }

    const mutationCallback = (mutationsList) => {
      for (let mutation of mutationsList) {
        const type = mutation.type
        const addedNodes = mutation.addedNodes
        if (type === 'childList' && addedNodes.length && addedNodes.length < 2) {
          addedNodes.forEach(node => {
            if (node.tagName.toUpperCase() === 'SCRIPT' && node.src.includes('scenario-model')) {
              start()
            }
          })
        }
      }
    }

    const obConfig = {
      childList: true
    }

    const targetNode = document.head || document.documentElement
    const observer = new MutationObserver(mutationCallback)
    if (targetNode && typeof targetNode.nodeType === 'number') {
      observer.observe(targetNode, obConfig)
    }
  }
}

let win = (window.unsafeWindow || window)
if (win.document.readyState != 'loading') {
  init()
} else {
  win.addEventListener('DOMContentLoaded', init)
}