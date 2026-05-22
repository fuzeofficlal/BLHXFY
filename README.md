# 碧蓝幻想翻译 (Fork 版)

[![Build](https://github.com/biuuu/BLHXFY/actions/workflows/build.yml/badge.svg)](https://github.com/biuuu/BLHXFY/actions/workflows/build.yml)
<a href="http://game.granbluefantasy.jp/#quest/index"><img alt="Port Breeze" src="https://img.shields.io/badge/Port-Breeze-green.svg"></a>

本项目 Fork 自原作者 [biuuu](https://github.com/biuuu) 的 [BLHXFY](https://github.com/biuuu/BLHXFY) 汉化项目。在此向原作者团队及所有汉化贡献者致以最诚挚的感谢！

本项目在原版之上，针对游戏翻译功能进行了如下扩展与优化：

- **大模型智能翻译**：新增支持大语言模型（如 OpenAI、Claude、Gemini 等）对游戏内 NPC 技能与剧情的异步汉化翻译。
- **云端汉化缓存服务**：优化了翻译接口与缓存机制，使用云端缓存加速汉化文本渲染。

---

## 插件安装说明

要使用本汉化插件，您需要借助浏览器脚本管理器（如 Tampermonkey 篡改猴）。

### 1. 正常使用安装

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。
2. 安装/更新本项目发布的用户脚本：
   - 点击链接进行安装：[☁检查安装/更新]

### 2. AI 汉化设置说明

安装脚本并进入游戏后，在游戏左侧/汉化设置面板中，您可以找到“大模型翻译”相关设置项：

- **模型服务商**：支持选择配置您的 API 供应商（如 OpenAI、等）。
- **API Endpoint**：大模型接口的请求基址。
- **API Key**：大模型的授权 Token。
- **大模型型号**

---

## 本地开发与调试指引

如果您想修改本项目源码并实时在游戏中看到效果，请按以下步骤配置：

### 1. 运行本地开发服务器

在项目根目录下执行以下命令：

```bash
# 1. 安装项目依赖
pnpm install

# 2. 启动开发模式（会实时监听文件变更并自动打包）
pnpm dev
```

启动后，开发服务器默认会在本地运行并开启静态服务：
- 访问地址：`http://127.0.0.1:15945/blhxfy/extension.user.js`

### 2. 在 Tampermonkey 中挂载本地脚本

1. 打开浏览器 Tampermonkey 控制面板，点击“新建脚本”。
2. 将编辑器中的内容清空，替换为以下元数据代码：

   ```javascript
   // ==UserScript==
   // @name         碧蓝幻想汉化 - 本地开发调试
   // @namespace    http://tampermonkey.net/
   // @version      9.9.9
   // @description  用于碧蓝幻想本地汉化代码实时热重载调试
   // @match        *://game.granbluefantasy.jp/*
   // @match        *://gbf.game.mbga.jp/*
   // @require      http://127.0.0.1:15945/blhxfy/extension.user.js
   // @run-at       document-body
   // @grant        GM_xmlhttpRequest
   // @grant        GM_setValue
   // @grant        GM_getValue
   // @connect      *
   // ==/UserScript==
   ```

3. 保存该脚本，并确保处于启用状态。同时**关闭**已安装的线上版汉化脚本，以防冲突。
4. 刷新游戏页面。此时游戏会通过 `@require` 动态加载您本地 `127.0.0.1:15945` 的脚本。
5. 之后您每次在本地编辑器中修改 `src/` 下的代码，保存后本地开发服务器会自动重新编译。您只需刷新游戏页面即可看到最新的修改效果，无需反复手动安装脚本。

---

## 常用命令

```bash
# 构建发布版本用户脚本
pnpm build

# 构建汉化数据
pnpm data

# 部署
pnpm deploy
```

## License

The code is [MIT](https://github.com/biuuu/BLHXFY/blob/master/LICENSE) licensed,
but the translation text has another License. see [details](https://github.com/biuuu/BLHXFY/tree/master/data)
