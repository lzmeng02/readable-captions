# Settings and Build Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Options reset visually truthful, preserve legal title hyphens in metadata/exports, keep development output loadable, and finish the repository documentation and verification matrix.

**Architecture:** Keep Options state semantics unchanged while binding native controls through live DOM properties. Extract one pure Bilibili-title helper shared by generation metadata and exports. Make the content Vite config mode-aware so release builds clean stale output while the development watcher preserves sibling extension artifacts.

**Tech Stack:** TypeScript 5.9, Lit 3, Vitest 4, jsdom 29, Vite 7, Node 22.

## Global Constraints

- Execute after the subtitle/content and generation plans; reuse their test helpers and final `PanelHandle` implementation.
- Reset changes only the Options draft; persistence still occurs only after the user clicks Save.
- Keep production `emptyOutDir: true`; only the development content build may preserve sibling artifacts.
- Do not change filename sanitization rules in `export-utils.ts` or current-tab export behavior.
- Keep `AGENTS.md` concise and keep `tests/data/` untouched/untracked.
- Run each stated RED test before its production edit.

---

### Task 1: Bind Options Controls Through Live Properties

**Files:**
- Create: `tests/dom/options/options-live-controls.test.ts`
- Modify: `src/options/index.ts:610-626,716-727`

**Interfaces:** Existing `getSettings()`, `saveSettings()`, `mergeSettings()`, and `ReadableCaptionsOptionsApp`; no new production API.

- [ ] **Step 1: Write jsdom RED tests using the real Options component**

Create `tests/dom/options/options-live-controls.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";

const storageMocks = vi.hoisted(() => ({
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
}));
vi.mock("../../../src/settings/storage", () => storageMocks);
import { ReadableCaptionsOptionsApp } from "../../../src/options/index";

async function mountOptions(): Promise<ReadableCaptionsOptionsApp> {
    const app = new ReadableCaptionsOptionsApp();
    document.body.append(app);
    await app.updateComplete;
    await Promise.resolve();
    await app.updateComplete;
    return app;
}

function change(control: HTMLInputElement | HTMLSelectElement, value: string | boolean): void {
    if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = Boolean(value);
    else control.value = String(value);
    control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function clickByText(root: ShadowRoot, text: string): void {
    const element = [...root.querySelectorAll<HTMLElement>("button, .nav-item")]
        .find((candidate) => candidate.textContent?.includes(text));
    if (!element) throw new Error(`Missing control: ${text}`);
    element.click();
}

beforeEach(() => {
    document.body.replaceChildren();
    storageMocks.getSettings.mockReset().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        defaultTab: "intensive",
        generationEnabled: false,
        copyFormat: "timestamped_text",
        downloadFormat: "srt",
    });
    storageMocks.saveSettings.mockReset().mockImplementation(async (settings) => settings);
});
afterEach(() => document.body.replaceChildren());

describe("Options live controls", () => {
    it("reset updates the default-tab select and generation checkbox", async () => {
        const app = await mountOptions();
        const root = app.shadowRoot!;
        const tab = root.querySelector<HTMLSelectElement>('select[name="defaultTab"]')!;
        const enabled = root.querySelector<HTMLInputElement>('input[name="generationEnabled"]')!;
        expect(tab.value).toBe("intensive");
        expect(enabled.checked).toBe(false);
        clickByText(root, "恢复默认");
        await app.updateComplete;
        expect(tab.value).toBe("original");
        expect(enabled.checked).toBe(true);
    });

    it("reset updates both export format selects", async () => {
        const app = await mountOptions();
        const root = app.shadowRoot!;
        clickByText(root, "导出偏好");
        await app.updateComplete;
        const copy = root.querySelector<HTMLSelectElement>('select[name="copyFormat"]')!;
        const download = root.querySelector<HTMLSelectElement>('select[name="downloadFormat"]')!;
        expect(copy.value).toBe("timestamped_text");
        expect(download.value).toBe("srt");
        clickByText(root, "恢复默认");
        await app.updateComplete;
        expect(copy.value).toBe("readable_text");
        expect(download.value).toBe("txt");
    });

    it("save receives the values displayed after reset", async () => {
        const app = await mountOptions();
        const root = app.shadowRoot!;
        const tab = root.querySelector<HTMLSelectElement>('select[name="defaultTab"]')!;
        change(tab, "overview");
        await app.updateComplete;
        clickByText(root, "恢复默认");
        await app.updateComplete;
        clickByText(root, "保存设置");
        await app.updateComplete;
        expect(storageMocks.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
            defaultTab: "original",
            generationEnabled: true,
            copyFormat: "readable_text",
            downloadFormat: "txt",
        }));
    });
});
```

- [ ] **Step 2: Run RED**

```powershell
npm test -- tests/dom/options/options-live-controls.test.ts
```

Expected: after reset, dirty select/checkbox live properties retain old values while attributes change.

- [ ] **Step 3: Bind the controls correctly**

```ts
<select class="form-control" name="defaultTab" .value=${this.settings.defaultTab} @change=${this.handleFieldChange}>
    <option value="original">原文</option>
    <option value="intensive">精读</option>
    <option value="overview">总览</option>
</select>

<input type="checkbox" name="generationEnabled" .checked=${this.settings.generationEnabled} @change=${this.handleFieldChange}/>
```

Use `.value=${this.settings.copyFormat}` and `.value=${this.settings.downloadFormat}` on the export selects and remove option-level `?selected`. Do not add auto-save.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm test -- tests/dom/options/options-live-controls.test.ts
npm exec tsc -- --noEmit --pretty false
git add src/options/index.ts tests/dom/options/options-live-controls.test.ts
git commit -m "fix: bind resettable options to live values"
```

### Task 2: Preserve Legal Hyphens in Video Titles

**Files:**
- Create: `src/panel/title-utils.ts`
- Create: `tests/unit/panel/title-utils.test.ts`
- Modify: `src/panel/mount.ts:69-82,230-258`
- Modify: `tests/dom/panel/mount.test.ts`

**Interfaces:** `extractVideoTitle(documentTitle: string): string`.

- [ ] **Step 1: Add a behavior RED before creating the helper**

Extend the panel export test: set `document.title` to `GPT-5 教程_哔哩哔哩_bilibili`, click transcript download, and expect the captured anchor filename to equal `GPT-5 教程.txt`. Current result is `GPT.txt`.

Run:

```powershell
npm test -- tests/dom/panel/mount.test.ts
```

- [ ] **Step 2: Add pure title cases and implement the helper**

Create `tests/unit/panel/title-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractVideoTitle } from "../../../src/panel/title-utils";

describe("extractVideoTitle", () => {
    it.each([
        ["GPT-5 教程_哔哩哔哩_bilibili", "GPT-5 教程"],
        ["A-B-C - 哔哩哔哩", "A-B-C"],
        ["already clean", "already clean"],
        ["_哔哩哔哩_bilibili", "bilibili_video"],
        ["   ", "bilibili_video"],
    ])("extracts %s", (input, expected) => expect(extractVideoTitle(input)).toBe(expected));
});
```

Create `src/panel/title-utils.ts`:

```ts
const BILIBILI_TITLE_SUFFIX = /(?:_|\s*-\s*)哔哩哔哩(?:_bilibili)?$/u;

export function extractVideoTitle(documentTitle: string): string {
    const title = documentTitle.replace(BILIBILI_TITLE_SUFFIX, "").trim();
    return title || "bilibili_video";
}
```

Delete the private mount helper and call this helper for metadata, transcript/generated downloads, and Note downloads. Leave illegal-character replacement in `export-utils.ts`.

- [ ] **Step 3: Run GREEN and commit**

```powershell
npm test -- tests/unit/panel/title-utils.test.ts tests/dom/panel/mount.test.ts
npm exec tsc -- --noEmit --pretty false
git add src/panel/title-utils.ts src/panel/mount.ts tests/unit/panel/title-utils.test.ts tests/dom/panel/mount.test.ts
git commit -m "fix: preserve hyphens in video titles"
```

### Task 3: Preserve Complete Extension Artifacts During Development

**Files:**
- Create: `tests/integration/dev-output.test.ts`
- Modify: `vite.config.ts:4-19`
- Modify: `package.json:6-9`

**Interfaces:** default/production mode cleans `dist`; development mode preserves it; `npm run dev` performs a complete build before watch.

- [ ] **Step 1: Write a real Vite behavior RED test**

Create `tests/integration/dev-output.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import packageJson from "../../package.json";

const created: string[] = [];
afterEach(async () => Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe("development content build", () => {
    it("keeps sibling extension artifacts", async () => {
        const outDir = await mkdtemp(join(tmpdir(), "readable-captions-dev-"));
        created.push(outDir);
        await writeFile(join(outDir, "manifest.json"), "sentinel", "utf8");
        await build({
            root: resolve("."),
            configFile: resolve("vite.config.ts"),
            mode: "development",
            logLevel: "silent",
            build: { outDir },
        });
        expect(existsSync(join(outDir, "manifest.json"))).toBe(true);
        expect(existsSync(join(outDir, "content.js"))).toBe(true);
    });

    it("starts with a complete build before content watch", () => {
        expect(packageJson.scripts.dev).toBe("npm run build && vite build --watch --mode development");
    });
});
```

- [ ] **Step 2: Run RED**

```powershell
npm test -- tests/integration/dev-output.test.ts
```

Expected: development deletes sentinel `manifest.json`; the script is `vite build --watch`.

- [ ] **Step 3: Make content cleanup mode-aware**

```ts
export default defineConfig(({ mode }) => ({
    build: {
        lib: {
            entry: resolve(__dirname, "src/content.ts"),
            formats: ["iife"],
            name: "ReadableCaptionsContent",
            fileName: () => "content.js",
        },
        outDir: "dist",
        emptyOutDir: mode !== "development",
        rollupOptions: { output: { inlineDynamicImports: true } },
    },
}));
```

Set `"dev": "npm run build && vite build --watch --mode development"`.

- [ ] **Step 4: Add production safety and run GREEN**

Add this second case:

```ts
it("cleans stale artifacts in production mode", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "readable-captions-prod-"));
    created.push(outDir);
    await writeFile(join(outDir, "sentinel.txt"), "stale", "utf8");
    await build({
        root: resolve("."),
        configFile: resolve("vite.config.ts"),
        mode: "production",
        logLevel: "silent",
        build: { outDir },
    });
    expect(existsSync(join(outDir, "sentinel.txt"))).toBe(false);
    expect(existsSync(join(outDir, "content.js"))).toBe(true);
});
```

```powershell
npm test -- tests/integration/dev-output.test.ts
npm run build
git add package.json package-lock.json vite.config.ts tests/integration/dev-output.test.ts
git commit -m "fix: preserve extension artifacts during dev"
```

### Task 4: Update Canonical Docs and Run the Final Acceptance Matrix

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/development.md`
- Read/retain: `docs/product-direction.md`

**Interfaces:** Docs become canonical for tests, content sessions, strict subtitle/errors, provider payloads, SSE/delta/keepalive, Options binding, title extraction, and dev build.

- [ ] **Step 1: Update commands without lengthening `AGENTS.md` materially**

```text
npm test       # complete Vitest suite
npm run build  # strict tsc + content/background/options builds + manifest copy
npm run dev    # complete build once, then content-only watch without deleting sibling artifacts
```

- [ ] **Step 2: Update runtime contracts**

Replace known-bug text in `docs/architecture.md` with final implemented behavior. Replace “no tracked tests” in `docs/development.md` with exact test layout/commands and the smoke matrix below. `docs/product-direction.md` remains unchanged.

- [ ] **Step 3: Run fresh automated verification**

```powershell
npm test
npm exec tsc -- --noEmit --pretty false
npm run build
git diff --check
```

Verify outputs:

```powershell
@('dist/manifest.json','dist/content.js','dist/background.js','dist/options.html','dist/options.js') |
    ForEach-Object { if (-not (Test-Path -LiteralPath $_)) { throw "Missing $_" } }
```

- [ ] **Step 4: Run or explicitly report the Chrome smoke matrix**

| Area | Action | Expected |
|---|---|---|
| Subtitle URLs | Open BV, av, query-id, and watchlater videos | Correct recognition and captions |
| Multipart | Open one video at `p=1` and `p=2` | Each part shows its own cid/transcript |
| Errors | Simulate offline/API business error | Terminal error, never permanent loading |
| SPA | Video → unsupported → video | One panel; old work/listeners disposed |
| Host recovery | Remove `#readable-captions-root` | Same host/state returns once |
| Languages | Switch B→C rapidly, then force failure | C wins; failure rolls back |
| Providers | Generate with official OpenAI and DeepSeek | Compatible body and complete answer |
| Streaming | Cancel/retry a long generation | No partial success; worker stays active |
| Options | Change/reset/save General and Export controls | Displayed values equal saved values |
| Dev | Start dev and trigger content rebuild | All five artifacts remain |
| Titles | Export `GPT-5` and `A-B-C` videos | Hyphens preserved; invalid chars sanitized |
| Security | Inspect messages and panel DOM | No API key/full settings exposure |

If authenticated provider/browser smoke cannot run, report each unverified row explicitly.

- [ ] **Step 5: Commit docs**

```powershell
git add AGENTS.md README.md docs
git commit -m "docs: describe the tested extension workflow"
```

## Final Completion Gate

Use `superpowers:verification-before-completion`. Re-run all Step 3 commands after the final edit, inspect `git status --short`, confirm `tests/data/` is unchanged and untracked, then report actual results.
