# AI Agent Instructions

## 1. Project Context & Identity
You are an expert TypeScript and Chrome Extension developer.
**Project Name**: Readable Captions (可读字幕)
**Goal**: A browser extension specifically designed for Bilibili (bilibili.com) that extracts video subtitles and formats them into readable paragraphs, with future support for AI-generated summaries. 
**Design Philosophy**: Seamlessly blend into Bilibili's native UI. Keep abstractions minimal.

## 2. Tech Stack & Architecture
- **Language**: TypeScript (Strict mode).
- **Build Tool**: Vite.
- **UI Framework**: **Lit** (Web Components) for ALL user interfaces (both Content Script Panels and the Options Page).
- **Styling**: Scoped CSS within Lit components.

### Directory Structure:
- `src/content/`: Chrome extension content scripts (runs on Bilibili pages). Injects the UI anchor and observes route changes.
- `src/panel/`: The main Lit-based UI panel rendered in a **Shadow DOM** to prevent CSS bleed.
- `src/options/`: The Lit-based Extension Options page (`chrome.runtime.openOptionsPage()`).
- `src/settings/`: Wrappers for `chrome.storage.local` to persist user configurations.
- `src/platforms/`: Logic to fetch and normalize Bilibili transcripts (Human CC & AI WBI).
- `src/summary/`: (WIP) Interfaces and providers for LLM summarization (OpenAI, DeepSeek).

## 3. Strict Development Rules (DO NOT VIOLATE)

1. **Lit Everywhere**: Do NOT use vanilla DOM manipulation (`document.createElement`, `innerHTML`) for UI components. Always use Lit's `html` and `css` tagged template literals.
2. **Shadow DOM for Content Scripts**: Any UI injected into the host page (Bilibili) MUST be encapsulated within a Shadow Root to protect our Bilibili-mimicking styles from the host's CSS.
3. **Storage**: Always use the functions provided in `src/settings/storage.ts` for reading/writing extension settings. Do not call `chrome.storage.local` directly in UI components.
4. **Bilibili Specificity**: Do not build abstract "multi-platform" adapters unless explicitly asked. We are highly coupled to Bilibili's DOM and APIs.
5. **No External UI Libraries**: Do not install or use external UI libraries (like React, Tailwind, or Material UI). We write custom CSS to match Bilibili's native design system.

## 4. Current State & Roadmap

- ✅ **Phase 1**: Core subtitle fetching (Human + AI) and rendering is complete.
- ✅ **Phase 2**: Panel UI (Tabs, Dropdown Menus, Shadow DOM injection) is complete.
- ✅ **Phase 3**: Settings persistence and Lit-based Options Page (`src/options/index.ts`) are completely wired up.
- 🚧 **Phase 4 (CURRENT)**: Implement the Summary generation backend. 
  - Need to wire the configurations stored in settings (Provider, API Key, Model) to actual API calls in `src/summary/`.
  - Handle streaming/loading states in the UI when generating summaries.