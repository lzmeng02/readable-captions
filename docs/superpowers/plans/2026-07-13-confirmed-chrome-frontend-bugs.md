# Confirmed Chrome Frontend Bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Chrome Autofill from copying credentials across provider profiles, recover public settings after MV3 port disconnects, and make the Panel More menu close deterministically.

**Architecture:** Provider-specific Options controls receive provider-specific DOM identity and avoid login-password semantics; browser-restored live DOM is overwritten through Lit `live()`. `watchPublicSettings()` becomes a small reconnecting port state machine that fails closed during outages and recovers on the next valid settings snapshot. Menu state remains owned by each `mountPanel()` instance and changes only through explicit close transitions.

**Tech Stack:** TypeScript, Lit 3 (`keyed`, `live`), Chrome MV3 runtime ports, Vitest, jsdom, Vite.

## Global Constraints

- The new PR is stacked on `fix/provider-settings-hardening`; do not modify or force-push PR #8.
- API keys remain provider-scoped and never enter public settings, runtime messages, DOM outside the Options credential field, logs, fixtures with real secrets, or cache identity.
- Use only fake values such as `ds-test-key` and `oa-test-key` in tests.
- Real Chrome/Bilibili/authenticated-provider smoke is recorded as unverified and is not a merge gate for this patch.
- Do not auto-delete identical persisted provider keys because user intent cannot be inferred.
- Do not change collapse-state semantics, Clipboard/download behavior, or broader accessibility behavior in this patch.
- Add each regression test and observe the intended failure before modifying production code.
- Never stage `dist/`, `node_modules/`, or user-owned unrelated files.

---

### Task 1: Make provider credential controls browser-safe

**Files:**
- Modify: `src/options/index.ts`
- Modify: `tests/dom/options/options-provider-profiles.test.ts`
- Modify: `tests/dom/options/options-live-controls.test.ts`

**Interfaces:**
- Consumes: `ExtensionSettings.generationProviderSettings[provider]` and existing provider catalog entries.
- Produces: `input[data-setting="generationApiKey"]` with provider-specific `name`, mount identity, masking, and controlled value.

- [x] **Step 1: Write the failing provider-DOM and visibility tests**

Add a stable helper and regressions equivalent to:

```ts
function apiKeyInput(app: ReadableCaptionsOptionsApp): HTMLInputElement {
    return app.shadowRoot!.querySelector<HTMLInputElement>('input[data-setting="generationApiKey"]')!;
}

it("replaces provider-specific controls and never exposes a password field", async () => {
    const app = await mountLoadedOptions({
        ...canonicalFixture(),
        generationProviderSettings: {
            openai: { apiKey: "", models: { overview: "", intensive: "" } },
            deepseek: { apiKey: "ds-test-key", models: { overview: "ds-overview", intensive: "ds-intensive" } },
        },
    });
    await openGenerationTab(app);

    const deepseekInput = apiKeyInput(app);
    expect.soft(deepseekInput.type).toBe("text");
    expect.soft(deepseekInput.name).toBe("generationApiKey-deepseek");
    expect.soft(deepseekInput.autocomplete).toBe("off");
    expect.soft(deepseekInput.classList).toContain("masked");

    await selectProvider(app, "openai");
    const openaiInput = apiKeyInput(app);
    expect.soft(openaiInput).not.toBe(deepseekInput);
    expect.soft(openaiInput.name).toBe("generationApiKey-openai");
    expect.soft(openaiInput.value).toBe("");
    expect(app.shadowRoot!.querySelector(".form-label-row")!.textContent).toContain("未配置");
});

it("hides a configured key again after changing providers", async () => {
    const app = await mountLoadedOptions({
        ...canonicalFixture(),
        generationProviderSettings: {
            openai: { apiKey: "oa-test-key", models: { overview: "gpt-test", intensive: "gpt-test" } },
            deepseek: { apiKey: "ds-test-key", models: { overview: "deepseek-test", intensive: "deepseek-test" } },
        },
    });
    await openGenerationTab(app);
    findButton(app, "显示")!.click();
    await settle(app);
    expect(apiKeyInput(app).classList).not.toContain("masked");

    await selectProvider(app, "openai");
    expect(apiKeyInput(app).classList).toContain("masked");
});
```

Update existing selectors from `input[name="generationApiKey"]` to `input[data-setting="generationApiKey"]`. Add reset/external-load assertions that the selected API field is masked after the authoritative draft changes.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm test -- tests/dom/options/options-provider-profiles.test.ts tests/dom/options/options-live-controls.test.ts
```

Expected failures: current input is `type=password`, has the shared name, reuses the same element, lacks `autocomplete`, and reveal state survives provider changes.

- [x] **Step 3: Implement keyed, live, masked provider controls**

Import the directives:

```ts
import { keyed } from "lit/directives/keyed.js";
import { live } from "lit/directives/live.js";
```

Add Chrome-only masking CSS:

```css
.api-key-input.masked {
    -webkit-text-security: disc;
}
```

Reset `showApiKey = false` in `loadSettings()`, `setProvider()`, `handleReset()`, clean external refresh, `handleLoadExternal()`, and `handleKeepLocal()`.

Render the provider-specific credential/model section through `keyed(settings.generationProvider, html`...`)`. The API input contract is:

```ts
<input
    class="form-control api-key-input ${this.showApiKey ? "" : "masked"}"
    type="text"
    name=${`generationApiKey-${settings.generationProvider}`}
    data-setting="generationApiKey"
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    .value=${live(selectedProfile.apiKey)}
    @input=${this.handleGenerationApiKeyChange}
    placeholder="sk-..."
/>
```

Bind provider model values with `live(selectedProfile.models.overview)` and `live(selectedProfile.models.intensive)` inside the same keyed template.

- [x] **Step 4: Run Options GREEN checks**

```powershell
npm test -- tests/dom/options/options-provider-profiles.test.ts tests/dom/options/options-live-controls.test.ts tests/dom/options/options-state.test.ts
npm exec tsc -- --noEmit --pretty false
```

Expected: all Options tests pass and TypeScript exits 0.

- [x] **Step 5: Commit the Options fix**

```powershell
git add -- src/options/index.ts tests/dom/options/options-provider-profiles.test.ts tests/dom/options/options-live-controls.test.ts
git commit -m "fix: isolate provider credential controls"
```

---

### Task 2: Reconnect the public-settings port after MV3 disconnects

**Files:**
- Modify: `src/settings/public-client.ts`
- Modify: `tests/unit/settings/public-client.test.ts`

**Interfaces:**
- Preserves: `watchPublicSettings(onSettings, onError): () => void`.
- Produces: fail-closed outage notification, bounded reconnect attempts, recovery on valid settings, and deterministic unsubscribe cleanup.

- [x] **Step 1: Write failing reconnect lifecycle tests**

Use fake timers and a queue of fake ports:

```ts
it("fails closed, reconnects, and recovers after a post-ready disconnect", async () => {
    vi.useFakeTimers();
    const first = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
    const second = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
    const connect = vi.fn()
        .mockReturnValueOnce(first.port)
        .mockReturnValueOnce(second.port);
    vi.stubGlobal("chrome", { runtime: { connect } });
    const onSettings = vi.fn();
    const onError = vi.fn();

    const stop = watchPublicSettings(onSettings, onError);
    first.emitMessage({ type: "settings", settings: DEFAULT_PUBLIC_SETTINGS });
    first.emitDisconnect();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining("reconnect"),
    }));
    await vi.runOnlyPendingTimersAsync();
    expect(connect).toHaveBeenCalledTimes(2);

    const recovered = { ...DEFAULT_PUBLIC_SETTINGS, generationEnabled: false };
    second.emitMessage({ type: "settings", settings: recovered });
    expect(onSettings).toHaveBeenLastCalledWith(recovered);
    stop();
});

it("cancels a scheduled reconnect when unsubscribed", async () => {
    vi.useFakeTimers();
    const first = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
    const connect = vi.fn(() => first.port);
    vi.stubGlobal("chrome", { runtime: { connect } });

    const stop = watchPublicSettings(vi.fn(), vi.fn());
    first.emitDisconnect();
    stop();
    await vi.runOnlyPendingTimersAsync();

    expect(connect).toHaveBeenCalledOnce();
});
```

Also assert that a stale first port cannot publish settings after a replacement port is active, and that repeated connection failures do not publish defaults.

- [x] **Step 2: Run the public-client suite and verify RED**

```powershell
npm test -- tests/unit/settings/public-client.test.ts
```

Expected: current client reports only a pre-first-value disconnect, never reconnects, and cannot recover.

- [x] **Step 3: Implement the reconnecting port state machine**

Use constants and lifecycle state:

```ts
const RECONNECT_BASE_DELAY_MS = 100;
const RECONNECT_MAX_DELAY_MS = 5000;

let activePort: RuntimePort | null = null;
let connectionGeneration = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelayMs = RECONNECT_BASE_DELAY_MS;
let outageReported = false;
let stopped = false;
```

`connect()` creates a new generation, attaches listeners that first verify both generation and port identity, and schedules another attempt on throw/missing port/disconnect. `scheduleReconnect(error)` calls `onError(error)` only once per outage, starts one timer, doubles the delay up to 5000 ms, and never publishes defaults. A valid settings message clears outage state, resets the delay, and calls `onSettings`. The returned cleanup increments generation, clears the timer, nulls and disconnects the active port, and makes all stale callbacks no-ops.

- [x] **Step 4: Run public settings and Panel readiness GREEN checks**

```powershell
npm test -- tests/unit/settings/public-client.test.ts tests/unit/background/background-app.test.ts tests/dom/panel/mount-settings-readiness.test.ts
npm exec tsc -- --noEmit --pretty false
```

Expected: reconnect tests and existing fail-closed readiness tests pass.

- [x] **Step 5: Commit the port lifecycle fix**

```powershell
git add -- src/settings/public-client.ts tests/unit/settings/public-client.test.ts
git commit -m "fix: reconnect public settings ports"
```

---

### Task 3: Close the Panel More menu deterministically

**Files:**
- Modify: `src/panel/mount.ts`
- Modify: `src/panel/panel-view.ts`
- Modify: `tests/dom/panel/mount.test.ts`

**Interfaces:**
- Preserves: `PanelUiOptions.isMenuOpen` and `onMenuOpenChange(next)`.
- Produces: explicit close transitions for outside pointer and menu actions.

- [x] **Step 1: Write failing menu-state tests**

Add regressions equivalent to:

```ts
it("closes an open More menu on an outside pointer", () => {
    const { host, handle } = mountReadyPanel();
    try {
        clickAction(host, "更多");
        expect(moreMenu(host)).not.toBeNull();
        document.body.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
        expect(moreMenu(host)).toBeNull();
    } finally {
        handle.dispose();
    }
});

it("closes the More menu when language is changed", () => {
    const { host, handle } = mountReadyPanel();
    try {
        clickAction(host, "更多");
        const language = [...host.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.overflow-item")]
            .find((button) => button.textContent?.includes("English"))!;
        language.click();
        expect(moreMenu(host)).toBeNull();
    } finally {
        handle.dispose();
    }
});
```

- [x] **Step 2: Run the Panel test and verify RED**

```powershell
npm test -- tests/dom/panel/mount.test.ts -t "More menu|language"
```

Expected: outside pointer and language action leave the menu open.

- [x] **Step 3: Implement explicit close transitions**

In `mount.ts`, avoid work while closed and clear state before rendering:

```ts
const handlePointerDown = (event: PointerEvent): void => {
    if (!isMenuOpen) return;
    const isInside = event.composedPath()
        .some((node: any) => node?.classList?.contains("more-actions-wrapper"));
    if (!isInside) {
        isMenuOpen = false;
        renderPanel();
    }
};
```

In `panel-view.ts`, make `handleLangClick` mirror the other menu actions:

```ts
const handleLangClick = (event: Event) => {
    event.stopPropagation();
    uiOptions.onMenuOpenChange(false);
    setMode(mode);
    onLangClick?.();
};
```

- [x] **Step 4: Run Panel GREEN checks and commit**

```powershell
npm test -- tests/dom/panel/mount.test.ts tests/dom/panel/mount-generation-render.test.ts tests/dom/panel/mount-settings-readiness.test.ts
npm exec tsc -- --noEmit --pretty false
git add -- src/panel/mount.ts src/panel/panel-view.ts tests/dom/panel/mount.test.ts
git commit -m "fix: close panel menu on external actions"
```

Expected: all focused Panel tests pass and TypeScript exits 0.

---

### Task 4: Document, verify, build, review, and open the stacked PR

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/development.md`
- Modify: `docs/superpowers/plans/2026-07-13-confirmed-chrome-frontend-bugs.md`
- Build only: `dist/` (ignored; never stage)

**Interfaces:**
- Documents the provider-specific control contract and reconnecting public-settings lifecycle.
- Uses the existing Draft PR #9 with base `fix/provider-settings-hardening`; the controller owns final push, whole-branch review, and PR-body refresh.

- [x] **Step 1: Update canonical docs and checklist status**

Document that API-key controls avoid password-manager semantics, provider changes recreate the control, reveal state is provider-transition-safe, and public settings reconnect/fail closed after MV3 disconnects. Record Chrome/Bilibili/authenticated smoke as unverified rather than passed. Mark only completed plan checkboxes.

- [x] **Step 2: Run fresh complete verification**

```powershell
npm test
npm exec tsc -- --noEmit --pretty false
npm run build
git diff --check
git status --short
```

Expected: every test passes; TypeScript and build exit 0; five files exist in `dist/`; status contains only intentional docs/source/tests and no generated files.

- [x] **Step 3: Request Superpowers whole-branch review**

Generate a review package from base `d9ec2d6` to final HEAD. Fix every Critical/Important issue with a focused RED→GREEN cycle; record Minor findings. Re-run the complete verification after any fix.

- [x] **Step 4a: Commit the docs update**

```powershell
git add -- docs/architecture.md docs/development.md docs/superpowers/plans/2026-07-13-confirmed-chrome-frontend-bugs.md
git commit -m "docs: document Chrome frontend safeguards"
```

- [x] **Step 4b: Push the final reviewed branch (controller-owned)**

```powershell
git push -u origin fix/chrome-frontend-runtime
```

- [x] **Step 5a: Open the new Draft PR**

The controller already opened Draft PR #9 with base `fix/provider-settings-hardening` and head `fix/chrome-frontend-runtime`; do not recreate it or modify PR #8.

- [x] **Step 5b: Finalize the body and verify the existing Draft PR (controller-owned)**

```powershell
gh pr view --repo lzmeng02/readable-captions --json url,isDraft,baseRefName,headRefName,mergeable
```

PR body must state: root cause, confirmed scope, RED→GREEN evidence, final automated checks, stacked relationship to PR #8, and every unverified real-Chrome row. Keep the worktree for PR feedback.
