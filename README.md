# Readable Captions（可读字幕）

> 帮助你在 Bilibili 长信息视频中**快速获取信息、节省观看时间**。能不看就不看，必须看就只看重点。

一个 Chrome 浏览器扩展，注入智能分析面板到 Bilibili 视频页面，自动获取字幕并用 AI 生成结构化内容，让你在几分钟内掌握视频核心信息。

## 截图

<!-- TODO: 添加截图 -->

## 安装

1. 克隆仓库并安装依赖：
   ```bash
   git clone <repo-url>
   cd readable-captions
   npm install
   ```

2. 构建扩展：
   ```bash
   npm run build
   ```

3. 打开 Chrome，进入 `chrome://extensions/`，开启「开发者模式」，点击「加载已解压的扩展程序」，选择 `dist/` 目录。

4. 加载后进入扩展选项页，配置 AI API Key（OpenAI 或 DeepSeek 兼容接口）。

## 功能

| Tab | 用途 |
|-----|------|
| **总览 (Overview)** | 默认面板。自适应视频类型提炼核心结论、takeaway、关键片段，帮助判断是否需要看原视频 |
| **精读 (Intensive)** | 高信息密度阅读稿，去掉口头禅和重复，目标是「不看视频也能理解内容」 |
| **原文 (Original)** | 带时间戳的原文字幕，可点击跳转、搜索和查证 |

- **Markdown Note 导出** — 将 AI 整理的内容导出为 Markdown，适合保存到 Obsidian、Notion 或项目文档
- **自适应内容** — 根据视频类型（测评、教程、经验分享等）动态调整输出结构
- **实时 AI 流式生成** — SSE streaming，内容逐 token 渲染，不必等待完整响应

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Chrome Extension Manifest V3 |
| UI | [Lit](https://lit.dev/) + Shadow DOM 隔离 |
| 构建 | TypeScript + Vite（3 入口） |
| AI | OpenAI / DeepSeek 兼容 API，SSE streaming |
| 渲染 | marked + DOMPurify |

## 架构概览

```
┌─ Content Script (IIFE) ──────────────────────────┐
│  Shadow DOM Panel                                 │
│  ├─ 总览 / 精读 / 原文 三 Tab                      │
│  ├─ Lit 渲染 + marked 排版                         │
│  └─ settings watcher 实时响应配置变化               │
├───────────────────────────────────────────────────┤
│  Route Watcher (800ms poll, Bilibili SPA 适配)     │
│  Bilibili Platform Adapter (字幕获取)              │
├───────────────────────────────────────────────────┤
│  chrome.runtime.connect()                         │
│  → "readable-captions-generation-stream" port      │
└───────────────────────────────────────────────────┘
                        ↓
┌─ Background Service Worker (ES Module) ───────────┐
│  SSE Proxy → OpenAI / DeepSeek API                │
│  API keys from chrome.storage.local               │
└───────────────────────────────────────────────────┘
```

详见 [`docs/architecture.md`](docs/architecture.md)。

## 开发

```bash
npm run dev     # 监视 content script 变动并自动构建
npm run build   # tsc 类型检查 → 3 个 Vite 构建 → 复制 manifest
```

构建产物位于 `dist/` 目录：

| 文件 | 来源 |
|------|------|
| `dist/content.js` (IIFE) | `src/content.ts` |
| `dist/background.js` (ES) | `src/background.ts` |
| `dist/options.html` + `options.js` | `options.html` + `src/options/` |

### 目录结构

```
src/
├── content.ts / background.ts      # 扩展入口
├── content/                        # 编排层：路由监听、DOM 挂载、渲染调度
├── panel/                          # Lit UI 面板（Shadow DOM）、挂载逻辑、导出工具
├── options/                        # Lit 选项页
├── settings/                       # chrome.storage.local 封装
├── platforms/                      # 平台适配器（目前仅 bilibili）
├── generation/                     # LLM 流式生成（协议、API、provider）
└── transcript/                     # TranscriptLine 模型
```

## 设计原则

- **能不看就不看，必须看就只看重点** — 产品核心目标
- **一键默认，自适应输出** — 不暴露模式选择器、模板选择器或 AI 内部分类
- **面板轻量** — 3 个 Tab，不多不少
- **不引入外部 UI 库** — CSS 模仿 Bilibili 原生设计

详见 [`docs/product-direction.md`](docs/product-direction.md)。
