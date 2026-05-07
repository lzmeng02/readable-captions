# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ask Before Anything

在以下情况优先使用 AskUserQuestion 澄清：上下文不足、需求存在歧义或模糊、存在未完成的问题、需要详细方案。

## Commands

```bash
npm run build    # tsc → 3 Vite builds → copy manifest
npm run dev      # Watch content script only (not background or options)
```

No tests, linters, or formatters yet.

## Product North Star

**在保证能够拿走takeaway的情况下，能不看视频就不看视频，必须看视频时就只看重点。** 帮助用户对 Bilibili 长信息视频快速获取信息、节省观看时间。娱乐向视频不是目标。

Panel 收敛为 3 个 tab：`overview`（总览/决策）、`intensive`（精读/替代观看）、`original`（原文/查证）。不要添加用户可见的模式选择器。详细产品方向见 `docs/product-direction.md`。

## Architecture

Chrome Extension MV3，注入 Shadow DOM panel 到 Bilibili 视频页。三个入口：

| Entry | Output | Role |
|-------|--------|------|
| `src/content.ts` | `dist/content.js` (IIFE) | Content script, `document_idle` 注入 |
| `src/background.ts` | `dist/background.js` (ES) | Service worker, 代理 LLM SSE stream |
| `options.html` | `dist/options.html` | 独立 Lit options page |

### Key Flows

**Content script 启动** (`src/content/index.ts` → `startContentScript()`):
- 每 800ms 轮询 `location.href`（Bilibili SPA 不触发 navigation event）
- 等待 player anchor `div.bpx-player-auxiliary` → mount panel → fetch transcript → re-render
- MutationObserver 处理 SPA navigation 时 DOM 销毁重建，用缓存数据恢复

**AI Streaming** (详见 `docs/architecture.md`):
- Content script 开 Chrome runtime port `readable-captions-generation-stream`
- Background service worker 代理 SSE fetch 到 OpenAI/DeepSeek
- Token 通过 `port.postMessage()` 回传，content script 用 `marked` + `DOMPurify` 渲染
- API keys 存 `chrome.storage.local`，不打包。Background proxy 是有意设计，不要把 LLM 请求放回 content script

**Settings** (`src/settings/storage.ts`):
- 统一通过 `getSettings()` / `saveSettings()` / `watchSettings()` 读写，不要直接调 `chrome.storage.local`
- Key: `extensionSettings`

**Platform** (`src/platforms/`):
- `PlatformAdapter` registry，目前仅 `bilibiliAdapter`，提供 `matches(url)` + `getTranscript(url)`
- Human CC → AI WBI fallback chain。不要主动做多平台抽象

### Directory Map

```
src/
├── content.ts / background.ts     # Extension entry points
├── content/                       # Orchestration: route watching, DOM, render scheduler
├── panel/                         # Lit UI panel (Shadow DOM), mount logic, export utils
├── options/                       # Lit options page
├── settings/                      # chrome.storage.local wrappers (types, defaults, storage)
├── platforms/                     # Platform adapters (bilibili/)
├── generation/                    # LLM streaming (protocol, llm-api, llm-provider)
├── summary/                       # Legacy summary implementation, do not expand
└── transcript/                    # TranscriptLine model
```

## Hard Constraints

1. **Lit + Shadow DOM** — 所有 UI 用 Lit，content script UI 必须 Shadow DOM 隔离
2. **不要引入外部 UI 库** — 无 Tailwind, React, Material UI。CSS 模仿 Bilibili 原生设计
3. **Bilibili 耦合** — 不要主动抽象多平台框架
4. **API keys 不暴露到 content script** — 通过 background proxy
5. **Panel 轻量** — 不暴露模式选择器、template selector、AI 内部分类给用户
6. **命名** — AI 相关新代码用通用名 (`ai`, `llm`, `generation`)，不写死 `summary`
