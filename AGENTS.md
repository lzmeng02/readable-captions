# AGENTS.md (Optimized)

## 1. Project Context

**Readable Captions**: Bilibili-only browser extension for improved subtitles.

- **Tech**: Lit + Shadow DOM UI.
- **Goal**: Focused Bilibili experience; avoid multi-platform abstractions.

## 2. Roadmap & Priorities

1. Solidify Bilibili core -> 2. Compact Overflow Menu -> 3. Settings Foundation & Persistence -> 4. Options Page -> 5. Summary Config -> 6. Summary Backend Integration. *Note: Do NOT implement summary backends until settings/options page foundations are complete.*

## 3. Architecture & UI Truths

- **Files**: `content/` (DOM/Route), `platforms/` (Fetching), `transcript/` (Model), `panel/` (UI), `settings/` (Storage), `options/` (Page), `summary/` (Provider).
- **UI Source**: `docs/bilibili-ui-guidelines.md`. Match Bilibili-native/Panel style.
- **Shadow DOM**: All panel rendering must stay in Shadow DOM.
- **Placement**: Insert before `div.bpx-player-auxiliary`.

## 4. Bilibili Specifics

- **Subtitle Priority**: 1. Human (view API) -> 2. AI Fallback (WBI API).
- **Credentials**: Include for `api.bilibili.com`; omit for JSON/file requests.
- **Routing**: Keep current polling-based SPA watching.
- **Tabs**: Preserve existing structure; copy/download buttons remain direct (not in menu).

## 5. Feature Specs

- **Overflow Menu**: Compact. First item: **Settings** (opens new tab options page). No in-panel settings UI.
- **Settings Fields**: `defaultTab`, `summaryEnabled`, `summaryProvider` (openai/deepseek), `summaryAccessMode` (api_key primary/webapp exp), `summaryModel`, `summaryApiKey`, `summaryPromptTemplate`, `copyFormat`, `downloadFormat`.
- **Summary**: Use provider boundaries; no hardcoded logic in panel.

## 6. Engineering & Workflow

- **Rules**: Small patches, explicit TS, no unrelated refactors, no premature abstractions.
- **Verification**: Run `build` before completion. Report changed files & regression risks.
- **Done Criteria**: Build passes + Bilibili flow intact + Shadow DOM mount works + manual checklist provided.