# AGENTS.md

## Project

Readable Captions is a browser extension focused on improving subtitle readability on video/content platforms.

Current focus:
- Bilibili only
- transcript fetching
- panel injection into the page
- Lit + Shadow DOM UI

Near-term roadmap:
1. make the Bilibili experience solid first
2. add a compact three-dots overflow menu
3. add a dedicated settings/options page
4. add settings persistence
5. prepare summary provider configuration
6. later connect real summary backends

This repository is not trying to support multiple platforms yet.
Do not introduce broad multi-platform abstractions beyond what is needed for clear boundaries.

---

## Current product direction

The current panel already has dedicated buttons for:
- copy
- download

The three-dots button should be treated as a compact overflow menu.
Do not duplicate copy/download inside the overflow menu unless explicitly requested.

The overflow menu should initially stay very small.
Preferred first item:
- Settings

Settings should open a dedicated extension options page / new tab.
Do not build a large in-panel settings UI unless explicitly requested.

---

## Product priorities

Current priority order:

1. Bilibili experience quality
2. overflow menu
3. settings foundation
4. options page
5. settings persistence
6. summary provider configuration
7. real summary backend integration

Do not prioritize real summary generation before settings and options-page foundations are in place.

---

## Architecture direction

Organize the codebase by practical domain boundaries:

- `src/content/`: page integration, DOM insertion, route watching
- `src/platforms/`: platform-specific transcript acquisition
- `src/transcript/`: normalized transcript model
- `src/panel/`: panel rendering, mount logic, UI-facing types
- `src/settings/`: settings types, defaults, storage
- `src/options/`: dedicated settings/options page
- `src/summary/`: summary interfaces and provider implementations

Keep boundaries practical and compact.
Do not over-split files just for architectural purity.

---

## Bilibili-specific constraints

Preserve current runtime behavior unless explicitly asked otherwise.

Keep these behaviors unchanged:

- panel insertion stays before `div.bpx-player-auxiliary`
- panel rendering stays in Shadow DOM
- current tab structure stays intact unless explicitly changed
- subtitle source priority stays:
  1. human subtitle from the view API
  2. AI subtitle fallback from the WBI API
- requests to `api.bilibili.com` may include credentials
- subtitle JSON/file requests should omit credentials
- current polling-based SPA route watching should not be redesigned unless required for extraction or bug fixing

Avoid accidental regressions in:
- subtitle source order
- credentials behavior
- duplicate mounting on navigation
- stale async rendering after route changes

---

## Settings direction

Settings should live in a dedicated options page.

Preferred initial settings shape:

- `defaultTab`
- `summaryEnabled`
- `summaryProvider`
- `summaryAccessMode`
- `summaryModel`
- `summaryApiKey`
- `summaryPromptTemplate`
- `copyFormat`
- `downloadFormat`

Keep settings implementation simple:
- a small settings type
- default values
- a small storage wrapper
- a minimal but working options page

Do not overengineer settings state management.

---

## Summary direction

Summary is not fully implemented yet.

Current expectation:
- prepare summary interfaces
- prepare provider configuration
- prepare settings for summary behavior
- avoid implying that real AI summary is already complete

Preferred summary settings model:

- provider:
  - `openai`
  - `deepseek`
- access mode:
  - `api_key`
  - `webapp` (experimental / future-facing)
- model
- custom prompt template

Important:
- treat `webapp` mode as future-facing / experimental
- prefer API-key-based integrations as the primary stable path
- do not build brittle webapp automation unless explicitly requested

Do not hardcode future summary logic directly into the panel.
The panel should eventually consume summary results through a provider boundary.

---

## Engineering rules

- Make small, reviewable patches
- Prefer explicit TypeScript types
- Preserve visible behavior unless the task explicitly changes it
- Do not refactor unrelated code in the same patch
- Keep files focused, but do not maximize file count unnecessarily
- Prefer compatibility-preserving extraction over broad rewrites
- When adding boundaries, keep them minimal and practical
- Avoid placeholder logic that pretends a feature is complete when it is not

For UI work:
- keep the current visual direction
- do not redesign the panel unless explicitly requested
- keep the current Bilibili-style visual language where reasonable

For product work:
- settings belong in the options page
- overflow menu should stay compact
- direct action buttons should remain direct actions

---

## Verification style

The user prefers fast iteration and usually does not do deep code review.

For non-trivial changes:
- plan first for multi-step tasks
- keep patches small
- run the project build after implementation
- report changed files clearly
- report top regression risks clearly
- provide a short browser smoke-test checklist
- prefer practical verification over long explanations

When possible, verify with:
- build command
- minimal runtime/manual checks
- compact self-review before finishing

---

## Execution style for coding tasks

For medium or large tasks, prefer plan-first execution.

Expected workflow:
1. inspect the repo
2. propose the smallest safe plan
3. list files likely to change
4. list risks
5. stop before coding unless explicitly asked to continue

When implementing:
- keep the patch scope narrow
- explain changed files clearly
- mention compatibility risks
- provide a short manual verification checklist

Do not batch many unrelated changes into one patch.

---

## What not to do by default

Do not, unless explicitly requested:

- redesign the panel
- move settings into a large in-panel UI
- duplicate copy/download inside the overflow menu
- implement real LLM/backend integration too early
- add background-script architecture that is not yet needed
- add multi-platform abstractions beyond current practical needs
- build complex provider/plugin systems prematurely
- treat experimental webapp integrations as the default path

---

## Preferred next-step order

When deciding what to implement next, prefer this order:

1. overflow menu with Settings entry
2. settings foundation
3. options page entry and minimal options UI
4. settings persistence
5. summary provider configuration
6. copy/download implementation details
7. real summary backend integration

---

## Done criteria

A task is considered done when:

- the code builds
- current Bilibili flow still works
- panel placement still works
- Shadow DOM rendering still works
- no visible regression was introduced outside task scope
- the change is isolated and reviewable
- a short manual verification checklist is included

---

## Review expectations

At the end of any non-trivial patch, explain:

1. which files changed
2. what changed in each file
3. what behavior was intentionally preserved
4. what was intentionally deferred
5. the top regression risks
6. a short manual verification checklist