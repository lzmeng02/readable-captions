# Provider Settings Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate every provider's credentials and models, close the confirmed settings races and enforcement gaps, and make future providers enter through one catalog.

**Architecture:** A provider catalog owns provider ids, UI metadata, request construction, and the current stream adapter id. Canonical settings store one profile per catalog provider; Options edits the selected profile through an explicit load/save/conflict state machine, while Panel waits for real public settings and Background enforces the final generation gate.

**Tech Stack:** TypeScript, Lit, Chrome Manifest V3 APIs, Vitest, jsdom, Vite.

## Global Constraints

- Add the complete regression suite and observe the focused RED failures before modifying any production file.
- Never copy a legacy API key/model into more than the selected legacy provider profile.
- Never expose an API key or a key-derived value through public settings, runtime ports, page/Panel DOM, logs, generated output, docs examples, or committed fixtures.
- Keep the private storage envelope revision outside `ExtensionSettings`, public settings, cache identity, runtime messages, and UI; correlate Options save acknowledgements by revision only.
- Resolve catalog default models at request time; keep normalized stored model values empty when the user did not configure one.
- Remove `generationAccessMode`; do not implement or advertise `webapp` authentication.
- Preserve strict SSE completion, raw-delta transport, request-scoped keepalive, cancellation, and Markdown sanitization.
- Preserve the user's untracked `tests/data/` directory and do not commit generated `dist/` or dependencies.
- Keep `AGENTS.md` short and update canonical docs when the settings/request contract changes.

---

### Task 1: Add the complete regression suite and capture RED

**Files:**
- Create: `tests/unit/settings/defaults.test.ts`
- Create: `tests/unit/settings/storage.test.ts`
- Create: `tests/unit/settings/public-client.test.ts`
- Create: `tests/unit/generation/llm-api-provider-selection.test.ts`
- Create: `tests/dom/options/options-state.test.ts`
- Create: `tests/dom/options/options-provider-profiles.test.ts`
- Create: `tests/dom/panel/mount-settings-readiness.test.ts`
- Modify: `tests/unit/settings/public-settings.test.ts`
- Modify: `tests/unit/background/background-stream.test.ts`

**Interfaces:**
- Consumes: current `mergeSettings()`, `getSettings()`, `saveSettings()`, `watchSettings()`, `toPublicSettings()`, `watchPublicSettings()`, `streamGenerationFromApi()`, `attachGenerationStreamPort()`, `ReadableCaptionsOptionsApp`, and `mountPanel()` behavior.
- Produces: a committed RED contract for provider isolation, migration, lifecycle gates, canonical defaults, and background enforcement. Tests may use `unknown`/runtime structural assertions so missing future types produce assertion failures rather than module-resolution errors.

- [x] **Step 1: Add settings migration and normalization RED tests**

Create `tests/unit/settings/defaults.test.ts` with explicit structural assertions. Use fake non-secret values only:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../../../src/settings/defaults";

describe("provider settings normalization", () => {
    it("creates an isolated empty profile for every provider", () => {
        expect(DEFAULT_SETTINGS).toMatchObject({
            generationProvider: "deepseek",
            generationProviderSettings: {
                openai: { apiKey: "", models: { overview: "", intensive: "" } },
                deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
            },
        });
    });

    it("migrates current globals only into the selected provider and trims them", () => {
        const value = mergeSettings({
            generationProvider: "deepseek",
            generationApiKey: "  ds-test-key  ",
            generationModels: { overview: "  ds-overview  ", intensive: "  ds-intensive  " },
            generationAccessMode: "webapp",
        });

        expect(value).toMatchObject({
            generationProvider: "deepseek",
            generationProviderSettings: {
                openai: { apiKey: "", models: { overview: "", intensive: "" } },
                deepseek: {
                    apiKey: "ds-test-key",
                    models: { overview: "ds-overview", intensive: "ds-intensive" },
                },
            },
        });
        expect(value).not.toHaveProperty("generationApiKey");
        expect(value).not.toHaveProperty("generationModels");
        expect(value).not.toHaveProperty("generationAccessMode");
    });

    it("migrates summary fields only into the valid legacy provider", () => {
        expect(mergeSettings({
            generationProvider: "invalid",
            summaryProvider: "openai",
            summaryApiKey: "  oa-test-key  ",
            summaryModel: "  gpt-test  ",
            summaryAccessMode: "webapp",
        })).toMatchObject({
            generationProvider: "openai",
            generationProviderSettings: {
                openai: {
                    apiKey: "oa-test-key",
                    models: { overview: "gpt-test", intensive: "gpt-test" },
                },
                deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
            },
        });
    });

    it("does not resurrect obsolete credentials when the new schema is present", () => {
        const value = mergeSettings({
            generationProvider: "openai",
            generationProviderSettings: {
                openai: { apiKey: "", models: { overview: "", intensive: "" } },
            },
            generationApiKey: "obsolete-test-key",
            summaryApiKey: "older-test-key",
        });
        expect((value as any).generationProviderSettings.openai.apiKey).toBe("");
    });

    it("preserves prompt content while normalizing keys and models", () => {
        const value = mergeSettings({
            generationProvider: "openai",
            generationProviderSettings: {
                openai: { apiKey: "  oa-test-key  ", models: { overview: "  gpt-test  " } },
            },
            generationPromptTemplates: { overview: "  keep prompt spacing  ", intensive: "" },
        });
        expect((value as any).generationProviderSettings.openai).toEqual({
            apiKey: "oa-test-key",
            models: { overview: "gpt-test", intensive: "" },
        });
        expect(value.generationPromptTemplates.overview).toBe("  keep prompt spacing  ");
    });
});
```

- [x] **Step 2: Add storage and public-boundary tests**

Create `tests/unit/settings/storage.test.ts` with a complete fake `chrome.storage.local` object and these assertions:

```ts
it("save writes only canonical provider profiles", async () => {
    const set = vi.fn((items: Record<string, unknown>, callback: () => void) => callback());
    vi.stubGlobal("chrome", {
        runtime: {},
        storage: { local: { get: vi.fn(), set }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    });

    const saved = await saveSettings({
        ...DEFAULT_SETTINGS,
        generationProvider: "openai",
        generationApiKey: " legacy-trap ",
        generationModels: { overview: "legacy-model", intensive: "legacy-model" },
        generationProviderSettings: {
            openai: { apiKey: " oa-test-key ", models: { overview: " gpt-test ", intensive: "" } },
            deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
        },
    } as any);

    expect(saved).not.toHaveProperty("generationApiKey");
    expect(saved).not.toHaveProperty("generationModels");
    expect(set).toHaveBeenCalledWith({ extensionSettings: saved }, expect.any(Function));
});
```

In the same file, add independent tests for missing storage, missing key, `runtime.lastError`, legacy raw-object compatibility, versioned-envelope round trips, same-value saves with distinct revisions, local-area/key filtering, normalization of watcher values, separate watcher provenance metadata, and disposer removal. Capture the real watcher passed to `addListener`, emit both irrelevant and relevant changes, and assert only canonical settings plus `{ revision | null }` reach the listener.

Extend `tests/unit/settings/public-settings.test.ts` with:

```ts
it("derives public defaults from canonical defaults", () => {
    expect(DEFAULT_PUBLIC_SETTINGS).toEqual(toPublicSettings(DEFAULT_SETTINGS));
});

it("never exposes provider profiles or credentials", () => {
    expect(toPublicSettings(DEFAULT_SETTINGS)).not.toHaveProperty("generationProviderSettings");
});

it("rejects invalid public enum values", () => {
    expect(isPublicSettingsPortMessage({
        type: "settings",
        settings: {
            ...DEFAULT_PUBLIC_SETTINGS,
            defaultTab: "generated",
            copyFormat: "html",
            downloadFormat: "pdf",
        },
    })).toBe(false);
});

it("keeps cache identity secret-independent and scoped to the selected profile", () => {
    const base = mergeSettings(DEFAULT_SETTINGS);
    const withKey = mergeSettings({
        ...base,
        generationProviderSettings: {
            ...base.generationProviderSettings,
            deepseek: { ...base.generationProviderSettings.deepseek, apiKey: "ds-test-key" },
        },
    });
    expect(toPublicSettings(withKey).generationSettingsKey)
        .toBe(toPublicSettings(base).generationSettingsKey);
});
```

- [x] **Step 3: Add provider-selection request RED tests**

Create `tests/unit/generation/llm-api-provider-selection.test.ts`. Build hybrid fixtures containing both the desired profiles and deliberately wrong legacy trap fields so the current implementation reaches `fetch()` and fails the boundary assertions:

```ts
it("uses only the selected OpenAI profile", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => createSseResponse(successfulSse));
    vi.stubGlobal("fetch", fetchMock);
    const settings = {
        ...createSettings({ generationProvider: "openai" }),
        generationApiKey: "wrong-deepseek-trap",
        generationModels: { overview: "wrong-deepseek-model", intensive: "wrong-deepseek-model" },
        generationProviderSettings: {
            openai: { apiKey: "oa-test-key", models: { overview: "gpt-test", intensive: "gpt-test" } },
            deepseek: { apiKey: "ds-test-key", models: { overview: "deepseek-test", intensive: "deepseek-test" } },
        },
    } as any;

    await streamGenerationFromApi({
        settings,
        request: generationRequest,
        signal: new AbortController().signal,
        onToken: vi.fn(),
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer oa-test-key");
    expect(JSON.parse(String(init?.body)).model).toBe("gpt-test");
});

it("rejects a missing selected-provider key before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const settings = {
        ...createSettings({ generationProvider: "openai", generationApiKey: "wrong-global-trap" }),
        generationProviderSettings: {
            openai: { apiKey: "", models: { overview: "gpt-test", intensive: "gpt-test" } },
            deepseek: { apiKey: "ds-test-key", models: { overview: "", intensive: "" } },
        },
    } as any;
    await expect(streamGenerationFromApi({
        settings,
        request: generationRequest,
        signal: new AbortController().signal,
        onToken: vi.fn(),
    })).rejects.toThrow("API Key is not set");
    expect(fetchMock).not.toHaveBeenCalled();
});
```

Add a DeepSeek case that asserts its own key, request-time `deepseek-v4-flash` default, thinking fields, and absence of `extra_body`.

- [x] **Step 4: Add Options state and profile-isolation RED tests**

In the two new jsdom files, mock only `getSettings`, `saveSettings`, and `watchSettings`. Use deferred promises to assert:

```ts
it("keeps the form unavailable while the initial read is pending", async () => {
    const pending = deferred<ExtensionSettings>();
    storageMocks.getSettings.mockReturnValueOnce(pending.promise);
    const app = await mountInitialOptions();
    expect(app.shadowRoot?.querySelector('[role="status"]')?.textContent).toContain("加载");
    expect(app.shadowRoot?.querySelector("fieldset")?.hasAttribute("disabled")).toBe(true);
    expect(app.shadowRoot?.querySelector<HTMLButtonElement>(".btn-primary")?.disabled).toBe(true);
    expect(storageMocks.saveSettings).not.toHaveBeenCalled();
});

it("isolates API keys and models across repeated provider switches", async () => {
    const app = await mountLoadedOptions(canonicalFixture());
    openGenerationTab(app);
    selectProvider(app, "deepseek");
    inputValue(app, 'input[name="generationApiKey"]', "ds-test-key");
    inputValue(app, 'input[data-task="overview"]', "deepseek-overview");
    selectProvider(app, "openai");
    expect(valueOf(app, 'input[name="generationApiKey"]')).toBe("");
    inputValue(app, 'input[name="generationApiKey"]', "oa-test-key");
    inputValue(app, 'input[data-task="overview"]', "gpt-test");
    selectProvider(app, "deepseek");
    expect(valueOf(app, 'input[name="generationApiKey"]')).toBe("ds-test-key");
    expect(valueOf(app, 'input[data-task="overview"]')).toBe("deepseek-overview");
});
```

Add complete tests for rejected load + retry, save-time fieldset lock and programmatic event guard, whitespace-only key status, clean external update, dirty conflict blocking save, both conflict-resolution actions, edit-then-revert becoming clean, own-save watcher acknowledgement, newer external event preservation, and disposer invocation.

- [x] **Step 5: Add public-client, Panel readiness, and Background gate RED tests**

Test the future two-callback public client without importing nonexistent modules:

```ts
it("reports a missing runtime port instead of publishing defaults", async () => {
    vi.stubGlobal("chrome", { runtime: {} });
    const onSettings = vi.fn();
    const onError = vi.fn();
    watchPublicSettings(onSettings, onError);
    await Promise.resolve();
    expect(onSettings).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
});
```

In `mount-settings-readiness.test.ts`, mock `watchPublicSettings` by capturing both callbacks without calling either. Mount a ready transcript, click generated/copy/download/Note actions, and assert no `streamGeneration`, copy, or download dependency runs. Then deliver real settings and assert the configured default tab becomes active. Deliver an error instead and assert an alert is visible and actions stay closed.

Add this exact Background test to `background-stream.test.ts`:

```ts
it("does not start keepalive or a provider request when generation is disabled", async () => {
    const fake = createFakeRuntimePort();
    const keepAlive = vi.fn<KeepAliveRunner>((work) => work());
    const streamGenerationFromApi = vi.fn(async () => "unexpected");
    attachGenerationStreamPort(fake.port, createDependencies({
        getSettings: vi.fn(async () => createSettings({ generationEnabled: false })),
        keepAlive,
        streamGenerationFromApi,
    }));
    fake.emitMessage({ type: "start", request: generationRequest });
    await flushPromises();
    expect(keepAlive).not.toHaveBeenCalled();
    expect(streamGenerationFromApi).not.toHaveBeenCalled();
    expect(fake.postedMessages).toEqual([{
        type: "error",
        message: "Generation is disabled in the extension settings.",
    }]);
});
```

- [x] **Step 6: Run the focused RED suite and confirm the reasons**

Run:

```powershell
npm test -- tests/unit/settings/defaults.test.ts tests/unit/settings/storage.test.ts tests/unit/settings/public-settings.test.ts tests/unit/settings/public-client.test.ts tests/unit/generation/llm-api-provider-selection.test.ts tests/unit/background/background-stream.test.ts tests/dom/options/options-state.test.ts tests/dom/options/options-provider-profiles.test.ts tests/dom/panel/mount-settings-readiness.test.ts
```

Expected: failures specifically show missing provider profiles, legacy credential reuse, access-mode survival, invalid enum acceptance, editable/loading defaults, shared provider inputs, silent public fallback, Panel actions before settings, and Background API execution while disabled. Fix test syntax/setup until the suite fails only for those behaviors; do not touch `src/`.

- [x] **Step 7: Commit the RED tests**

```powershell
git add -- tests/unit/settings tests/unit/generation/llm-api-provider-selection.test.ts tests/unit/background/background-stream.test.ts tests/dom/options tests/dom/panel/mount-settings-readiness.test.ts
git commit -m "test: capture provider settings regressions"
```

---

### Task 2: Implement the provider catalog and canonical profile vertical slice

**Files:**
- Create: `src/generation/provider-catalog.ts`
- Modify: `src/settings/types.ts`
- Modify: `src/settings/defaults.ts`
- Modify: `src/settings/public.ts`
- Modify: `src/options/index.ts`
- Modify: `src/generation/llm-api.ts`
- Modify: `tests/helpers/generation.ts`
- Modify: existing generation/background/settings tests that construct `ExtensionSettings`

**Interfaces:**
- Produces: `GENERATION_PROVIDERS`, `GENERATION_PROVIDER_VALUES`, `GenerationProvider`, `isGenerationProvider()`, `getGenerationProvider()`, `GenerationProviderProfile`, `GenerationProviderSettings`, and canonical `ExtensionSettings.generationProviderSettings`.
- Preserves: existing `streamGenerationFromApi()` and public-settings external signatures until later tasks.

- [x] **Step 1: Add the provider catalog**

Implement these exact public shapes in `src/generation/provider-catalog.ts`:

```ts
export type ProviderChatMessage = { role: "system" | "user"; content: string };
export type GenerationStreamDecoderId = "chat-completions-sse";
export type ProviderRequest = {
    url: string;
    headers: Readonly<Record<string, string>>;
    body: Record<string, unknown>;
    streamDecoder: GenerationStreamDecoderId;
};
export type GenerationProviderDefinition<Id extends string = string> = {
    id: Id;
    label: string;
    apiKeyHelpUrl: string;
    modelPlaceholder: string;
    defaultModel?: string;
    modelHelpText: string;
    buildRequest(input: {
        apiKey: string;
        model: string;
        messages: readonly ProviderChatMessage[];
    }): ProviderRequest;
};

export const GENERATION_PROVIDERS = [
    {
        id: "openai",
        label: "OpenAI",
        apiKeyHelpUrl: "https://platform.openai.com/api-keys",
        modelPlaceholder: "gpt-4o-mini",
        modelHelpText: "OpenAI requires an explicit model name.",
        buildRequest: ({ apiKey, model, messages }) => ({
            url: "https://api.openai.com/v1/chat/completions",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: { model, messages, stream: true },
            streamDecoder: "chat-completions-sse" as const,
        }),
    },
    {
        id: "deepseek",
        label: "DeepSeek",
        apiKeyHelpUrl: "https://platform.deepseek.com/api_keys",
        modelPlaceholder: "deepseek-v4-flash",
        defaultModel: "deepseek-v4-flash",
        modelHelpText: "Leave blank to use the DeepSeek default model.",
        buildRequest: ({ apiKey, model, messages }) => ({
            url: "https://api.deepseek.com/chat/completions",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: {
                model,
                messages,
                stream: true,
                thinking: { type: "enabled" },
                reasoning_effort: "high",
            },
            streamDecoder: "chat-completions-sse" as const,
        }),
    },
] as const satisfies readonly GenerationProviderDefinition[];

export type GenerationProvider = (typeof GENERATION_PROVIDERS)[number]["id"];
export const GENERATION_PROVIDER_VALUES = GENERATION_PROVIDERS.map(({ id }) => id) as readonly GenerationProvider[];
export function isGenerationProvider(value: unknown): value is GenerationProvider {
    return typeof value === "string" && GENERATION_PROVIDER_VALUES.includes(value as GenerationProvider);
}
export function getGenerationProvider(provider: GenerationProvider): GenerationProviderDefinition<GenerationProvider> {
    return GENERATION_PROVIDERS.find(({ id }) => id === provider)!;
}
```

- [x] **Step 2: Replace the settings schema and migration**

In `types.ts`, import/re-export `GenerationProvider` and define the profile types from the approved design. Remove access-mode constants/types and global key/model properties.

In `defaults.ts`, create fresh empty profile objects by iterating `GENERATION_PROVIDER_VALUES`. Use `Object.hasOwn(raw, "generationProviderSettings")` to distinguish new schema from legacy data. Provider selection precedence must be valid current provider, valid legacy provider, then default. If new schema is present—even malformed—normalize only it and never resurrect obsolete globals. If absent, migrate global/summary key and models to the selected provider only. Trim keys/models, preserve prompts, and return independent nested objects.

The core branch must follow this structure:

```ts
const provider = isGenerationProvider(raw.generationProvider)
    ? raw.generationProvider
    : isGenerationProvider(raw.summaryProvider)
        ? raw.summaryProvider
        : DEFAULT_SETTINGS.generationProvider;
const hasProviderSettings = Object.hasOwn(raw, "generationProviderSettings");
const providerSettings = hasProviderSettings
    ? normalizeProviderSettings(raw.generationProviderSettings)
    : migrateLegacyProviderSettings(raw, provider);
```

Keep the existing `extensionSettings` key backward compatible: reads/watchers unwrap both legacy raw objects and the private `{ storageVersion: 1, revision, settings }` envelope. `getSettings()` returns only canonical `ExtensionSettings`; `watchSettings()` surfaces `{ revision | null }` separately. Options generates the revision before every save so same-value writes remain distinguishable.

- [x] **Step 3: Derive and validate public settings**

Update `public.ts` so the cache payload reads only the selected profile models and shared prompts, then reduce that secret-free payload to a deterministic 64-bit FNV-1a digest encoded as fixed 13-character base36. Validate `defaultTab`, copy, and download values against their exported arrays. Define `DEFAULT_PUBLIC_SETTINGS` after projection helpers as:

```ts
export const DEFAULT_PUBLIC_SETTINGS = toPublicSettings(DEFAULT_SETTINGS);
```

Do not include provider profiles, API keys, access mode, inactive profiles, or key-derived material.

- [x] **Step 4: Migrate request selection and Options provider controls**

In `llm-api.ts`, remove endpoint/body provider conditionals. Resolve the selected profile and catalog entry, require the selected key, choose the task model (`note` uses `intensive`), and resolve explicit/default model through catalog-owned validation using the selected entry identity. Call `buildRequest()`, feed its URL/headers/body to `fetch()`, then consume `providerRequest.streamDecoder` through an exhaustive `Record<GenerationStreamDecoderId, ProviderStreamDecoder>` registry. Extending the decoder union must fail typecheck until its adapter is implemented.

In Options, iterate `GENERATION_PROVIDERS`, derive `selectedProfile`, and immutably update only that profile's key/models. Do not normalize on every input event; preserve the draft value and rely on configured-state `.trim()` plus save normalization. Add stable `data-provider` and `data-task` selectors used by the DOM tests.

- [x] **Step 5: Update test helpers and existing fixtures**

Change `createSettings()` to deep-merge `generationProviderSettings` and prompts while still forcing a non-secret fake selected key for API tests:

```ts
export type SettingsOverrides = Partial<Omit<
    ExtensionSettings,
    "generationProviderSettings" | "generationPromptTemplates"
>> & {
    generationProviderSettings?: Partial<Record<GenerationProvider, Partial<GenerationProviderProfile>>>;
    generationPromptTemplates?: Partial<GenerationPromptTemplates>;
};
```

Update every old `generationApiKey`, `generationModels`, and `generationAccessMode` fixture found by `rg` to the canonical profile shape. Keep fake values visibly non-production (`oa-test-key`, `ds-test-key`).

- [x] **Step 6: Run provider/settings focused GREEN checks**

```powershell
npm test -- tests/unit/settings/defaults.test.ts tests/unit/settings/storage.test.ts tests/unit/settings/public-settings.test.ts tests/unit/generation/llm-api-provider-selection.test.ts tests/unit/generation/llm-api-payload.test.ts tests/unit/generation/llm-api-stream.test.ts tests/unit/generation/llm-api-delta.test.ts tests/dom/options/options-provider-profiles.test.ts
npm exec tsc -- --noEmit --pretty false
```

Expected: provider/schema/request/profile tests pass. Options lifecycle, Panel readiness, and disabled-background tests may remain RED until their tasks.

- [x] **Step 7: Commit the vertical slice**

```powershell
git add -- src/generation/provider-catalog.ts src/generation/llm-api.ts src/settings src/options/index.ts tests/helpers/generation.ts tests/unit tests/dom/options/options-provider-profiles.test.ts
git commit -m "fix: isolate provider credentials and models"
```

---

### Task 3: Implement the Options lifecycle and external-conflict state machine

**Files:**
- Modify: `src/options/index.ts`
- Test: `tests/dom/options/options-state.test.ts`
- Test: `tests/dom/options/options-live-controls.test.ts`

**Interfaces:**
- Consumes: canonical settings plus `getSettings()`, `saveSettings()`, and `watchSettings()`.
- Produces: `OptionsPhase`, guarded draft editing, canonical dirty comparison, external conflict resolution, own-save watcher acknowledgement, and lifecycle cleanup.

- [x] **Step 1: Introduce explicit component state**

Use these fields and method boundaries:

```ts
type OptionsPhase = "loading" | "ready" | "saving" | "error";
type ExternalConflict = { settings: ExtensionSettings; sequence: number };
type PendingSave = { revision: string; ownWatchSequence: number | null };

@state() private phase: OptionsPhase = "loading";
@state() private draft: ExtensionSettings | null = null;
@state() private conflict: ExternalConflict | null = null;
@state() private loadError = "";
private baseline: ExtensionSettings | null = null;
private pendingSave: PendingSave | null = null;
private unwatchSettings: (() => void) | null = null;
private operationVersion = 0;
private watchSequence = 0;
```

Canonical equality is `JSON.stringify(mergeSettings(value))`. Derive dirty status from draft vs baseline; do not use a sticky boolean.

- [x] **Step 2: Guard load, retry, save, and teardown**

Start with `draft = null`. Subscribe before starting the initial read; while the read is pending, buffer the latest watcher value and reconcile it ahead of the older read result before setting draft/baseline and entering ready. On failure enter error and render retry without editable defaults. Increment `operationVersion` on each load and disconnect so stale promises cannot commit. Reload/disconnect invokes watcher cleanup, resets retained acknowledgement identities, and clears the status timer.

Every edit handler must check `phase === "ready"`; unresolved conflict also blocks submit. During save, disable the complete fieldset plus save/reset, create the unique write revision before calling `saveSettings(snapshot, revision)`, retain that revision for acknowledgement correlation, and use the save return value as the new baseline.

- [x] **Step 3: Implement watcher ordering and conflict resolution**

Increment `watchSequence` for every watcher event. Only a watcher revision equal to the pending write revision is the component's own acknowledgement; canonical value equality is never provenance. If save resolves before that watcher event, retain the unobserved revision in a bounded set until consumed; consuming it must not clear or replace an already-held newer external conflict. A different/null revision is external even when its settings equal an older save, so X/no-ack → Z → genuine X is processed. A different incoming value replaces a clean draft, but becomes the latest conflict for a dirty/saving draft. Preserve external events newer than the own-save acknowledgement when save resolves, and reset retained revisions on reload/disconnect.

Implement exact resolution semantics:

```ts
private handleLoadExternal(): void {
    if (!this.conflict) return;
    this.draft = this.conflict.settings;
    this.baseline = this.conflict.settings;
    this.conflict = null;
}

private handleKeepLocal(): void {
    if (!this.conflict || !this.draft) return;
    this.baseline = this.conflict.settings;
    this.conflict = null;
}
```

The second path remains dirty and makes the next save an explicit overwrite.

- [x] **Step 4: Render the state machine**

Render a loading status while loading, a `role="alert"` error with Retry on failure, and the form only when a draft exists. Wrap settings content in a borderless fieldset disabled during saving. Render a conflict banner with “载入外部设置” and “保留当前编辑”; disable save until one is selected. Keep About navigable.

- [x] **Step 5: Run Options GREEN checks and commit**

```powershell
npm test -- tests/dom/options/options-state.test.ts tests/dom/options/options-provider-profiles.test.ts tests/dom/options/options-live-controls.test.ts
npm exec tsc -- --noEmit --pretty false
git add -- src/options/index.ts tests/dom/options
git commit -m "fix: make options settings race safe"
```

---

### Task 4: Order public snapshots and fail closed until real settings reach Panel

**Files:**
- Modify: `src/background-app.ts`
- Modify: `src/settings/public-client.ts`
- Modify: `src/panel/mount.ts`
- Modify: `src/panel/panel-view.ts`
- Test: `tests/unit/settings/public-client.test.ts`
- Test: `tests/unit/background/background-app.test.ts`
- Test: `tests/dom/panel/mount-settings-readiness.test.ts`
- Test: existing `tests/dom/panel/*.test.ts`

**Interfaces:**
- Produces: `watchPublicSettings(onSettings, onError)`, `PublicSettingsStatus = "pending" | "ready" | "error"`, and fail-closed Panel UI options.
- Preserves: Original transcript visibility, settings navigation, panel handle lifecycle, generated state invalidation, export behavior after readiness, and all subtitle-language behavior.

- [x] **Step 1: Order Background snapshot/live delivery and make public-client errors explicit**

Change the signature to:

```ts
export function watchPublicSettings(
    onSettings: (settings: PublicExtensionSettings) => void,
    onError: (error: Error) => void,
): () => void;
```

In `background-app.ts`, store a revision per connected public-settings port. A live `watchSettings()` broadcast advances the revision and invalidates that port's pending initial read success/error; disconnect deletes the port so late completions are ignored.

No port, a thrown connect, a background `{ type: "error" }`, or disconnect before the first value calls `onError` once and never publishes defaults. Valid settings call `onSettings`. Invalid messages are ignored. Cleanup remains idempotent and must not call `onError`.

- [x] **Step 2: Gate Panel behavior on readiness**

Replace hard-coded authorization defaults with nullable/readiness state:

```ts
type PublicSettingsStatus = "pending" | "ready" | "error";
let settingsStatus: PublicSettingsStatus = "pending";
let settingsError: string | null = null;
let generationEnabled = false;
let copyFormat: PublicExtensionSettings["copyFormat"] | null = null;
let downloadFormat: PublicExtensionSettings["downloadFormat"] | null = null;
```

Require `settingsStatus === "ready"` in generation, Note open/retry, copy, download, and generated-tab selection paths. Apply the first real default tab only from `onSettings`. An error sets status/error, aborts/clears generation work, and renders without substituting defaults.

- [x] **Step 3: Render accessible disabled actions and error state**

Extend `PanelUiOptions` with status/error. Disable header copy/download, generated tabs, and Note generation until ready; leave Original transcript and Settings navigation available. Add a compact `role="alert"` for error and `role="status"` for pending. Disabled buttons must use native `disabled`, not only CSS.

- [x] **Step 4: Run Panel/public GREEN checks and commit**

```powershell
npm test -- tests/unit/settings/public-client.test.ts tests/dom/panel/mount-settings-readiness.test.ts tests/dom/panel/mount.test.ts tests/dom/panel/mount-generation-render.test.ts
npm exec tsc -- --noEmit --pretty false
git add -- src/background-app.ts src/settings/public-client.ts src/panel tests/unit/background/background-app.test.ts tests/unit/settings/public-client.test.ts tests/dom/panel
git commit -m "fix: gate panel actions on loaded settings"
```

---

### Task 5: Enforce disabled generation and the safe error boundary in Background

**Files:**
- Create: `src/generation/errors.ts`
- Modify: `src/generation/background-stream.ts`
- Modify: `src/generation/llm-api.ts`
- Modify: `src/generation/sse.ts`
- Modify: `src/generation/protocol.ts`
- Modify: `src/generation/llm-provider.ts`
- Modify: `src/panel/mount.ts`
- Test: `tests/unit/background/background-stream.test.ts`
- Test: `tests/unit/background/background-entry.test.ts`
- Test: `tests/unit/generation/llm-api-stream.test.ts`
- Test: `tests/dom/panel/mount.test.ts`

**Interfaces:**
- Consumes: canonical `getSettings()` and existing generation request/port contracts.
- Produces: a stable disabled error without keepalive/provider access and a finite validated generation error-code boundary that never forwards provider/dependency text.

- [x] **Step 1: Move the settings read and gate before keepalive**

Use this ordering inside `runGenerationStream()`:

```ts
const settings = await deps.getSettings();
if (!settings.generationEnabled) {
    throw new GenerationUserError("generation-disabled");
}
const fullText = await deps.keepAlive(() => deps.streamGenerationFromApi({
    settings,
    request,
    signal: controller.signal,
    onToken: (deltaText) => {
        if (!controller.signal.aborted) postToPort(port, { type: "token", text: deltaText });
    },
}), controller.signal);
```

Do not add a second provider/config cache in Background. Generation port failures carry only a validated `GenerationErrorCode`; known local/config/disabled failures use typed categories and unknown errors map to `generation-failed`. HTTP error bodies/status text and streamed provider error text must not enter runtime messages, Panel DOM, or logs. Add fake-marker leak regressions at HTTP, SSE, background-port, and Panel boundaries.

- [x] **Step 2: Run Background and generation regression tests**

```powershell
npm test -- tests/unit/background tests/unit/generation
npm exec tsc -- --noEmit --pretty false
```

Expected: disabled test passes; keepalive, cancel, replacement, disconnect, strict SSE, and provider body tests remain green.

- [x] **Step 3: Commit the defense-in-depth gate**

```powershell
git add -- src/generation/errors.ts src/generation/background-stream.ts src/generation/llm-api.ts src/generation/llm-provider.ts src/generation/protocol.ts src/generation/provider-catalog.ts src/generation/sse.ts src/panel/mount.ts tests/unit/background tests/unit/generation tests/dom/panel/mount.test.ts
git commit -m "fix: enforce generation setting in background"
```

---

### Task 6: Update canonical docs, verify, and review the branch

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/development.md`
- Modify only if needed for accuracy: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-07-12-provider-settings-hardening.md` checkbox status

**Interfaces:**
- Documents: provider catalog extension path, canonical profile schema/migration, Options state/conflict behavior, Panel readiness, Background enforcement, and test/smoke requirements.

- [x] **Step 1: Update documentation**

In `architecture.md`, replace the old global key/model/access-mode table with `generationProviderSettings`, selected-profile request flow, migration precedence, secret-free cache identity, and fail-closed readiness. In `development.md`, add the exact “new provider” checklist: catalog adapter, host permission, privacy disclosure, unit tests, both Options profiles, and real Chrome smoke. Keep `AGENTS.md` to one concise invariant only if its current settings paragraph would otherwise be misleading.

- [x] **Step 2: Run the complete automated verification**

```powershell
npm test
npm exec tsc -- --noEmit --pretty false
npm run build
git diff --check
git status --short
```

Expected: all tests pass, TypeScript exits 0, all five build artifacts are produced, diff check is clean, and status contains only intentional source/test/doc changes. Never stage `dist/` or `node_modules/`.

- [ ] **Step 3: Execute the Chrome smoke matrix**

Status: unverified in this session because no controllable Chrome extension session or authorized OpenAI/DeepSeek test credentials were available. Automated DOM/unit coverage is recorded separately and is not treated as Chrome smoke.

Verify and record:

- DeepSeek key/model survive DeepSeek → OpenAI → DeepSeek switching.
- OpenAI key/model survive OpenAI → DeepSeek → OpenAI switching.
- Saving/reopening Options preserves both profiles.
- Options load failure cannot save defaults; Retry recovers.
- Two Options tabs show clean update and dirty conflict behavior.
- Panel does not generate/copy/download before settings load and shows explicit failure.
- Disabled generation produces no external request.
- OpenAI and DeepSeek each authenticate only with their own fake/real test account and complete streaming.

If authenticated external-provider smoke cannot run, report those rows as unverified rather than claiming success.

- [x] **Step 4: Request Superpowers code review and address findings**

Use `superpowers:requesting-code-review` against base `0905849` and the final HEAD. Fix every Critical/Important issue with a new RED→GREEN cycle; record Minor issues explicitly.

- [x] **Step 5: Commit docs/review fixes and update the Draft PR**

```powershell
git add -- docs AGENTS.md src tests
git commit -m "docs: document extensible provider settings"
git push
```

Update the Draft PR body with root cause, migration behavior, RED evidence, final checks, stacked base, and any unverified Chrome smoke rows. Do not mark ready until the stacked base and all required checks are resolved.
