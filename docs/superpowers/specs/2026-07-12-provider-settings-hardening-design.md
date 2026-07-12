# Provider Settings Hardening and Extensibility Design

- **Date:** 2026-07-12
- **Status:** Approved
- **Target branch:** `fix/code-review-bugs`
- **Target baseline:** `8f030b6`

## Goal

Make provider credentials and models impossible to mix, close the confirmed settings loading and enforcement gaps, and leave one explicit path for adding future generation providers. Every behavior change is introduced by a regression test that is observed failing before production code changes.

## Confirmed Problems

The current settings contract has one global `generationApiKey` and one task-indexed `generationModels` object. Changing `generationProvider` therefore keeps the previous provider's key and model names. If the user saves OpenAI as the provider after configuring DeepSeek, the background request can send the DeepSeek key to the OpenAI endpoint.

The same audit confirmed these additional settings-domain gaps:

- `generationAccessMode` accepts and migrates `webapp`, although there is no UI or runtime implementation for it.
- Options renders editable defaults before its asynchronous storage read completes and permits edits during a save.
- An already-open Options page does not observe external storage changes and can overwrite newer settings.
- Panel renders with local hard-coded settings before its public-settings read completes and silently keeps them if the read fails.
- Background trusts the content-side `generationEnabled` gate and does not enforce the setting before an API request.
- Options treats a whitespace-only API key as configured while the request path trims it and rejects it.
- `DEFAULT_PUBLIC_SETTINGS` repeats literals already owned by `DEFAULT_SETTINGS`.

## Scope

### Included

- Provider-specific API keys and Overview/Intensive models.
- A provider catalog that drives provider identity, Options metadata, model defaults, endpoint/auth construction, and request-body customization.
- Safe migration from the current global generation key/models and older `summary*` fields.
- Removal of the unused access-mode field and its cache-key contribution.
- Explicit Options loading, saving, error, dirty, and external-conflict states.
- Explicit Panel public-settings pending/error states with fail-closed actions.
- Background enforcement of `generationEnabled`.
- Canonical trimming of API keys and model identifiers.
- Public defaults derived from full defaults.
- Strict validation of public settings messages before Panel consumes them.
- Focused documentation for adding a provider.

### Deferred

- Web-app/session-cookie authentication. It must not return as a setting until a provider implements it end to end.
- User-configurable arbitrary base URLs.
- A marketplace or runtime download mechanism for providers.
- Exposing API keys or key-derived fingerprints to the content context.
- Invalidating existing generated output when only a provider's API key changes. The cache key remains secret-independent.
- Generalizing the SSE state machine beyond the protocols required by an added provider. The catalog supplies a decoder/adapter seam, but unused protocol implementations are not built in advance.

## Design Principles

- A selected provider always reads credentials and models from the same provider profile.
- Provider metadata and request behavior have one registry; Options must not hard-code a separate provider list.
- Secrets remain confined to Options, trusted storage, and the background request path.
- Unknown or unavailable settings fail closed for generation and settings-dependent exports.
- Migration never copies one legacy credential into multiple provider profiles.
- Defaults are derived, not repeated.
- Tests verify real state transitions and outgoing request boundaries rather than only checking mocks.

## 1. Provider Catalog

Add a generation provider catalog under `src/generation/`. Each entry owns:

- stable provider id;
- user-facing label and API-key help URL;
- model placeholder and optional default model;
- endpoint and authorization-header construction;
- provider-specific request-body additions;
- the stream decoder/adapter identifier used by the generation transport.

`GenerationProvider` is derived from the catalog's provider ids. Options iterates the catalog instead of rendering hard-coded OpenAI and DeepSeek buttons. The background generation path resolves the same catalog entry before building a request.

OpenAI and DeepSeek continue to share the existing Chat Completions SSE decoder. Their request builders remain distinct: OpenAI receives only common fields, while DeepSeek adds its supported thinking fields. The catalog creates a defined seam for a future provider with different authentication, body fields, or streaming protocol without pretending that every future provider is OpenAI-compatible.

Adding a provider requires:

1. one catalog/adapter entry and its focused tests;
2. any required manifest host permission;
3. store/privacy disclosure updates when the external recipient changes;
4. real-provider smoke verification.

Default provider profiles and Options provider choices are generated from the catalog, so they do not require a second hand-maintained list.

## 2. Canonical Settings Schema

Replace the global key/models with provider profiles:

```ts
type GenerationModels = {
    overview: string;
    intensive: string;
};

type GenerationProviderProfile = {
    apiKey: string;
    models: GenerationModels;
};

type GenerationProviderSettings = Record<GenerationProvider, GenerationProviderProfile>;

type ExtensionSettings = {
    defaultTab: DefaultTab;
    generationEnabled: boolean;
    generationProvider: GenerationProvider;
    generationProviderSettings: GenerationProviderSettings;
    generationPromptTemplates: GenerationPromptTemplates;
    copyFormat: CopyFormat;
    downloadFormat: DownloadFormat;
};
```

Prompt templates remain shared because they express task intent rather than provider credentials. `generationAccessMode` is removed from the type, defaults, migration output, public cache key, UI assumptions, and documentation.

All provider profiles exist in normalized settings. A new provider receives an empty API key and empty task models unless its catalog entry declares a model default that is resolved at request time. Secrets and model strings are not copied from another provider.

## 3. Migration and Normalization

`mergeSettings()` first validates the selected provider, then chooses one of two paths:

1. If `generationProviderSettings` is present, normalize that new schema and ignore obsolete global credential fields. This prevents a deliberately cleared new profile from resurrecting an old key.
2. If the new profile object is absent, migrate the old global values into only the selected provider profile. The selected provider is read from valid `generationProvider`, then valid `summaryProvider`, then the repository default.

Legacy migration sources include:

- `generationApiKey` or `summaryApiKey`;
- `generationModels`, `summaryModel`, or the existing model migration path;
- current and legacy prompt-template fields;
- current and legacy provider fields.

`generationAccessMode` and `summaryAccessMode` are intentionally ignored. A legacy `webapp` value never changes request behavior and never survives in canonical settings.

API keys and model identifiers are trimmed during normalization. Whitespace-only values become empty strings. Prompt template content is preserved as entered; the generation path may continue to trim only its outer boundary when composing a request.

`saveSettings()` stores only the canonical schema. Normalized reads do not silently rewrite storage until the user saves or another explicit migration write is introduced.

## 4. Options State and Provider Editing

Options uses explicit states:

- `loading`: settings controls and save/reset actions are unavailable;
- `ready`: controls are enabled;
- `saving`: the complete settings fieldset and save/reset actions are disabled;
- `error`: the form is unavailable and a retry action invokes the storage read again.

The form is never interactable while it contains placeholder defaults. Disabling the entire fieldset during a save prevents an older save snapshot from overwriting edits made while the write is pending.

The API key and both model inputs bind to `generationProviderSettings[generationProvider]`. Switching provider changes only the selected id; each provider profile remains intact. Switching back restores that provider's key and models. The configured indicator uses the normalized/trimmed selected key.

Provider buttons, labels, help links, model placeholders, and default-model explanations come from the provider catalog. Prompt controls remain shared.

Options subscribes to `watchSettings()` after the initial load and unsubscribes when disconnected:

- if the form is clean, an external settings update replaces the displayed settings;
- if local edits exist, the external update is held as a conflict and save is blocked;
- the user may explicitly load the external version and discard local edits, or keep the local version and acknowledge that the next save will overwrite storage.

This makes cross-tab overwrites an explicit user decision instead of a silent race.

## 5. Public Settings and Panel Readiness

`DEFAULT_PUBLIC_SETTINGS` is derived with `toPublicSettings(DEFAULT_SETTINGS)` after the projection functions are defined. No public default literal is maintained separately.

`watchPublicSettings()` reports settings and read/connect errors through explicit callbacks. It does not silently publish defaults after a failed connection or a background read error.

Public message validation checks the actual `defaultTab`, copy-format, and download-format enum values rather than accepting arbitrary strings. Invalid messages such as a fabricated `defaultTab: "generated"` are ignored and cannot create an impossible Panel mode. The public projection continues to omit the complete provider-profile object because it contains credentials.

Panel tracks `pending`, `ready`, and `error` public-settings states:

- Original transcript content may render while settings are pending.
- Generated tabs, Note generation, original copy, and original download cannot run until settings are ready.
- The configured default tab is applied only after the first real settings value arrives.
- A read error displays a concise settings-unavailable state and keeps settings-dependent actions closed.
- If the settings port disconnects before the first value, it is an error. After a value has been received, the last value may remain visible, but new generation remains protected by the background enforcement gate.

There is no interval in which hard-coded `generationEnabled`, copy format, download format, or generation cache identity can authorize an action.

## 6. Background Enforcement and Request Selection

For every start request, background reads canonical settings and checks `generationEnabled` before starting keepalive or calling a provider. Disabled generation returns a stable error and performs no provider fetch.

The request path then:

1. resolves the selected catalog entry;
2. reads only `generationProviderSettings[generationProvider]`;
3. rejects an empty selected-provider key before fetch;
4. resolves the selected provider's task model or that provider's declared default;
5. builds endpoint, headers, and body through the selected provider adapter;
6. streams through the adapter's declared decoder.

This pairing makes it structurally impossible for an OpenAI request to read the DeepSeek profile or vice versa. API keys never enter public-settings messages, generation messages, DOM, logs, generated output, documentation examples, or committed fixtures.

## 7. Generation Cache Identity

The public `generationSettingsKey` includes:

- selected provider id;
- selected provider's Overview/Intensive models;
- shared Overview/Intensive prompt templates.

It no longer includes access mode or inactive provider profiles. It intentionally excludes API keys and every key-derived value. Switching provider or changing the selected provider's effective model invalidates generated state; editing an inactive provider profile does not invalidate the current output.

## 8. Test-First Strategy

All regression tests are added before any production file changes. The focused RED run must fail for the confirmed old behavior, not because of syntax, setup, or fixture errors. Only after the RED evidence is recorded does implementation begin.

### Settings and catalog tests

- Defaults create an isolated profile for every catalog provider.
- Switching the selected provider does not move or duplicate credentials/models.
- New-schema normalization preserves both profiles.
- Current global fields migrate only to the selected provider.
- Older `summary*` fields migrate only to the selected provider.
- A present new profile prevents obsolete fields from resurrecting a cleared key.
- `webapp` and access-mode fields disappear from canonical settings and cache identity.
- API keys and model identifiers are trimmed; prompts preserve content.
- Public defaults equal `toPublicSettings(DEFAULT_SETTINGS)`.
- Public settings reject invalid enum strings and never contain provider profiles or credentials.
- Cache identity changes for selected provider/model/prompt changes and not for API-key or inactive-profile changes.

### Storage tests

- Missing storage or a missing settings key returns canonical defaults.
- Stored current and legacy values pass through the same normalization contract.
- Save writes only the canonical provider-profile schema.
- Storage errors reject without substituting editable defaults.
- Watch filters by area/key, normalizes new values, and unsubscribes cleanly.

### Options DOM tests

- A deferred storage read leaves the form and save/reset controls unavailable.
- A failed read shows retry and cannot save defaults.
- Saving disables editing until the write settles.
- DeepSeek and OpenAI keys remain isolated across repeated provider switches.
- Provider-specific models remain isolated across repeated switches.
- A whitespace-only key is displayed as unconfigured.
- Reset and save operate on the complete canonical provider profiles.
- Clean external updates refresh the form; dirty external updates create a blocking conflict with explicit resolution actions.

### Background and API tests

- `generationEnabled: false` returns an error without keepalive/provider invocation.
- OpenAI URL, authorization header, model, and body come only from the OpenAI profile.
- DeepSeek URL, authorization header, model/default, and body come only from the DeepSeek profile.
- A missing selected-provider key fails before fetch even when another provider has a key.
- Existing strict SSE, delta, cancellation, and keepalive behavior remains unchanged.

### Public-client and Panel tests

- No-port and background-read failures surface through the error callback instead of publishing defaults.
- Before the first settings value, clicking generated/export actions cannot generate, copy, or download.
- The first real settings value applies its default tab and formats.
- A settings error remains visible and fail-closed.
- A disabled generation setting prevents Overview, Intensive, and Note generation.
- Dynamic settings and generation cache-key changes retain the existing invalidation semantics.

### Completion checks

- Run every focused RED test and record the expected failures before production edits.
- Run focused GREEN tests after each implementation slice.
- Run `npm test`.
- Run `npm exec tsc -- --noEmit --pretty false`.
- Run `npm run build`.
- Run `git diff --check`.
- Smoke-test provider switching, two saved provider profiles, Options reload/conflict behavior, settings-read failure, disabled generation, OpenAI generation, and DeepSeek generation in Chrome; report any environment-only row that cannot be executed.

## Documentation Impact

- Update `docs/architecture.md` with the canonical provider profile schema, provider catalog, migration rules, Panel readiness, and background enforcement boundary.
- Update `docs/development.md` with the exact steps for adding a provider, required tests, manifest permission changes, and Chrome smoke rows.
- Keep `AGENTS.md` short. Change it only if its security/settings invariant needs one concise provider-profile clarification.

## Trade-offs

- Nested provider profiles and migration are more code than clearing the key on switch, but they support users who configure multiple providers and prevent credential mixing by construction.
- The provider catalog adds an indirection, but removes duplicated provider lists and local conditionals from Options and request construction.
- Fail-closed loading adds a brief disabled state before settings arrive. This is preferable to an incorrect request, export format, or destructive save.
- Removing `webapp` discards a stored value, but it removes no working behavior because that mode was never implemented.
- External-update conflict UI adds state to Options, but prevents silent cross-tab data loss.

## Acceptance Criteria

- Every confirmed settings-domain bug above has a regression test observed failing before its fix.
- Saving and switching providers never exposes, copies, or sends another provider's key or model.
- A legacy shared key/model migrates to exactly one provider: the selected legacy provider.
- Adding a catalog provider automatically gives Options a provider choice and canonical empty profile; request behavior remains adapter-owned.
- Options cannot edit/save placeholder defaults or overwrite changes during unresolved load/save operations.
- External Options updates cannot be silently overwritten by a dirty stale form.
- Panel performs no settings-dependent action before real public settings arrive and shows an explicit error on initial failure.
- Background performs no provider request when generation is disabled.
- Whitespace-only keys are consistently unconfigured.
- Public defaults have one source of truth and public messages remain secret-free.
- Focused tests, full tests, strict type checking, production build, and diff checks pass; Chrome-only gaps are reported explicitly.
