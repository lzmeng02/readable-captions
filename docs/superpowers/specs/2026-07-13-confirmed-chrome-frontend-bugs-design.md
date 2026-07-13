# Confirmed Chrome Frontend Bugs Design

- **Date:** 2026-07-13
- **Status:** Approved in conversation
- **Branch:** `fix/provider-settings-hardening`
- **Scope:** Fix frontend defects confirmed by code and automated behavior. Real Chrome/Bilibili smoke remains recorded but is not a merge gate for this patch.

## Problem statement

Provider profiles are isolated in canonical settings, but the Options UI renders every provider through the same reused password input. Chrome Autofill and form restoration are external writers to the live DOM. An Autofill `input` event is indistinguishable from manual input and is handled against the currently selected provider, so a DeepSeek credential can be copied into the OpenAI draft even though storage and request selection are provider-scoped.

The same audit confirmed three adjacent frontend defects:

1. API-key reveal state is shared across providers.
2. A public-settings port that disconnects after its first value is never reconnected, allowing an open Panel to retain stale public settings after an MV3 service-worker lifecycle disconnect.
3. The Panel More menu does not clear its open state on an outside pointer event or language action.

## Design

### Provider-specific API-key control

- Treat an API key as an extension setting, not a website login password: render it as `type="text"` and mask it in Chrome with `-webkit-text-security: disc` while hidden.
- Give the control provider-specific identity and metadata: a provider-specific `name`, stable `data-setting`, `autocomplete="off"`, and disabled spellcheck/autocapitalization.
- Use Lit `keyed(provider, template)` for the provider-specific controls so switching providers destroys the old stateful input nodes instead of reusing them.
- Use Lit `live()` for controlled values that must overwrite browser-restored live DOM values.
- Restore hidden-key state whenever provider identity or the authoritative draft can change: initial load/retry, provider switch, reset, clean external refresh, and explicit conflict resolution.
- Do not automatically delete already-persisted identical provider credentials because intent cannot be inferred safely.

### Public-settings reconnection

- Refactor `watchPublicSettings()` into a reconnecting connection lifecycle.
- On any unexpected disconnect, immediately report an error so the Panel fails closed, then reconnect with bounded exponential backoff.
- A valid settings message recovers the Panel to ready state and resets the backoff/outage report state.
- Ignore messages and disconnects from superseded ports. Unsubscribe must disconnect the active port and cancel any scheduled reconnect.
- Do not publish defaults while disconnected.

### More-menu state

- An outside pointer event closes the menu only when it is open; a closed menu must not rerender for every page pointer event.
- Settings, Note, and language actions close the menu before executing their action.
- Existing reset/dispose and per-panel isolation behavior remains unchanged.

## Explicitly out of scope

- Bilibili login-dependent subtitle smoke and authenticated provider streaming.
- Clipboard/download permission behavior and real CSS overlay geometry; keep them recorded as unverified.
- Changing the product semantics of the module-level collapsed state.
- Broader keyboard/focus redesign. These require a separate accessibility decision rather than being bundled into the credential fix.

## Test strategy

Tests must be added and observed RED before production edits:

- Options: provider switch creates new API/model nodes; the API control is not a password field; metadata is provider-specific; OpenAI remains empty/unconfigured after DeepSeek input; reveal state resets; save preserves isolated profiles.
- Public client: post-ready disconnect reports fail-closed error, reconnects, recovers on a new valid value, ignores stale ports, and stops timers/ports on unsubscribe.
- Panel: outside pointer and language actions close an open More menu; outside pointer while closed does not trigger a state transition.

Then run all affected suites, the complete test suite, TypeScript, production build, and `git diff --check`. Rebuild `dist/` for manual testing without staging generated files. Real Chrome rows remain explicitly unverified.

## Tradeoffs

- `-webkit-text-security` is non-standard, but the product is explicitly Chrome-only. Avoiding password-field semantics is more reliable than trying to distinguish Autofill events after they occur.
- Reconnection adds timers and port-lifecycle state. Bounded backoff, stale-port guards, and deterministic cleanup keep the behavior finite and testable.
- Persisted duplicate keys are not auto-cleaned, preventing accidental credential loss at the cost of one manual cleanup for users whose draft/storage was already polluted.
