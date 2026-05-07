# Architecture

## Build System

三个 Vite config 对应三个 extension context：

| Config | Entry | Output | Format |
|--------|-------|--------|--------|
| `vite.config.ts` | `src/content.ts` | `dist/content.js` | IIFE |
| `vite.background.config.ts` | `src/background.ts` | `dist/background.js` | ES module |
| `vite.options.config.ts` | `options.html` | `dist/options.html` + `options.js` | Multi-page |

`copy-manifest.mjs` 把 `manifest.json` 复制到 `dist/`。第一个 config 设 `emptyOutDir: true` 清空 dist，后续 config 设 `false` 追加。

## Content Script Orchestration

`src/content/index.ts` → `startContentScript()`:

1. **Route watching** — `src/content/route-watcher.ts`，每 800ms 轮询 `location.href`。Bilibili SPA 在视频间跳转时不触发标准 navigation events。
2. **Render scheduler** — `src/content/index.ts` → `renderCurrentPage()`：
   - `waitForElm("div.bpx-player-auxiliary")` 等待 player anchor
   - `mountPanel()` 创建 Shadow DOM，显示 loading
   - `getTranscriptForUrl()` 匹配 platform adapter，获取 transcript
   - `mountPanel()` 用 transcript 数据重新 render

**DOM 持久化** — `MutationObserver` 监听 `document.documentElement`。Bilibili SPA navigation 会销毁重建 player area。Observer 检测到 host element 从 DOM 移除后，用缓存数据重新 mount。

## AI Streaming Protocol

```
Content Script                          Background Service Worker
─────────────                          ─────────────────────────
streamGeneration()
  llm-provider.ts
  ↓
chrome.runtime.connect()
  port name: "readable-captions-generation-stream"
  ↓                                     chrome.runtime.onConnect
  port.postMessage({                     ↓
    type: "start",                     streamGenerationFromApi()
    request                              llm-api.ts
  })                                     ↓
                                       fetch(apiUrl, { SSE })
  port.onMessage ←─────────────────── port.postMessage(token)
  ↓
render partial markdown
  marked + DOMPurify
```

- API keys 在 `chrome.storage.local`，由 background 读取
- Background proxy 是有意设计 — MV3 service worker 的 host permissions 比 content script 更可靠
- AI generation 目前支持 `overview`、`intensive`、`note` 三类任务。后续 planner JSON 也应继续放在通用 generation/llm 命名下。

## Settings

`chrome.storage.local`，key: `extensionSettings`。统一通过 `src/settings/` 访问：

- `types.ts` — `ExtensionSettings` 类型 + enum 常量数组
- `defaults.ts` — 默认值 + `mergeSettings()` 校验
- `storage.ts` — `getSettings()`, `saveSettings()`, `watchSettings()`

`watchSettings()` 封装 `chrome.storage.onChanged`，content script panel 可实时响应 options page 变化。

**不要在别处直接调 `chrome.storage.local`。**

## Platform Adapters

`src/platforms/index.ts` — `PlatformAdapter` registry。

```typescript
interface PlatformAdapter {
  platformId: string;
  matches(url: string): boolean;
  getTranscript(url: string): Promise<PlatformTranscriptResult>;
}
```

目前只有 `bilibiliAdapter`（`src/platforms/bilibili/adapter.ts`）。

### Bilibili Subtitles API Flow

```
fetchBilibiliViewInfo(url)
  → GET Bilibili page, parse window.__INITIAL_STATE__
  → returns { aid, cid }

fetchBilibiliAiSubtitleUrl(aid, cid)
  → GET Bilibili subtitle list API
  → returns subtitle JSON URL

fetchBilibiliSubtitleBody(subtitleUrl)
  → GET subtitle JSON
  → returns raw body

normalizeBilibiliTranscript(rawBody)
  → parse into TranscriptLine[]
```

Fallback 顺序：human-created CC subtitles → AI-generated WBI subtitles → none。

Bilibili adapter 与 Bilibili 内部 API 强耦合。不要主动构建 generic multi-platform abstraction。

## Panel UI

`src/panel/` — Lit-based UI，渲染在 Shadow DOM 中。

- `mount.ts` — `mountPanel()`: 管理 Shadow DOM、mode state、generation streaming、settings watchers
- `panel-view.ts` — `panelTemplate()` + `panelStyles()`: 完整 Lit HTML template + CSS
- `export-utils.ts` — 复制/下载 transcript（readable、timestamped、SRT 格式）和 Markdown Note

UI state (`isCollapsed`, `isMenuOpen`, `currentLang`) 是 module-scoped 变量，跨 Lit re-render 持久。

## Options Page

`src/options/index.ts` — `ReadableCaptionsOptionsApp` LitElement，4 tabs: General、AI Generation、Export、About。通过 `getSettings()` / `saveSettings()` 读写 settings。

## Manifest V3

- **permissions**: `storage`
- **host_permissions**: `bilibili.com`, `api.bilibili.com`, `aisubtitle.hdslb.com`, `*.hdslb.com`, `api.openai.com`, `api.deepseek.com`
- **content_scripts**: `https://www.bilibili.com/*`, `run_at: document_idle`
- **background**: `background.js`, `type: module`
- **options_ui**: `options.html`, `open_in_tab: true`
