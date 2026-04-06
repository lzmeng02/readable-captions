# AGENTS.md

## Project
Browser extension for readable captions on video/content platforms.

Current implementation:
- Bilibili transcript fetching
- content script mount into the video page
- Lit + Shadow DOM panel UI

Near-term roadmap:
- AI-generated summary from transcript
- support for more platforms
- richer transcript processing

## Architecture direction
Organize code by domain boundaries:

- `src/content/`: page integration, mount, route watching
- `src/platforms/`: platform-specific transcript acquisition
- `src/transcript/`: normalized transcript model and processing
- `src/summary/`: summary interfaces and providers
- `src/panel/`: rendering, state, UI actions

## Core refactor rule
This phase is a structural refactor, not a feature redesign.

Preserve current runtime behavior unless explicitly asked otherwise.

## Existing product constraints
- Keep panel insertion before `div.bpx-player-auxiliary`
- Keep Shadow DOM rendering
- Keep current tab structure unless the task explicitly changes UX
- Keep current Bilibili subtitle source priority:
  1. human subtitle from view API
  2. AI subtitle fallback from wbi API
- Requests to `api.bilibili.com` may include credentials
- Subtitle JSON/file requests should omit credentials

## Placeholder rules
Some UI is currently placeholder-only:
- summary tab
- download / copy / more actions
- AI language selector behavior

Do not fake full implementations.
Prefer explicit stubs, mock providers, or TODO-safe placeholders.

## Engineering rules
- Make minimal edits
- Prefer explicit TypeScript types
- Do not refactor unrelated code
- Keep files focused and small
- Separate platform logic from panel/UI logic
- Separate summary logic from platform fetching
- Normalize platform subtitle data before rendering or summarizing

## Done when for phase 1
Phase 1 is complete when:

1. Bilibili fetching logic is isolated behind a platform adapter
2. transcript has a normalized shared model
3. summary has interfaces plus a mock provider
4. panel consumes normalized data instead of platform-specific details
5. content layer handles only page integration and mounting
6. project still builds
7. existing Bilibili flow still works
8. include a short manual verification checklist

## Review expectations
For refactors:
- explain what moved where
- explain any compatibility risks
- avoid behavior changes unless necessary