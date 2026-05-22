import CONFIG from '../config'

let container = null
let sidebarEl = null
let toggleBtn = null
let listEl = null
let settingsEl = null
let observer = null
let currentView = 'script'

// 用于保存当前渲染在侧边栏的剧情数据
// 格式: [{ id, name, text, trans }]
let currentScript = []
// 记录上一次被高亮激活的行索引
let lastActiveIndex = -1

// 注入毛玻璃和主题相关的 CSS 样式
const injectStyle = () => {
  if (document.getElementById('blhxfy-ui-style')) return

  const style = document.createElement('style')
  style.id = 'blhxfy-ui-style'
  style.innerHTML = `
    /* 翻译面板容器 */
    .blhxfy-sidebar-container {
      position: fixed;
      top: 0;
      right: 0;
      width: 360px;
      height: 100%;
      z-index: 999999;
      pointer-events: none;
      font-family: 'Inter', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
    }

    /* 侧边栏主体 */
    .blhxfy-sidebar {
      position: absolute;
      top: 0;
      right: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 30px rgba(0, 0, 0, 0.4);
      transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1);
      transform: translateX(100%);
      pointer-events: auto;
      box-sizing: border-box;
    }

    /* 主题风格 */
    .blhxfy-sidebar.theme-glass {
      background: rgba(18, 22, 28, 0.72);
      backdrop-filter: blur(20px) saturate(180%);
      border-left: 1px solid rgba(255, 255, 255, 0.08);
    }
    
    .blhxfy-sidebar.theme-dark {
      background: #141820;
      border-left: 1px solid #232a36;
    }

    .blhxfy-sidebar.active {
      transform: translateX(0);
    }

    /* 侧边栏头部 */
    .blhxfy-sidebar-header {
      padding: 18px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .blhxfy-sidebar-title {
      font-size: 16px;
      font-weight: 600;
      color: #e2e8f0;
      margin: 0;
      letter-spacing: 0.5px;
    }

    .blhxfy-sidebar-close {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
      border-radius: 4px;
      transition: background 0.2s, color 0.2s;
    }

    .blhxfy-sidebar-close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #f1f5f9;
    }

    /* 剧本列表区域 */
    .blhxfy-sidebar-list {
      flex: 1;
      overflow-y: auto;
      padding: 15px 20px;
      scroll-behavior: smooth;
    }

    .blhxfy-sidebar-list::-webkit-scrollbar {
      width: 6px;
    }
    .blhxfy-sidebar-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
    }
    .blhxfy-sidebar-list::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    /* 对话卡片 */
    .blhxfy-dialogue-card {
      margin-bottom: 16px;
      padding: 12px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.03);
      transition: all 0.3s ease;
      transform: scale(0.98);
      opacity: 0.75;
    }

    .blhxfy-dialogue-card:hover {
      background: rgba(255, 255, 255, 0.04);
      opacity: 0.95;
    }

    .blhxfy-dialogue-card.active-line {
      background: rgba(59, 130, 246, 0.12);
      border-color: rgba(59, 130, 246, 0.3);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
      opacity: 1;
      transform: scale(1);
    }

    .blhxfy-char-name {
      font-size: 12px;
      font-weight: 700;
      color: #60a5fa;
      margin-bottom: 6px;
    }

    .blhxfy-trans-text {
      font-size: 14px;
      color: #f8fafc;
      line-height: 1.5;
      word-break: break-all;
    }

    .blhxfy-origin-sub {
      font-size: 11px;
      color: #64748b;
      margin-top: 6px;
      border-top: 1px dashed rgba(255, 255, 255, 0.05);
      padding-top: 4px;
      word-break: break-all;
      display: none;
    }

    .blhxfy-sidebar-list.show-origin .blhxfy-origin-sub {
      display: block;
    }

    /* 悬浮切换按钮 */
    .blhxfy-toggle-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 48px;
      height: 48px;
      border-radius: 24px;
      background: #3b82f6;
      border: none;
      color: #fff;
      font-size: 18px;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 999998;
    }

    .blhxfy-toggle-btn:hover {
      transform: scale(1.1);
      background: #2563eb;
      box-shadow: 0 6px 20px rgba(59, 130, 246, 0.6);
    }

    .blhxfy-toggle-btn.active {
      transform: rotate(180deg);
      background: #ef4444;
      box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
    }

    /* 适配 Overlay 悬浮弹窗布局 */
    .blhxfy-sidebar.layout-overlay {
      top: auto;
      bottom: 80px;
      right: 20px;
      width: 380px;
      height: 420px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .blhxfy-sidebar.layout-overlay.theme-glass {
      background: rgba(15, 23, 42, 0.8);
    }

    .blhxfy-sidebar.layout-overlay.theme-dark {
      background: #1e293b;
    }

    /* 设置视图容器 */
    .blhxfy-sidebar-settings {
      flex: 1;
      overflow-y: auto;
      padding: 15px 20px;
      display: none;
      box-sizing: border-box;
    }
    .blhxfy-sidebar-settings::-webkit-scrollbar {
      width: 6px;
    }
    .blhxfy-sidebar-settings::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
    }
    .blhxfy-sidebar-settings::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    
    .blhxfy-settings-group {
      margin-bottom: 20px;
      box-sizing: border-box;
    }
    
    .blhxfy-settings-group-title {
      font-size: 13px;
      font-weight: 600;
      color: #60a5fa;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px dashed rgba(96, 165, 250, 0.3);
      padding-bottom: 6px;
    }
    
    .blhxfy-settings-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      box-sizing: border-box;
      gap: 10px;
    }
    
    .blhxfy-settings-item-label {
      font-size: 13px;
      color: #e2e8f0;
    }
    
    .blhxfy-settings-item-desc {
      font-size: 11px;
      color: #94a3b8;
      margin-top: -8px;
      margin-bottom: 12px;
      padding: 0 4px;
      line-height: 1.4;
    }
    
    /* 开关控件 */
    .blhxfy-switch {
      position: relative;
      display: inline-block;
      width: 42px;
      height: 22px;
      flex-shrink: 0;
    }
    
    .blhxfy-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    
    .blhxfy-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(255, 255, 255, 0.12);
      transition: .3s;
      border-radius: 22px;
    }
    
    .blhxfy-slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: #fff;
      transition: .3s;
      border-radius: 50%;
    }
    
    .blhxfy-switch input:checked + .blhxfy-slider {
      background-color: #3b82f6;
    }
    
    .blhxfy-switch input:checked + .blhxfy-slider:before {
      transform: translateX(20px);
    }
    
    .blhxfy-select {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #f1f5f9;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 12px;
      outline: none;
      transition: border-color 0.2s;
      cursor: pointer;
      max-width: 180px;
    }
    
    .blhxfy-select:focus {
      border-color: #3b82f6;
    }
    
    .blhxfy-input {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #f1f5f9;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 12px;
      width: 160px;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }
    
    .blhxfy-input:focus {
      border-color: #3b82f6;
    }
    
    /* 底部按钮 */
    .blhxfy-settings-footer {
      padding: 15px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      gap: 12px;
      background: rgba(0, 0, 0, 0.15);
    }
    
    .blhxfy-btn {
      flex: 1;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-align: center;
      transition: all 0.2s;
    }
    
    .blhxfy-btn-primary {
      background: #3b82f6;
      color: #fff;
    }
    .blhxfy-btn-primary:hover {
      background: #2563eb;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
    
    .blhxfy-btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .blhxfy-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }
  `;
  document.head.appendChild(style);
}

// 切换侧边栏视图 (剧本流 vs 插件设置)
const switchView = (view) => {
  const title = sidebarEl.querySelector('.blhxfy-sidebar-title')
  const settingBtn = sidebarEl.querySelector('#blhxfy-set-toggle-btn')
  
  if (view === 'settings') {
    currentView = 'settings'
    if (title) title.textContent = 'BLHXFY 插件设置'
    if (settingBtn) {
      settingBtn.innerHTML = '⬅'
      settingBtn.title = '返回剧本'
    }
    listEl.style.display = 'none'
    settingsEl.style.display = 'block'
    updateSettingsFields()
  } else {
    currentView = 'script'
    if (title) title.textContent = 'BLHXFY 汉化剧本流'
    if (settingBtn) {
      settingBtn.innerHTML = '⚙'
      settingBtn.title = '插件设置'
    }
    listEl.style.display = 'block'
    settingsEl.style.display = 'none'
  }
}

// 同步本地设置的值到表单元素
const updateSettingsFields = () => {
  if (!settingsEl) return
  settingsEl.querySelector('#blhxfy-set-safeMode').checked = CONFIG.safeMode
  settingsEl.querySelector('#blhxfy-set-storyOnly').checked = CONFIG.storyOnly
  settingsEl.querySelector('#blhxfy-set-uiLayout').value = CONFIG.uiLayout || 'sidebar'
  settingsEl.querySelector('#blhxfy-set-uiTheme').value = CONFIG.uiTheme || 'glass'
  settingsEl.querySelector('#blhxfy-set-uiFontSize').value = CONFIG.uiFontSize || '16px'
  settingsEl.querySelector('#blhxfy-set-aiTrans').checked = CONFIG.aiTrans
  settingsEl.querySelector('#blhxfy-set-llmProvider').value = CONFIG.llmProvider || 'custom'
  settingsEl.querySelector('#blhxfy-set-aiApiKey').value = CONFIG.aiApiKey || ''
  settingsEl.querySelector('#blhxfy-set-aiApiEndpoint').value = CONFIG.aiApiEndpoint || ''
  settingsEl.querySelector('#blhxfy-set-aiModel').value = CONFIG.aiModel || ''
  settingsEl.querySelector('#blhxfy-set-traditionalTrans').checked = CONFIG.traditionalTrans
  settingsEl.querySelector('#blhxfy-set-originText').checked = CONFIG.originText
  settingsEl.querySelector('#blhxfy-set-showTranslator').checked = CONFIG.showTranslator

  // AI 设置面板的显隐
  settingsEl.querySelector('#blhxfy-set-group-ai').style.display = CONFIG.aiTrans ? 'block' : 'none'
}

// 创建并初始化 UI 节点
const initUI = () => {
  if (container) return

  injectStyle()

  container = document.createElement('div')
  container.className = 'blhxfy-sidebar-container'

  // 创建侧边栏
  sidebarEl = document.createElement('div')
  sidebarEl.className = `blhxfy-sidebar theme-${CONFIG.uiTheme} layout-${CONFIG.uiLayout}`
  
  const header = document.createElement('div')
  header.className = 'blhxfy-sidebar-header'

  const title = document.createElement('h3')
  title.className = 'blhxfy-sidebar-title'
  title.textContent = 'BLHXFY 汉化剧本流'

  const headerRight = document.createElement('div')
  headerRight.style.display = 'flex'
  headerRight.style.alignItems = 'center'
  headerRight.style.gap = '10px'

  const settingBtn = document.createElement('button')
  settingBtn.className = 'blhxfy-sidebar-close'
  settingBtn.id = 'blhxfy-set-toggle-btn'
  settingBtn.innerHTML = '⚙'
  settingBtn.title = '插件设置'
  settingBtn.style.fontSize = '16px'
  settingBtn.style.lineHeight = '1'
  settingBtn.onclick = () => {
    if (currentView === 'script') {
      switchView('settings')
    } else {
      switchView('script')
    }
  }

  const closeBtn = document.createElement('button')
  closeBtn.className = 'blhxfy-sidebar-close'
  closeBtn.innerHTML = '&times;'
  closeBtn.onclick = () => toggleSidebar(false)

  headerRight.appendChild(settingBtn)
  headerRight.appendChild(closeBtn)

  header.appendChild(title)
  header.appendChild(headerRight)

  listEl = document.createElement('div')
  listEl.className = 'blhxfy-sidebar-list'
  if (CONFIG.originText) {
    listEl.classList.add('show-origin')
  }
  if (CONFIG.uiFontSize) {
    listEl.style.fontSize = CONFIG.uiFontSize
  }

  // 创建内嵌设置区域
  settingsEl = document.createElement('div')
  settingsEl.className = 'blhxfy-sidebar-settings'
  settingsEl.innerHTML = `
    <!-- 核心模式 -->
    <div class="blhxfy-settings-group">
      <div class="blhxfy-settings-group-title">核心设置</div>
      <div class="blhxfy-settings-item">
        <span class="blhxfy-settings-item-label">安全汉化模式</span>
        <label class="blhxfy-switch">
          <input type="checkbox" id="blhxfy-set-safeMode">
          <span class="blhxfy-slider"></span>
        </label>
      </div>
      <div class="blhxfy-settings-item-desc">启用后不拦截与篡改任何游戏敏感数据包，仅通过侧边栏安全展示剧情汉化，彻底免疫封号。</div>
      
      <div class="blhxfy-settings-item">
        <span class="blhxfy-settings-item-label">仅翻译剧情内容</span>
        <label class="blhxfy-switch">
          <input type="checkbox" id="blhxfy-set-storyOnly">
          <span class="blhxfy-slider"></span>
        </label>
      </div>
    </div>

    <!-- 面板外观 -->
    <div class="blhxfy-settings-group">
      <div class="blhxfy-settings-group-title">侧边栏外观</div>
      <div class="blhxfy-settings-item">
        <span class="blhxfy-settings-item-label">面板布局样式</span>
        <select id="blhxfy-set-uiLayout" class="blhxfy-select">
          <option value="sidebar">右侧侧边栏</option>
          <option value="overlay">悬浮小弹窗</option>
        </select>
      </div>
      <div class="blhxfy-settings-item">
        <span class="blhxfy-settings-item-label">面板背景主题</span>
        <select id="blhxfy-set-uiTheme" class="blhxfy-select">
          <option value="glass">毛玻璃古典</option>
          <option value="dark">纯深色石板</option>
        </select>
      </div>
      <div class="blhxfy-settings-item">
        <span class="blhxfy-settings-item-label">剧本字体大小</span>
        <input type="text" id="blhxfy-set-uiFontSize" class="blhxfy-input" placeholder="16px">
      </div>
    </div>

    <!-- AI/机翻接口设置 -->
    <div class="blhxfy-settings-group">
      <div class="blhxfy-settings-group-title">大语言模型机翻 (AI)</div>
      <div class="blhxfy-settings-item">
        <span class="blhxfy-settings-item-label">启用 AI 自动翻译</span>
        <label class="blhxfy-switch">
          <input type="checkbox" id="blhxfy-set-aiTrans">
          <span class="blhxfy-slider"></span>
        </label>
      </div>
      <div class="blhxfy-settings-item-desc">未汉化场景下自动调用 LLM API 进行翻译，支持流式卡片渲染。</div>

      <div id="blhxfy-set-group-ai" style="display: none; padding-left: 8px; border-left: 2px solid #b19453; margin-bottom: 12px;">
        <div class="blhxfy-settings-item">
          <span class="blhxfy-settings-item-label">AI 服务商</span>
          <select id="blhxfy-set-llmProvider" class="blhxfy-select">
            <option value="custom">自定义 (OpenAI格式)</option>
            <option value="openai">OpenAI 官方</option>
            <option value="anthropic">Claude (Anthropic)</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>
        <div class="blhxfy-settings-item">
          <span class="blhxfy-settings-item-label">API 密钥 (Key)</span>
          <input type="password" id="blhxfy-set-aiApiKey" class="blhxfy-input" placeholder="sk-...">
        </div>
        <div class="blhxfy-settings-item">
          <span class="blhxfy-settings-item-label">API 接口地址</span>
          <input type="text" id="blhxfy-set-aiApiEndpoint" class="blhxfy-input" placeholder="https://api.openai.com/v1">
        </div>
        <div class="blhxfy-settings-item">
          <span class="blhxfy-settings-item-label">接口模型名称</span>
          <input type="text" id="blhxfy-set-aiModel" class="blhxfy-input" placeholder="gpt-4o">
        </div>
      </div>

      <div class="blhxfy-settings-item">
        <span class="blhxfy-settings-item-label">传统日中机翻</span>
        <label class="blhxfy-switch">
          <input type="checkbox" id="blhxfy-set-traditionalTrans">
          <span class="blhxfy-slider"></span>
        </label>
      </div>
      <div class="blhxfy-settings-item-desc">未汉化时调用彩云小译接口。</div>
    </div>

    <!-- 辅助设置 -->
    <div class="blhxfy-settings-group">
      <div class="blhxfy-settings-group-title">剧本对照与信息</div>
      <div class="blhxfy-settings-item">
        <span class="blhxfy-settings-item-label">剧情原文对照</span>
        <label class="blhxfy-switch">
          <input type="checkbox" id="blhxfy-set-originText">
          <span class="blhxfy-slider"></span>
        </label>
      </div>
      <div class="blhxfy-settings-item">
        <span class="blhxfy-settings-item-label">显示汉化译者</span>
        <label class="blhxfy-switch">
          <input type="checkbox" id="blhxfy-set-showTranslator">
          <span class="blhxfy-slider"></span>
        </label>
      </div>
    </div>


    <!-- 底部操作按钮 -->
    <div class="blhxfy-settings-footer">
      <button class="blhxfy-btn blhxfy-btn-secondary" id="blhxfy-set-btn-back">返回剧本</button>
      <button class="blhxfy-btn blhxfy-btn-primary" id="blhxfy-set-btn-save">保存并重载</button>
    </div>
  `;

  sidebarEl.appendChild(header)
  sidebarEl.appendChild(listEl)
  sidebarEl.appendChild(settingsEl)

  // 创建悬浮开关按钮
  toggleBtn = document.createElement('button')
  toggleBtn.className = 'blhxfy-toggle-btn'
  toggleBtn.innerHTML = '译'
  toggleBtn.onclick = () => toggleSidebar()

  container.appendChild(sidebarEl)
  document.body.appendChild(container)
  document.body.appendChild(toggleBtn)

  // 绑定事件到设置项
  const bindEvent = (id, key, type) => {
    const el = settingsEl.querySelector(`#blhxfy-set-${id}`)
    if (!el) return
    if (type === 'checkbox') {
      el.onchange = () => {
        const val = el.checked
        if (key === 'ai-trans') {
          settingsEl.querySelector('#blhxfy-set-group-ai').style.display = val ? 'block' : 'none'
        }
        if (key === 'origin-text') {
          if (val) {
            listEl.classList.add('show-origin')
          } else {
            listEl.classList.remove('show-origin')
          }
        }
        const win = window.unsafeWindow || window
        if (win.blhxfy && typeof win.blhxfy.sendEvent === 'function') {
          win.blhxfy.sendEvent('setting', key, val)
        }
      }
    } else if (type === 'select') {
      el.onchange = () => {
        const win = window.unsafeWindow || window
        if (win.blhxfy && typeof win.blhxfy.sendEvent === 'function') {
          win.blhxfy.sendEvent('setting', key, el.value)
        }
      }
    } else if (type === 'input') {
      el.oninput = () => {
        const win = window.unsafeWindow || window
        if (win.blhxfy && typeof win.blhxfy.sendEvent === 'function') {
          win.blhxfy.sendEvent('setting', key, el.value)
        }
      }
    }
  }

  bindEvent('safeMode', 'safe-mode', 'checkbox')
  bindEvent('storyOnly', 'story-only', 'checkbox')
  bindEvent('uiLayout', 'ui-layout', 'select')
  bindEvent('uiTheme', 'ui-theme', 'select')
  bindEvent('uiFontSize', 'ui-font-size', 'input')
  bindEvent('aiTrans', 'ai-trans', 'checkbox')
  bindEvent('llmProvider', 'llm-provider', 'select')
  bindEvent('aiApiKey', 'ai-api-key', 'input')
  bindEvent('aiApiEndpoint', 'ai-api-endpoint', 'input')
  bindEvent('aiModel', 'ai-model', 'input')
  bindEvent('traditionalTrans', 'traditional-trans', 'checkbox')
  bindEvent('originText', 'origin-text', 'checkbox')
  bindEvent('showTranslator', 'show-translator', 'checkbox')

  // 绑定操作按钮
  settingsEl.querySelector('#blhxfy-set-btn-back').onclick = () => switchView('script')
  settingsEl.querySelector('#blhxfy-set-btn-save').onclick = () => {
    location.reload()
  }
}

// 展开/折叠面板
export function toggleSidebar(force) {
  initUI()
  // 如果没有传参，先检查 localStorage 中的记忆状态（仅首次调用时）
  let isActive
  if (force !== undefined) {
    isActive = force
  } else {
    isActive = !sidebarEl.classList.contains('active')
  }
  if (isActive) {
    sidebarEl.classList.add('active')
    toggleBtn.classList.add('active')
    toggleBtn.innerHTML = '&times;'
  } else {
    sidebarEl.classList.remove('active')
    toggleBtn.classList.remove('active')
    toggleBtn.innerHTML = '译'
    // 关闭时重置为剧本视图
    switchView('script')
  }
  // 记忆侧边栏打开状态
  try {
    localStorage.setItem('blhxfy:sidebarOpen', isActive ? '1' : '0')
  } catch(e) {}
}

const win = window.unsafeWindow || window
win.blhxfy || (win.blhxfy = {})
win.blhxfy.toggleSidebar = toggleSidebar

// 渲染剧情文本到列表
export function renderStoryScript(sceneName, dialogueList) {
  initUI()
  listEl.innerHTML = ''
  currentScript = []
  lastActiveIndex = -1

  dialogueList.forEach((item, index) => {
    // 过滤掉没有实质对白内容的行
    if (!item.detail && !item.chapter_name) return

    const card = document.createElement('div')
    card.className = 'blhxfy-dialogue-card'
    card.id = `blhxfy-line-${index}`

    // 译文内容
    const transText = item.detail || item.chapter_name

    // 找出说话角色的译名与原名
    let nameHtml = ''
    if (item.charcter1_name) {
      nameHtml = `<div class="blhxfy-char-name">${item.charcter1_name}</div>`
    }

    // 总是渲染原文元素（显隐由 CSS class 控制）
    let originHtml = ''
    if (item.detail_origin) {
      originHtml = `<div class="blhxfy-origin-sub">${item.detail_origin}</div>`
    }

    card.innerHTML = `
      ${nameHtml}
      <div class="blhxfy-trans-text">${transText}</div>
      ${originHtml}
    `

    // 点击某一句，可以支持手动平滑滚动和高亮
    card.onclick = () => highlightLine(index)

    listEl.appendChild(card)

    // 保存到内存，方便 MutationObserver 匹配进度
    currentScript.push({
      index,
      element: card,
      id: item.id,
      // 提取纯文本以便模糊匹配页面内容
      jpText: (item.detail_origin || '').replace(/<[^>]+>/g, '').trim(),
      cnText: transText.replace(/<[^>]+>/g, '').trim()
    })
  })

  // 渲染完成后，如果默认折叠，弹窗闪烁一下提示用户有新翻译
  if (!sidebarEl.classList.contains('active')) {
    toggleBtn.style.transform = 'scale(1.2)'
    setTimeout(() => {
      toggleBtn.style.transform = ''
    }, 500)
  }

  // 启动对游戏页面文本的监听，以便同步滚动高亮
  startSyncObserver()
}

// 高亮并平滑滚动到指定行
const highlightLine = (index) => {
  const line = currentScript.find(item => item.index === index)
  if (!line) return

  // 移除其它高亮
  const activeElements = listEl.querySelectorAll('.active-line')
  activeElements.forEach(el => el.classList.remove('active-line'))

  // 高亮当前行
  line.element.classList.add('active-line')

  // 平滑滚动
  line.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  lastActiveIndex = index
}

// 页面剧情文字变化监测，同步侧边栏滚动
const startSyncObserver = () => {
  if (observer) observer.disconnect()

  // 尝试精确匹配当前台词的辅助函数
  const matchCurrentLine = () => {
    // 碧蓝幻想的当前台词显示在 .prt-scene-comment 中
    const commentEl = document.querySelector('.prt-scene-comment')
    if (!commentEl) return

    const currentText = (commentEl.innerText || '').replace(/\s+/g, '').trim()
    if (!currentText || currentText.length < 2) return

    // 在 currentScript 中查找匹配的行
    let bestMatch = null
    let bestScore = 0

    for (let item of currentScript) {
      if (!item.jpText || item.jpText.length < 2) continue

      const cleanJp = item.jpText.replace(/\s+/g, '')
      
      // 完全包含匹配
      if (currentText.includes(cleanJp) || cleanJp.includes(currentText)) {
        const score = Math.min(cleanJp.length, currentText.length)
        if (score > bestScore) {
          bestScore = score
          bestMatch = item
        }
        continue
      }

      // 前缀子串匹配（取前15个字符）
      const prefix = cleanJp.slice(0, Math.min(15, cleanJp.length))
      if (prefix.length >= 3 && currentText.includes(prefix)) {
        const score = prefix.length * 0.8
        if (score > bestScore) {
          bestScore = score
          bestMatch = item
        }
      }
    }

    if (bestMatch && bestMatch.index !== lastActiveIndex) {
      highlightLine(bestMatch.index)
    }
  }

  // 监听 .prt-scene-comment 节点的变化
  observer = new MutationObserver((mutations) => {
    let shouldMatch = false
    for (let mutation of mutations) {
      // 检查变化是否与剧情文本相关
      const target = mutation.target
      if (target.closest && target.closest('.prt-scene-comment, .cnt-quest-scene')) {
        shouldMatch = true
        break
      }
      // 也检查新增的节点
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          if (node.nodeType === 1 && (node.classList?.contains('prt-scene-comment') ||
              node.querySelector?.('.prt-scene-comment'))) {
            shouldMatch = true
            break
          }
        }
      }
      if (shouldMatch) break
    }
    if (shouldMatch) {
      matchCurrentLine()
    }
  })

  // 监听整个剧情容器或 body
  const target = document.querySelector('.cnt-quest-scene') || document.body || document.documentElement
  if (target) {
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    })
  }

  // 初始执行一次匹配（页面上可能已经有台词了）
  matchCurrentLine()
}

export function updateStoryScriptWithAi(transMap) {
  if (!currentScript || currentScript.length === 0) return

  currentScript.forEach(line => {
    const id = line.id
    if (!id) return
    const obj = transMap.get(id)
    if (!obj) return

    // 译文内容
    const transText = obj.detail || obj.chapter_name
    if (!transText) return

    // 更新 card 内的剧本翻译
    const transEl = line.element.querySelector('.blhxfy-trans-text')
    if (transEl) {
      transEl.innerHTML = transText
    }
    
    // 更新 cnText 以便匹配高亮
    line.cnText = transText.replace(/<[^>]+>/g, '').trim()
  })
}

win.blhxfy.updateStoryScriptWithAi = updateStoryScriptWithAi

