# Repository guidance

Readable Captions is a Bilibili-only Chrome MV3 extension. Its goal is to help users extract useful information from long videos and watch only the parts that matter.

Start with [`docs/README.md`](docs/README.md). Current runtime behavior belongs in [`docs/architecture.md`](docs/architecture.md); product intent belongs in [`docs/product-direction.md`](docs/product-direction.md).

## Commands

```bash
npm ci
npm test        # Complete Vitest suite
npm run build   # Strict tsc + content/background/options builds + manifest copy
npm run dev     # Complete build once, then content-only watch preserving sibling artifacts
```

Tests are split across `tests/unit`, `tests/dom`, and `tests/integration`. Follow [`docs/development.md`](docs/development.md) for focused commands, troubleshooting, and the Chrome smoke matrix.

## Non-negotiable boundaries

- Use Lit for UI. The injected panel stays inside Shadow DOM; do not add React, Tailwind, Material UI, or another UI system.
- Keep the three user-facing views: `original`, `intensive`, and `overview`. Markdown Note remains an export action, not a fourth tab. Do not expose internal content classification or template selection in the main panel.
- Keep LLM HTTP requests and the `Authorization` header in the background service worker. Content receives only `PublicExtensionSettings`; outside the Options credential field, never put API keys in runtime-port messages, page/panel DOM, logs, exports, or generated output.
- Keep dynamic/LLM Markdown on the `marked` → DOMPurify → `unsafeHTML` path; never render unsanitized model output.
- Access full `extensionSettings` only through `getSettings()`, `saveSettings()`, and `watchSettings()`; content-side code uses `watchPublicSettings()`. Preserve legacy-field migration in `mergeSettings()` when changing the schema.
- Preserve the subtitle chain and selected-part identity: view subtitle when valid, WBI fallback with the selected `cid`, then `none` only for a valid empty WBI list. Bilibili business errors are terminal. Language changes are latest-wins transactions. API requests include cookies; subtitle-file requests do not.
- Keep generation transport incremental: API/background `token` messages carry deltas, content accumulates them, and only strict `[DONE]` + `finish_reason: "stop"` + non-empty output may complete. Keepalive belongs to one active request.
- Keep AI code under general `generation`/`llm` naming. Do not recreate the removed `src/summary/` implementation or add a generic multi-platform abstraction without an explicit requirement.

## Working and verification rules

- Preserve existing user changes. Keep patches focused; do not edit generated `dist/`, dependencies in `node_modules/`, secrets, or unrelated files.
- Match nearby TypeScript style and avoid whole-file formatting or line-ending churn; the repository has no formatter.
- Run the relevant focused tests, then `npm test`, `npm exec tsc -- --noEmit --pretty false`, `npm run build`, and `git diff --check`. Smoke-test every affected extension context and report every unverified row. Update canonical docs whenever a runtime contract, build step, setting, or product constraint changes.
