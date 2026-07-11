# Repository guidance

Readable Captions is a Bilibili-only Chrome MV3 extension. Its goal is to help users extract useful information from long videos and watch only the parts that matter.

Start with [`docs/README.md`](docs/README.md). Current runtime behavior belongs in [`docs/architecture.md`](docs/architecture.md); product intent belongs in [`docs/product-direction.md`](docs/product-direction.md).

## Commands

```bash
npm ci
npm run build   # Required check: strict tsc + 3 Vite builds + manifest copy
npm run dev     # Content bundle only; not a complete loadable extension build
```

There are currently no tracked automated tests, linter, formatter, or CI workflow. Follow [`docs/development.md`](docs/development.md) for Chrome smoke tests.

## Non-negotiable boundaries

- Use Lit for UI. The injected panel stays inside Shadow DOM; do not add React, Tailwind, Material UI, or another UI system.
- Keep the three user-facing views: `original`, `intensive`, and `overview`. Markdown Note remains an export action, not a fourth tab. Do not expose internal content classification or template selection in the main panel.
- Keep LLM HTTP requests and the `Authorization` header in the background service worker. Content receives only `PublicExtensionSettings`; outside the Options credential field, never put API keys in runtime-port messages, page/panel DOM, logs, exports, or generated output.
- Keep dynamic/LLM Markdown on the `marked` → DOMPurify → `unsafeHTML` path; never render unsanitized model output.
- Access full `extensionSettings` only through `getSettings()`, `saveSettings()`, and `watchSettings()`; content-side code uses `watchPublicSettings()`. Preserve legacy-field migration in `mergeSettings()` when changing the schema.
- Preserve the subtitle chain: view API subtitle list, then WBI subtitle fallback when the list is empty, then `none`. Requests to `api.bilibili.com` include cookies; subtitle-file requests do not.
- Keep AI code under general `generation`/`llm` naming. Do not recreate the removed `src/summary/` implementation or add a generic multi-platform abstraction without an explicit requirement.

## Working and verification rules

- Preserve existing user changes. Keep patches focused; do not edit generated `dist/`, dependencies in `node_modules/`, secrets, or unrelated files.
- Match nearby TypeScript style and avoid whole-file formatting or line-ending churn; the repository has no formatter.
- Run `npm run build` after changes. Smoke-test every affected extension context and report anything not verified. Update canonical docs whenever a runtime contract, build step, setting, or product constraint changes.
