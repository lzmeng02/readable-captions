# Functional Bug Fixes Design

- **Date:** 2026-07-11
- **Status:** Approved
- **Target baseline:** `origin/master` at `06d0914`
- **Reference only:** PR #6 at `b3bcae0`; do not merge or cherry-pick it wholesale

## Goal

Fix the confirmed subtitle, content lifecycle, generation streaming, settings UI, and development-build bugs found during the Superpowers code review. Preserve the API-key isolation and current-tab export behavior already present on the target baseline.

## Why PR #6 Is Reference-Only

PR #6 branched from `eb2b16b`, while current `master` contains later Bilibili URL/WBI work and the security/export changes from PR #5. A three-way comparison found real overlap in `src/panel/mount.ts`, `src/generation/llm-api.ts`, `src/panel/panel-view.ts`, and `src/platforms/bilibili/api.ts`.

The PR fully fixes malformed transcript normalization and contains useful partial changes for abortable anchor waits, route teardown, terminal error UI, provider payloads, and latest-wins language loading. It does not fix multipart subtitle selection, Bilibili business errors, detached-host cleanup, canonical language recovery, failed-language rollback, SSE completion validation, stream serialization cost, MV3 keepalive, Options live controls, the dev output deletion, or title truncation. Its Bilibili files must not replace the newer baseline files.

## Scope

### Included

- Correct subtitle selection for Bilibili multipart videos.
- Distinguish genuine no-subtitle results from HTTP, JSON, Bilibili business-code, and malformed-body failures.
- End loading with a visible error state on fetch failure.
- Make initial unsupported routes, SPA navigation, anchor waits, detached hosts, and teardown leak-free.
- Preserve panel state across loading-to-ready updates and host recovery; reset it only for a new video session.
- Make subtitle-language selection latest-wins, abortable, rollback-safe, and recoverable after host replacement.
- Reject malformed transcript lines instead of escaping the `Transcript` type.
- Build provider-specific raw HTTP payloads for OpenAI and DeepSeek.
- Validate streamed completion, including SSE framing, streamed errors, finish reason, `[DONE]`, abnormal EOF, and empty output.
- Send token deltas across the background port, reconstruct snapshots in the content context, and coalesce visible panel rendering by animation frame.
- Keep the MV3 worker alive only while a generation request is active.
- Use live properties for Options selects and checkboxes.
- Prevent content watch builds from deleting the rest of `dist/`.
- Preserve legal hyphens in video titles used for metadata and filenames.
- Add automated regression tests and document the new test/build workflow.

### Deferred

- Avoiding the global pointerdown render when the menu is already closed.
- Choosing among multiple timestamps inside one Markdown element.
- Invalidating cached generation state when only the API key changes. This needs a separate, secret-independent revision design; no API key or key-derived value may enter content-script messages.
- Unrelated product or UI changes.

## Design Principles

- The content layer owns the current video session and canonical transcript result.
- A panel instance has an explicit lifecycle and is updated in place.
- “No subtitles” is a successful domain result; transport and schema failures are errors.
- Async state changes commit only if they still belong to the active session/request.
- API keys remain accessible only to trusted extension contexts and generation requests stay in the background worker.
- New behavior is introduced through failing regression tests before production changes.

## 1. Subtitle and Content Lifecycle

### Content session

Replace the scattered content globals with one controller-owned session. Its state contains a stable route key, request cancellation, canonical panel data, the host element, and a panel handle.

The route key is based on the normalized Bilibili video identity plus the selected `p` value. Hash changes and unrelated query parameters do not start a new session. Entering a different video or part disposes the old session; entering an unsupported route disposes without waiting for the player anchor.

The content controller has injected boundaries for route parsing, anchor waiting, transcript loading, panel mounting, and host removal so lifecycle behavior can be tested without a browser DOM.

### Panel handle

`mountPanel()` returns a handle with these responsibilities:

- `updateData(next)`: apply loading, ready, no-subtitle, or error data for the same video while preserving selected mode, UI language, open Note state, completed generations, and active settings subscription.
- `reset(next)`: start a different video session, abort old generation/language work, clear video-specific state, and apply the new loading data.
- `dispose()`: abort work, stop settings listeners, remove document listeners, cancel scheduled renders, and make later async callbacks inert.

The content controller retains both the host and handle. If Bilibili detaches the host, recovery prepends the same host to the current anchor. It does not mount a second panel or lose the disposer. Leaving a supported route disposes the handle exactly once and removes the host.

### Canonical subtitle data

The content session owns the committed `PlatformTranscriptResult`. The panel reports a successful language change through a callback; the controller updates canonical data before recovery can occur. Loading-only or failed choices never replace the committed result.

The language selector maintains a committed URL, optional pending URL, error, request id, and AbortController. Starting a choice cancels the previous one. Only the latest active request may commit. Failure clears the pending URL, restores the committed selection, keeps the old transcript/generation results, and displays a small error. Success validates the body, commits the transcript and URL, closes Note, clears prior generations once, and restarts generation only for the visible generated tab when appropriate. The select is bound with `.value`.

### Bilibili result contract

All `api.bilibili.com` envelopes must be objects with `code === 0`; otherwise the API layer throws a typed error containing endpoint context and the service message when present. HTTP failure, invalid JSON, and invalid required fields are errors, not empty data.

For a view response, parse both the default cid and the cid selected by `p`:

- Top-level `data.subtitle.list` may be used only when the selected cid is the default cid represented by that response.
- A non-default part must query the player/WBI endpoint for the selected cid.
- Preserve the baseline BV, av, query, watchlater, hostname, and bvid-aware WBI behavior.
- If a view subtitle URL returns a malformed body, try the WBI list for the same cid before failing.
- A valid WBI response with an empty subtitle list is the only fallback path that produces `source: "none"`.
- A selected subtitle file with an invalid body is an error.

`normalizeBilibiliTranscript()` returns `null` for any malformed line. It never casts untrusted input to `Transcript`.

## 2. Generation Streaming

### Provider payloads

Create one pure body builder and retain a fetch-level integration test.

- OpenAI raw HTTP: `model`, `messages`, and `stream`; omit DeepSeek-only fields. Do not send `reasoning_effort` to arbitrary OpenAI models.
- DeepSeek raw HTTP: add top-level `thinking: { type: "enabled" }` and `reasoning_effort: "high"`. Never send SDK-only `extra_body` in raw JSON.

### SSE state machine

Replace permissive line parsing with a small state machine that:

- Preserves an incomplete byte/event buffer between reads.
- Joins multiple `data:` lines in one SSE event according to SSE framing.
- Records content deltas, streamed API errors, finish reason, and `[DONE]`.
- Treats malformed JSON as an explicit stream error rather than silently discarding it.
- Succeeds only after a non-empty final answer, `finish_reason === "stop"`, and `[DONE]`.
- Rejects `length`, `content_filter`, resource/interruption reasons, empty output, and EOF before completion.

Reasoning-only chunks are valid progress but do not enter the user-visible answer.

### Delta transport and rendering

`streamGenerationFromApi()` emits raw content deltas. The background port keeps the existing token message shape but defines `text` as a delta. `llm-provider.ts` accumulates deltas and preserves the panel-facing partial-snapshot callback, avoiding a broad UI API change.

The panel stores the latest text immediately but schedules at most one render per animation frame. Hidden generation tasks update state without forcing a render. Completion and errors flush the visible state immediately. Disposal cancels a pending frame.

### MV3 keepalive

Wrap each active generation request in a bounded keepalive. Every 25 seconds, while the request is unresolved and not aborted, call a lightweight Chrome extension API such as `chrome.runtime.getPlatformInfo()`. Clear the interval in `finally` on success, error, abort, disconnect, or replacement by another request. Do not create a permanent heartbeat.

## 3. Settings, Build, and Title Fixes

Options selects bind their current value with `.value`; the generation checkbox binds with `.checked`. Reset therefore updates both component state and dirty native controls before a subsequent save.

Production builds keep `emptyOutDir: true` for a clean release. The content Vite config uses `emptyOutDir: false` in development mode. `npm run dev` first performs one complete extension build, then starts the content-only watcher in that mode, so `manifest.json`, `background.js`, and the options bundle remain loadable.

Title extraction becomes a pure helper that removes only known Bilibili site suffixes. Ordinary hyphens such as `GPT-5` and `A-B-C` are preserved. Existing filename sanitization remains responsible for illegal filesystem characters.

## Error Presentation

The panel data contract includes a terminal error state separate from loading and no-subtitle. Content-level errors are stored in the session, so host recovery shows the same error instead of returning to an infinite spinner. User-visible messages are concise and do not include credentials, request headers, or raw API payloads. Console diagnostics may contain endpoint/status context but never API keys or generated authorization values.

Generation errors continue to use the existing retry affordance. Subtitle-language errors appear near the selector and preserve the last committed transcript. No automatic retry loops are added.

## Test Strategy

Add Vitest and jsdom, with `npm test` running the complete suite.

### Node/unit tests

- Bilibili URL/part parsing, envelope validation, selected-cid behavior, WBI fallback, malformed body handling, and transcript normalization.
- Provider payload body shapes.
- SSE event framing and every terminal condition.
- Delta reconstruction and keepalive timer cleanup with fake timers.
- Route-key normalization, content session transition/disposal, host recovery, canonical language updates, and stale request suppression through injected fakes.
- Title extraction.

### jsdom/Lit tests

- Loading-to-ready updates preserve mode and generation state.
- A new-video reset clears and aborts video-specific state.
- Language races, rollback, selector value, and dispose-during-request behavior.
- Options reset updates live values/checked state and save receives matching settings.
- Same-frame token callbacks cause one visible render; hidden task updates do not render.

### Integration and completion checks

- Build once, run the content dev config, and assert that every manifest-referenced output still exists.
- Run `npm test`.
- Run strict TypeScript checking and all three Vite builds through `npm run build`.
- Run `git diff --check`.
- Smoke-test in Chrome: single-part video, multipart `p=2`, no subtitles, API failure, language rapid switching/failure, SPA exit/return, host recovery, OpenAI generation, DeepSeek generation, cancellation, Options reset/save, and dev reload.

## Documentation Impact

- Update `docs/architecture.md` with the content-session/panel-handle lifecycle, provider payload rules, strict streaming contract, keepalive scope, and public-settings security boundary.
- Update `docs/development.md` with `npm test`, test layout, dev watcher semantics, and the affected smoke-test matrix.
- Keep `AGENTS.md` short; change it only if its command or invariant summary becomes inaccurate.

## Acceptance Criteria

- Every confirmed included bug has a regression test that was observed failing before its implementation.
- PR #6 is not merged wholesale and baseline security/export behavior remains covered.
- No API key or derived secret appears in content messages, DOM, logs, exports, or tests.
- Automated tests, strict type checking, production build, diff checks, and documented smoke tests pass, or any environment-only smoke gap is reported explicitly.
