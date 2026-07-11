# Subtitle and Content Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Bilibili subtitle selection, error handling, SPA navigation, panel recovery, and language switching correct and leak-free.

**Architecture:** Add a Vitest baseline, make the Bilibili adapter distinguish domain-empty results from API failures, and give the content layer one explicit session that owns a `PanelHandle`. The panel is updated in place for the same video, reset only for a new route key, and disposed exactly once. Language changes are abortable transactions that update the content session's canonical data only after validation.

**Tech Stack:** TypeScript 5.9, Vitest 4, jsdom 29, Lit 3, Chrome Manifest V3 APIs.

## Global Constraints

- Base all work on `origin/master` at `06d0914` plus documentation commit `4ff234b`.
- Do not merge or cherry-pick PR #6 wholesale; use it only as a behavioral reference.
- Preserve BV, av, query-id, watchlater, hostname, bvid-aware WBI, public-settings security, and current-tab export behavior.
- API keys must remain outside content messages, DOM, logs, exports, and tests.
- Preserve the `marked` → DOMPurify → `unsafeHTML` rendering path.
- Follow RED → GREEN → REFACTOR for every production behavior below; run the named RED command and confirm the stated business assertion fails before editing production code.
- Do not stage or modify the user-owned files under `tests/data/`.

---

## File Structure

- `vitest.config.ts`: shared unit/jsdom test configuration.
- `tests/unit/platforms/bilibili/*.test.ts`: Bilibili parsing, API, and adapter regressions.
- `tests/unit/content/controller.test.ts`: dependency-injected SPA/session lifecycle tests.
- `tests/dom/panel/mount.test.ts`: real Lit/jsdom panel lifecycle and language transaction tests.
- `src/panel/types.ts`: public `PanelData`, `PanelCallbacks`, and `PanelHandle` contracts.
- `src/content/controller.ts`: session state machine independent of concrete DOM globals.
- Existing Bilibili, content, and panel files remain focused adapters around those boundaries.

### Task 1: Add the Test Harness and Reject Malformed Transcript Lines

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `tests/unit/platforms/bilibili/normalize.test.ts`
- Modify: `src/platforms/bilibili/normalize.ts:19-43`

**Interfaces:**
- Consumes: existing `normalizeBilibiliTranscript(body: unknown): Transcript | null`.
- Produces: `npm test` and `npm run test:watch`; malformed input reliably returns `null`.

- [ ] **Step 1: Install the pinned-compatible test dependencies**

Run:

```powershell
npm install --save-dev vitest@^4.1.10 jsdom@^29.1.1
```

Expected: `package.json` and `package-lock.json` add Vitest/jsdom; Node `22.20.0` satisfies both packages' engines.

- [ ] **Step 2: Add test scripts and configuration**

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "vite build --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc && vite build --config vite.config.ts && vite build --config vite.background.config.ts && vite build --config vite.options.config.ts && node copy-manifest.mjs"
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        clearMocks: true,
        restoreMocks: true,
        unstubGlobals: true,
        include: ["tests/**/*.test.ts"],
    },
});
```

- [ ] **Step 3: Write the malformed-line regression tests**

Create `tests/unit/platforms/bilibili/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeBilibiliTranscript } from "../../../../src/platforms/bilibili/normalize";

describe("normalizeBilibiliTranscript", () => {
    it("returns null when a line is not an object", () => {
        expect(normalizeBilibiliTranscript([{ from: 0, to: 1, content: "ok" }, null])).toBeNull();
    });

    it("returns null when a line has an invalid field type", () => {
        expect(normalizeBilibiliTranscript([{ from: "0", to: 1, content: "bad" }])).toBeNull();
    });

    it("normalizes a valid transcript", () => {
        expect(normalizeBilibiliTranscript([{ from: 0, to: 1.5, content: "ok" }])).toEqual([
            { from: 0, to: 1.5, content: "ok" },
        ]);
    });
});
```

- [ ] **Step 4: Run the RED test**

Run:

```powershell
npm test -- tests/unit/platforms/bilibili/normalize.test.ts
```

Expected: the first two assertions fail because current code returns the untrusted input array instead of `null`; the valid case passes.

- [ ] **Step 5: Implement the minimal normalization fix**

Replace both invalid branches in `normalizeBilibiliTranscript()`:

```ts
for (const item of body) {
    const line = asRecord(item);
    if (!line) {
        return null;
    }

    const from = readNumber(line, "from");
    const to = readNumber(line, "to");
    const content = readString(line, "content");

    if (from === null || to === null || content === null) {
        return null;
    }

    transcript.push({ from, to, content });
}
```

- [ ] **Step 6: Run GREEN and the existing type check**

Run:

```powershell
npm test -- tests/unit/platforms/bilibili/normalize.test.ts
npm exec tsc -- --noEmit --pretty false
```

Expected: 3 tests pass; TypeScript exits 0.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts tests/unit/platforms/bilibili/normalize.test.ts src/platforms/bilibili/normalize.ts
git commit -m "test: add subtitle regression harness"
```

### Task 2: Make Bilibili API and Multipart Selection Correct

**Files:**
- Create: `tests/unit/platforms/bilibili/api.test.ts`
- Create: `tests/unit/platforms/bilibili/adapter.test.ts`
- Modify: `src/platforms/bilibili/api.ts:1-191`
- Modify: `src/platforms/bilibili/adapter.ts:10-55`
- Modify: `src/platforms/types.ts:14-18`

**Interfaces:**
- Consumes: global `fetch`, Bilibili view/WBI/subtitle endpoints, `normalizeBilibiliTranscript()`.
- Produces:

```ts
export class BilibiliApiError extends Error {
    readonly endpoint: string;
    readonly code?: number;
}

export type BilibiliViewInfo = {
    aid: number;
    bvid?: string;
    cid: number;
    defaultCid: number;
    subtitleUrl?: string;
    availableSubtitles: BilibiliSubtitleItem[];
};

fetchBilibiliViewInfo(videoUrl: string, signal?: AbortSignal): Promise<BilibiliViewInfo | null>;
fetchBilibiliAiSubtitleUrl(aid: number, cid: number, bvid?: string, signal?: AbortSignal): Promise<BilibiliSubtitleItem[]>;
fetchBilibiliSubtitleBody(url: string, signal?: AbortSignal): Promise<{ subtitleUrl: string; body: unknown }>;
getBilibiliTranscript(url: string, signal?: AbortSignal): Promise<PlatformTranscriptResult>;
```

- [ ] **Step 1: Write API-envelope and multipart RED tests**

In `tests/unit/platforms/bilibili/api.test.ts`, stub real `Response` objects and assert business errors reject:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBilibiliViewInfo } from "../../../../src/platforms/bilibili/api";

afterEach(() => vi.unstubAllGlobals());

describe("fetchBilibiliViewInfo", () => {
    it("rejects a non-zero Bilibili business code", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            code: -412,
            message: "request blocked",
            data: null,
        }), { status: 200, headers: { "Content-Type": "application/json" } })));

        await expect(fetchBilibiliViewInfo("https://www.bilibili.com/video/BV1abc"))
            .rejects.toMatchObject({ code: -412 });
    });

    it("does not expose default-part subtitles for p=2", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            code: 0,
            data: {
                aid: 7,
                bvid: "BV1abc",
                cid: 11,
                pages: [{ cid: 11 }, { cid: 22 }],
                subtitle: { list: [{ lan_doc: "中文", subtitle_url: "//p1.example/sub.json" }] },
            },
        }))));

        const result = await fetchBilibiliViewInfo("https://www.bilibili.com/video/BV1abc?p=2");
        expect(result).toMatchObject({ cid: 22, defaultCid: 11, availableSubtitles: [] });
        expect(result?.subtitleUrl).toBeUndefined();
    });
});
```

In `tests/unit/platforms/bilibili/adapter.test.ts`, define concrete fixtures and route fake fetches by hostname/path:

```ts
function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

function viewFixture(options: {
    defaultCid?: number;
    selectedCid?: number;
    subtitleUrl?: string;
} = {}): unknown {
    const defaultCid = options.defaultCid ?? 11;
    const selectedCid = options.selectedCid ?? defaultCid;
    return {
        code: 0,
        data: {
            aid: 7,
            bvid: "BV1abc",
            cid: defaultCid,
            pages: [{ cid: defaultCid }, { cid: selectedCid }],
            subtitle: {
                list: options.subtitleUrl
                    ? [{ lan_doc: "中文", subtitle_url: options.subtitleUrl }]
                    : [],
            },
        },
    };
}

function wbiFixture(subtitleUrl?: string): unknown {
    return {
        code: 0,
        data: {
            subtitle: {
                subtitles: subtitleUrl
                    ? [{ lan_doc: "中文 AI", subtitle_url: subtitleUrl }]
                    : [],
            },
        },
    };
}

it("loads the selected part through WBI instead of using p=1 view subtitles", async () => {
    const calls: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        calls.push(url);
        if (url.pathname === "/x/web-interface/view") return jsonResponse(viewFixture({ defaultCid: 11, selectedCid: 22 }));
        if (url.pathname === "/x/player/wbi/v2") return jsonResponse(wbiFixture("//p2.example/sub.json"));
        if (url.hostname === "p2.example") return jsonResponse({ body: [{ from: 2, to: 3, content: "P2" }] });
        throw new Error(`Unexpected URL ${url}`);
    }));

    const result = await getBilibiliTranscript("https://www.bilibili.com/video/BV1abc?p=2");
    expect(result).toMatchObject({ cid: 22, source: "ai_wbi", transcript: [{ from: 2, to: 3, content: "P2" }] });
    expect(calls.find((url) => url.pathname === "/x/player/wbi/v2")?.searchParams.get("cid")).toBe("22");
    expect(calls.some((url) => url.hostname === "p1.example")).toBe(false);
});

it("falls back to WBI when a view subtitle body is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === "/x/web-interface/view") return jsonResponse(viewFixture({ subtitleUrl: "//view.example/sub.json" }));
        if (url.hostname === "view.example") return jsonResponse({ body: [{ from: "bad", to: 1, content: "bad" }] });
        if (url.pathname === "/x/player/wbi/v2") return jsonResponse(wbiFixture("//wbi.example/sub.json"));
        if (url.hostname === "wbi.example") return jsonResponse({ body: [{ from: 1, to: 2, content: "fallback" }] });
        throw new Error(`Unexpected URL ${url}`);
    }));

    await expect(getBilibiliTranscript("https://www.bilibili.com/video/BV1abc"))
        .resolves.toMatchObject({
            source: "ai_wbi",
            transcript: [{ from: 1, to: 2, content: "fallback" }],
        });
});

it("falls back to WBI when a view subtitle body is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === "/x/web-interface/view") return jsonResponse(viewFixture({ subtitleUrl: "//view.example/sub.json" }));
        if (url.hostname === "view.example") return jsonResponse({ body: [] });
        if (url.pathname === "/x/player/wbi/v2") return jsonResponse(wbiFixture("//wbi.example/sub.json"));
        if (url.hostname === "wbi.example") return jsonResponse({ body: [{ from: 1, to: 2, content: "fallback" }] });
        throw new Error(`Unexpected URL ${url}`);
    }));

    await expect(getBilibiliTranscript("https://www.bilibili.com/video/BV1abc"))
        .resolves.toMatchObject({ source: "ai_wbi", transcript: [{ from: 1, to: 2, content: "fallback" }] });
});

it("returns none only after a valid empty WBI subtitle list", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === "/x/web-interface/view") return jsonResponse(viewFixture());
        if (url.pathname === "/x/player/wbi/v2") return jsonResponse(wbiFixture());
        throw new Error(`Unexpected URL ${url}`);
    }));

    await expect(getBilibiliTranscript("https://www.bilibili.com/video/BV1abc"))
        .resolves.toMatchObject({ transcript: null, source: "none", aid: 7, cid: 11 });
});

it("rejects when the final selected subtitle body is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === "/x/web-interface/view") return jsonResponse(viewFixture());
        if (url.pathname === "/x/player/wbi/v2") return jsonResponse(wbiFixture("//wbi.example/sub.json"));
        if (url.hostname === "wbi.example") return jsonResponse({ body: [{ from: 0, to: null, content: "bad" }] });
        throw new Error(`Unexpected URL ${url}`);
    }));

    await expect(getBilibiliTranscript("https://www.bilibili.com/video/BV1abc"))
        .rejects.toThrow("Invalid subtitle body");
});
```

- [ ] **Step 2: Run the RED tests**

Run:

```powershell
npm test -- tests/unit/platforms/bilibili/api.test.ts tests/unit/platforms/bilibili/adapter.test.ts
```

Expected failures:

- `code: -412` resolves to empty-looking data instead of rejecting.
- `p=2` exposes/downloads the top-level P1 subtitle and never calls WBI.
- malformed view bodies return `human_view` with `transcript: null` instead of falling back.
- malformed final bodies resolve instead of rejecting.

- [ ] **Step 3: Add strict envelope parsing and selected/default cid separation**

In `api.ts`, add the error type and envelope validator:

```ts
export class BilibiliApiError extends Error {
    constructor(
        message: string,
        readonly endpoint: string,
        readonly code?: number,
    ) {
        super(message);
        this.name = "BilibiliApiError";
    }
}

function requireBilibiliEnvelope(value: unknown, endpoint: string): Record<string, unknown> {
    const root = asRecord(value);
    if (!root) throw new BilibiliApiError("Invalid Bilibili API response.", endpoint);
    const code = readNumber(root, "code");
    if (code !== 0) {
        const serviceMessage = readString(root, "message") ?? readString(root, "msg") ?? "Unknown error";
        throw new BilibiliApiError(`Bilibili API error (${code ?? "invalid"}): ${serviceMessage}`, endpoint, code);
    }
    return root;
}
```

Update `fetchJson()` to accept `signal`, wrap JSON parse failures with endpoint context, and keep `credentials: "include"` only for `api.bilibili.com`.

In `fetchBilibiliViewInfo()`:

```ts
const root = requireBilibiliEnvelope(await fetchJson(view.toString(), signal), view.toString());
const data = getNestedRecord(root, "data");
if (!data) throw new BilibiliApiError("Bilibili view response has no data.", view.toString());

const aid = readNumber(data, "aid");
const pages = getArray(data, "pages");
const firstPage = asRecord(pages[0]);
const selectedPage = asRecord(pages[getBiliPart(videoUrl) - 1]) ?? firstPage;
const defaultCid = readNumber(data, "cid") ?? (firstPage ? readNumber(firstPage, "cid") : undefined);
const cid = selectedPage ? readNumber(selectedPage, "cid") : undefined;
if (aid === undefined || cid === undefined || defaultCid === undefined) {
    throw new BilibiliApiError("Bilibili view response is missing aid/cid.", view.toString());
}

const availableSubtitles = cid === defaultCid
    ? getSubtitleItems(getArray(getNestedRecord(data, "subtitle") ?? {}, "list"))
    : [];
```

Apply `requireBilibiliEnvelope()` to the WBI endpoint as well.

- [ ] **Step 4: Make the adapter fall through only on a malformed view body**

Restructure `getBilibiliTranscript()` so a valid view transcript returns immediately, an invalid view body falls through to WBI, a valid empty WBI list returns `none`, and an invalid selected WBI body throws:

```ts
if (viewSubtitleUrl) {
    const { subtitleUrl, body } = await fetchBilibiliSubtitleBody(viewSubtitleUrl, signal);
    const transcript = normalizeBilibiliTranscript(body);
    if (transcript && transcript.length > 0) {
        return { transcript, source: "human_view", subtitleUrl, aid, cid, availableSubtitles: viewAvailableSubtitles };
    }
}

const aiSubtitles = await fetchBilibiliAiSubtitleUrl(aid, cid, bvid, signal);
if (aiSubtitles.length === 0) {
    return { transcript: null, source: "none", aid, cid };
}

const selected = aiSubtitles.find(isPreferredAiSubtitle) ?? aiSubtitles[0];
const { subtitleUrl, body } = await fetchBilibiliSubtitleBody(selected.subtitle_url, signal);
const transcript = normalizeBilibiliTranscript(body);
if (!transcript || transcript.length === 0) throw new Error(`Invalid subtitle body from ${subtitleUrl}`);
return { transcript, source: "ai_wbi", subtitleUrl, aid, cid, availableSubtitles: aiSubtitles };
```

Change `PlatformAdapter.getTranscript` and the adapter implementation to accept an optional `AbortSignal`.

- [ ] **Step 5: Run GREEN and all subtitle tests**

Run:

```powershell
npm test -- tests/unit/platforms/bilibili
npm exec tsc -- --noEmit --pretty false
```

Expected: all Bilibili tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit**

```powershell
git add tests/unit/platforms/bilibili src/platforms/bilibili src/platforms/types.ts
git commit -m "fix: load the correct Bilibili subtitle stream"
```

### Task 3: Introduce an Updatable, Disposable Panel Handle

**Files:**
- Create: `src/panel/types.ts`
- Create: `tests/dom/panel/mount.test.ts`
- Create: `tests/unit/settings/public-settings.test.ts`
- Modify: `src/panel/mount.ts:20-400`
- Modify: `src/panel/panel-view.ts:31-50, 140-215`

**Interfaces:**
- Consumes: `PlatformTranscriptResult`, current public-settings watcher, generation/export behavior.
- Produces:

```ts
export type PanelStatus = "loading" | "ready" | "error";

export type PanelData = PlatformTranscriptResult & {
    status: PanelStatus;
    errorMessage?: string;
};

export type PanelCallbacks = {
    onTranscriptChange?(result: PlatformTranscriptResult): void;
};

export type PanelHandle = {
    updateData(next: PanelData): void;
    reset(next: PanelData): void;
    dispose(): void;
};

export function mountPanel(host: HTMLElement, initialData: PanelData, callbacks?: PanelCallbacks): PanelHandle;
```

- [ ] **Step 1: Write panel lifecycle RED tests in jsdom**

Start the file with:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    stopSettings: vi.fn(),
    controllers: [] as AbortController[],
    generationOptions: [] as Array<{ onDone(text: string): void }>,
    copyTranscript: vi.fn(async () => undefined),
    copyMarkdownText: vi.fn(async () => undefined),
}));

vi.mock("../../../src/settings/public-client", async () => {
    const { DEFAULT_PUBLIC_SETTINGS } = await import("../../../src/settings/public");
    return {
        watchPublicSettings(listener: (settings: typeof DEFAULT_PUBLIC_SETTINGS) => void) {
            listener(DEFAULT_PUBLIC_SETTINGS);
            return mocks.stopSettings;
        },
    };
});

vi.mock("../../../src/generation/llm-provider", () => ({
    streamGeneration: vi.fn((options: { onDone(text: string): void }) => {
        const controller = new AbortController();
        mocks.controllers.push(controller);
        mocks.generationOptions.push(options);
        return controller;
    }),
}));

vi.mock("../../../src/panel/export-utils", async (importOriginal) => ({
    ...await importOriginal<typeof import("../../../src/panel/export-utils")>(),
    copyTranscript: mocks.copyTranscript,
    copyMarkdownText: mocks.copyMarkdownText,
}));

function clickTab(host: HTMLElement, mode: "original" | "intensive" | "overview"): void {
    const labels = { original: "原文", intensive: "精读", overview: "总览" };
    const button = [...host.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.tab")]
        .find((candidate) => candidate.textContent?.trim() === labels[mode]);
    if (!button) throw new Error(`Missing ${mode} tab`);
    button.click();
}

function activeTabText(host: HTMLElement): string {
    return host.shadowRoot?.querySelector("button.tab.active")?.textContent?.trim() ?? "";
}

function clickAction(host: HTMLElement, title: string): void {
    const button = host.shadowRoot?.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
    if (!button) throw new Error(`Missing action: ${title}`);
    button.click();
}

function mountReadyPanel(): { host: HTMLElement; handle: PanelHandle } {
    const host = document.createElement("section");
    document.body.append(host);
    const handle = mountPanel(host, {
        transcript: [{ from: 0, to: 1, content: "ready" }],
        source: "human_view",
        status: "ready",
    });
    return { host, handle };
}

beforeEach(() => {
    document.body.replaceChildren();
    mocks.controllers.length = 0;
    mocks.generationOptions.length = 0;
    vi.clearAllMocks();
});
```

Mock `watchPublicSettings()` so it immediately supplies deterministic settings, and mock `streamGeneration()` so its call count and AbortController are observable. Add these tests:

```ts
it("preserves the selected mode when loading data becomes ready", async () => {
    const host = document.createElement("section");
    document.body.append(host);
    const handle = mountPanel(host, { transcript: null, source: "none", status: "loading" });
    clickTab(host, "intensive");

    handle.updateData({
        transcript: [{ from: 0, to: 1, content: "ready" }],
        source: "human_view",
        status: "ready",
    });

    expect(activeTabText(host)).toBe("精读");
    expect(streamGeneration).toHaveBeenCalledTimes(1);
});

it("reset aborts video-specific work and restores a fresh panel", () => {
    const { host, handle } = mountReadyPanel();
    clickTab(host, "overview");
    const activeAbort = mocks.controllers.at(-1)!;
    handle.reset({ transcript: null, source: "none", status: "loading" });
    expect(activeAbort.signal.aborted).toBe(true);
    expect(activeTabText(host)).toBe("原文");
});

it("dispose is idempotent and removes listeners once", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { handle } = mountReadyPanel();
    handle.dispose();
    handle.dispose();
    expect(mocks.stopSettings).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
});

it("keeps Original copy bound to transcript export", async () => {
    const { host } = mountReadyPanel();
    clickAction(host, "复制当前内容");
    await Promise.resolve();
    expect(mocks.copyTranscript).toHaveBeenCalledTimes(1);
    expect(mocks.copyMarkdownText).not.toHaveBeenCalled();
});

it("keeps Overview copy bound to generated Markdown export", async () => {
    const { host } = mountReadyPanel();
    clickTab(host, "overview");
    mocks.generationOptions.at(-1)!.onDone("# overview");
    clickAction(host, "复制当前内容");
    await Promise.resolve();
    expect(mocks.copyMarkdownText).toHaveBeenCalledWith("# overview");
});
```

Add the security characterization in `tests/unit/settings/public-settings.test.ts` before refactoring:

```ts
import { expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { toPublicSettings } from "../../../src/settings/public";

it("never exposes private generation settings to content", () => {
    const value = toPublicSettings({ ...DEFAULT_SETTINGS, generationApiKey: "secret" });
    expect(value).not.toHaveProperty("generationApiKey");
    expect(value).not.toHaveProperty("generationProvider");
    expect(value).not.toHaveProperty("generationModels");
    expect(value).not.toHaveProperty("generationPromptTemplates");
});
```

This characterization test must pass before and after the panel refactor.

- [ ] **Step 2: Run the RED panel tests**

Run:

```powershell
npm test -- tests/dom/panel/mount.test.ts tests/unit/settings/public-settings.test.ts
```

Expected: current `mountPanel()` returns `undefined`; loading-to-ready requires a second destructive mount; state/cleanup assertions fail.

- [ ] **Step 3: Move shared panel contracts to `src/panel/types.ts`**

Create the exact `PanelStatus`, `PanelData`, `PanelCallbacks`, and `PanelHandle` types above. Import `PanelData` into both `mount.ts` and `panel-view.ts`, replacing the view's inline data shape. Render loading when `status === "loading"`, error UI when `status === "error"`, and the normal empty state only for ready `source: "none"`.

- [ ] **Step 4: Return one idempotent handle from `mountPanel()`**

Change the immutable parameter to mutable instance data:

```ts
export function mountPanel(
    host: HTMLElement,
    initialData: PanelData,
    callbacks: PanelCallbacks = {},
): PanelHandle {
    let data = initialData;
    let isDisposed = false;
    // existing instance state follows
```

Create explicit operations at the end of the function:

```ts
const dispose = (): void => {
    if (isDisposed) return;
    isDisposed = true;
    clearAllGenerationStates();
    stopWatchingSettings?.();
    stopWatchingSettings = null;
    document.removeEventListener("pointerdown", handlePointerDown, true);
};

const handle: PanelHandle = {
    updateData(next) {
        if (isDisposed) return;
        data = next;
        if (!maybeGenerateForMode()) renderPanel();
    },
    reset(next) {
        if (isDisposed) return;
        clearAllGenerationStates();
        data = next;
        mode = "original";
        hasUserSelectedMode = false;
        isNoteOpen = false;
        renderPanel();
    },
    dispose,
};

renderPanel();
return handle;
```

Keep the private host cleanup symbol only as an internal compatibility guard if needed; content code must use the returned handle. Ensure a second mount on the same host disposes the previous internal handle before replacement.

- [ ] **Step 5: Run GREEN and refactor without changing behavior**

Run:

```powershell
npm test -- tests/dom/panel/mount.test.ts tests/unit/settings/public-settings.test.ts
npm exec tsc -- --noEmit --pretty false
```

Expected: lifecycle tests pass; current public-settings and export TypeScript paths remain valid.

- [ ] **Step 6: Commit**

```powershell
git add src/panel/types.ts src/panel/mount.ts src/panel/panel-view.ts tests/dom/panel/mount.test.ts tests/unit/settings/public-settings.test.ts
git commit -m "refactor: give the caption panel an explicit lifecycle"
```

### Task 4: Make the Content Layer Own One Canonical Session

**Files:**
- Create: `src/content/controller.ts`
- Create: `tests/unit/content/controller.test.ts`
- Modify: `src/content/dom.ts:1-35`
- Modify: `src/content/index.ts:1-113`
- Modify: `src/platforms/index.ts:6-24`
- Modify: `src/platforms/types.ts:14-18`
- Modify: `src/platforms/bilibili/api.ts:39-44,100-127`
- Modify: `src/platforms/bilibili/adapter.ts:57-63`

**Interfaces:**
- Consumes: `PanelHandle`, signal-aware `PlatformAdapter.getTranscript`, concrete Bilibili route identity.
- Produces:

```ts
export type ContentController = {
    navigate(url: string): Promise<void>;
    recoverHost(): void;
    dispose(): void;
};

export type ContentControllerDeps = {
    routeKeyForUrl(url: string): string | null;
    waitForAnchor(signal: AbortSignal): Promise<Element>;
    getAnchor(): Element | null;
    ensureHost(anchor: Element): HTMLElement;
    loadTranscript(url: string, signal: AbortSignal): Promise<PlatformTranscriptResult>;
    mountPanel(host: HTMLElement, data: PanelData, callbacks: PanelCallbacks): PanelHandle;
    observeDom(listener: () => void): () => void;
};

export function createContentController(deps: ContentControllerDeps): ContentController;
export function getBilibiliRouteKey(url: string): string | null;
export function getPlatformRouteKey(url: string): string | null;
```

- [ ] **Step 1: Write session lifecycle RED tests with injected fakes**

Create deferred-promise helpers and fake anchors/hosts. Test these behaviors:

```ts
it("does not wait for an anchor on an unsupported initial route", async () => {
    const deps = createDeps({ routeKey: null });
    await createContentController(deps).navigate("https://www.bilibili.com/");
    expect(deps.waitForAnchor).not.toHaveBeenCalled();
});

it("ignores hash and tracking-query changes for the same video part", async () => {
    const deps = createDeps({ routeKey: "bilibili:BV1abc:p=1" });
    const controller = createContentController(deps);
    await controller.navigate("https://www.bilibili.com/video/BV1abc?p=1");
    await controller.navigate("https://www.bilibili.com/video/BV1abc?p=1&spm_id_from=x#reply");
    expect(deps.loadTranscript).toHaveBeenCalledTimes(1);
});

it("leaving a supported route aborts, disposes, and removes the host once", async () => {
    const deps = createDeps({ routeKey: "bilibili:BV1abc:p=1" });
    const controller = createContentController(deps);
    await controller.navigate(videoUrl);
    await controller.navigate("https://www.bilibili.com/");
    expect(deps.panelHandle.dispose).toHaveBeenCalledTimes(1);
    expect(deps.loadedSignal.aborted).toBe(true);
    expect(deps.host.remove).toHaveBeenCalledTimes(1);
});

it("host recovery reinserts the same host without remounting", async () => {
    const deps = createDeps({ routeKey: "bilibili:BV1abc:p=1" });
    const controller = createContentController(deps);
    await controller.navigate(videoUrl);
    deps.detachHost();
    controller.recoverHost();
    expect(deps.anchor.prepend).toHaveBeenCalledWith(deps.host);
    expect(deps.mountPanel).toHaveBeenCalledTimes(1);
});

it("stores an error terminal state so recovery never returns to loading", async () => {
    const deps = createDeps({ loadError: new Error("network down") });
    const controller = createContentController(deps);
    await controller.navigate(videoUrl);
    expect(deps.panelHandle.updateData).toHaveBeenLastCalledWith(expect.objectContaining({
        status: "error",
        errorMessage: expect.stringContaining("network down"),
    }));
    deps.detachHost();
    controller.recoverHost();
    expect(deps.panelHandle.reset).not.toHaveBeenCalled();
});
```

The fake DOM objects must expose only the methods used by the controller (`contains`, `prepend`, `remove`) and be cast to their DOM types.

- [ ] **Step 2: Run the RED content tests**

Run:

```powershell
npm test -- tests/unit/content/controller.test.ts
```

Expected: the controller module/API does not exist, and the equivalent current orchestration would wait on unsupported pages, reload full href changes, fail to dispose detached instances, and lose terminal errors.

- [ ] **Step 3: Add abortable DOM waiting**

Change `waitForElm()` to accept `{ signal?: AbortSignal }`, reject immediately when already aborted, disconnect its MutationObserver on resolve/abort, and remove the abort listener in one cleanup function:

```ts
export function waitForElm(selector: string, options: { signal?: AbortSignal } = {}): Promise<Element> {
    const found = document.querySelector(selector);
    if (found) return Promise.resolve(found);
    if (options.signal?.aborted) return Promise.reject(new DOMException("Element wait was aborted.", "AbortError"));
    // Observer and abort listener both call the same cleanup before settle.
}
```

- [ ] **Step 4: Add stable route keys**

Export the validated Bilibili part number and route key:

```ts
export function getBilibiliRouteKey(url: string): string | null {
    const id = getBiliVideoId(url);
    return id ? `bilibili:${id}:p=${getBiliPart(url)}` : null;
}
```

Add `getRouteKey(url)` to `PlatformAdapter`, implement it in `bilibiliAdapter`, and add `getPlatformRouteKey(url)` to `src/platforms/index.ts`. Do not add another platform abstraction layer.

- [ ] **Step 5: Implement `createContentController()`**

Use one nullable session:

```ts
type ContentSession = {
    routeKey: string;
    abort: AbortController;
    host: HTMLElement | null;
    panel: PanelHandle | null;
    data: PanelData;
    stopObserving: (() => void) | null;
};
```

`navigate()` must:

1. Return after disposing when `routeKeyForUrl()` is null.
2. Return without work when the key matches the active session.
3. Dispose the prior session, create loading data, and wait with the new signal.
4. Mount exactly once, then update the same handle with ready or error data.
5. Ignore results from a disposed/replaced session.

`recoverHost()` must prepend `session.host` to the current anchor when detached, then call `session.panel.updateData(session.data)`; it must not call `mountPanel()` again. `dispose()` must be idempotent and clear observer, request, panel, and host.

- [ ] **Step 6: Reduce `src/content/index.ts` to concrete wiring**

Instantiate the controller with real dependencies, call `navigate(location.href)` only through it, and route MutationObserver callbacks to `recoverHost()`. Use `getTranscriptForUrl(url, signal)` and propagate the signal through the registry/adapter. Keep the existing 800 ms route watcher for now; stable route keys suppress irrelevant remounts.

- [ ] **Step 7: Run GREEN and the affected suites**

Run:

```powershell
npm test -- tests/unit/content/controller.test.ts tests/dom/panel/mount.test.ts tests/unit/platforms/bilibili
npm exec tsc -- --noEmit --pretty false
```

Expected: all selected tests and TypeScript pass.

- [ ] **Step 8: Commit**

```powershell
git add src/content src/platforms src/panel/types.ts tests/unit/content
git commit -m "fix: own SPA state in one content session"
```

### Task 5: Make Subtitle Language Switching Transactional

**Files:**
- Modify: `tests/dom/panel/mount.test.ts`
- Modify: `tests/unit/content/controller.test.ts`
- Modify: `src/panel/types.ts`
- Modify: `src/panel/mount.ts:240-290, 390-410`
- Modify: `src/panel/panel-view.ts:185-220`
- Modify: `src/platforms/bilibili/api.ts:180-191`

**Interfaces:**
- Consumes: `PanelCallbacks.onTranscriptChange`, signal-aware `fetchBilibiliSubtitleBody`.
- Produces: latest-wins language selection with committed/pending/error state and canonical content-session updates.

- [ ] **Step 1: Add language race, rollback, disposal, and recovery RED tests**

Use deferred fetch promises and a controlled `<select>`:

```ts
it("commits only the latest language request", async () => {
    const b = deferredSubtitle();
    const c = deferredSubtitle();
    mockSubtitleFetch(new Map([["b", b.promise], ["c", c.promise]]));
    const { host } = mountMultilingualPanel("a");

    changeLanguage(host, "b");
    changeLanguage(host, "c");
    c.resolve(validSubtitle("C"));
    await flushPromises();
    b.resolve(validSubtitle("B"));
    await flushPromises();

    expect(selectedLanguage(host)).toBe("c");
    expect(originalTranscriptText(host)).toContain("C");
    expect(originalTranscriptText(host)).not.toContain("B");
});

it("rolls back the selector and transcript when switching fails", async () => {
    mockSubtitleFetchRejecting("b", new Error("subtitle unavailable"));
    const { host } = mountMultilingualPanel("a");
    changeLanguage(host, "b");
    await flushPromises();
    expect(selectedLanguage(host)).toBe("a");
    expect(originalTranscriptText(host)).toContain("A");
    expect(host.shadowRoot?.textContent).toContain("subtitle unavailable");
});

it("does not commit a language response after dispose", async () => {
    const pending = deferredSubtitle();
    const onTranscriptChange = vi.fn();
    const handle = mountMultilingualPanel("a", { pending, onTranscriptChange });
    changeLanguage(handle.host, "b");
    handle.dispose();
    pending.resolve(validSubtitle("B"));
    await flushPromises();
    expect(onTranscriptChange).not.toHaveBeenCalled();
});

it("recovers with the latest committed language data", async () => {
    const deps = createDeps({ routeKey: "bilibili:BV1abc:p=1" });
    const controller = createContentController(deps);
    await controller.navigate(videoUrl);
    deps.capturedPanelCallbacks.onTranscriptChange?.({
        transcript: [{ from: 4, to: 5, content: "selected language" }],
        source: "human_view",
        subtitleUrl: "https://subtitle.example/selected.json",
        availableSubtitles: [],
        aid: 7,
        cid: 11,
    });
    deps.detachHost();
    controller.recoverHost();
    expect(deps.anchor.prepend).toHaveBeenLastCalledWith(deps.host);
    expect(deps.panelHandle.updateData).toHaveBeenLastCalledWith(expect.objectContaining({
        status: "ready",
        subtitleUrl: "https://subtitle.example/selected.json",
        transcript: [{ from: 4, to: 5, content: "selected language" }],
    }));
});
```

- [ ] **Step 2: Run the RED tests**

Run:

```powershell
npm test -- tests/dom/panel/mount.test.ts tests/unit/content/controller.test.ts
```

Expected: stale responses can overwrite newer ones, failed selection stays visually dirty, and content recovery retains initial data.

- [ ] **Step 3: Add committed/pending/error state and request cancellation**

In the panel instance:

```ts
let subtitleRequestId = 0;
let subtitleController: AbortController | null = null;
let pendingSubtitleUrl: string | null = null;
let subtitleError: string | null = null;
```

On selection, increment the id, abort the prior controller, set pending URL, and render. After fetch/normalize, commit only when the id is current and the panel is live:

```ts
const transcript = normalizeBilibiliTranscript(body);
if (!transcript) throw new Error("Invalid subtitle body.");
if (requestId !== subtitleRequestId || isDisposed) return;

data = { ...data, transcript, subtitleUrl: newUrl, status: "ready" };
pendingSubtitleUrl = null;
subtitleError = null;
callbacks.onTranscriptChange?.({
    transcript,
    source: data.source,
    subtitleUrl: newUrl,
    availableSubtitles: data.availableSubtitles,
    aid: data.aid,
    cid: data.cid,
});
clearAllGenerationStates();
isNoteOpen = false;
```

On failure of the current request, clear pending, retain committed `data`, set a safe error string, and render. In `reset()`/`dispose()`, increment the id and abort the controller.

- [ ] **Step 4: Make the language select controlled**

Pass `pendingSubtitleUrl` and `subtitleError` to the view. Bind the element property rather than option attributes:

```ts
<select
    class="lang-select"
    .value=${pendingSubtitleUrl ?? data.subtitleUrl ?? ""}
    @change=${handleLanguageChange}
>
    ${data.availableSubtitles?.map((subtitle) => html`
        <option .value=${subtitle.subtitle_url}>${subtitle.lan_doc}</option>
    `)}
</select>
${subtitleError ? html`<span class="subtitle-error" role="status">${subtitleError}</span>` : nothing}
```

Use Lit's `nothing` import or an empty template consistently with nearby code.

- [ ] **Step 5: Update canonical content data before recovery**

The `PanelCallbacks.onTranscriptChange` supplied by the content controller must replace the active session's ready data only if that same session is still active. Host recovery then reuses the same host/handle and calls `panel.updateData(session.data)` so the canonical committed value is rendered without remounting.

- [ ] **Step 6: Run GREEN and the complete first-plan suite**

Run:

```powershell
npm test -- tests/unit/platforms/bilibili tests/unit/content tests/dom/panel
npm exec tsc -- --noEmit --pretty false
git diff --check
```

Expected: all tests pass, TypeScript exits 0, and diff check is clean.

- [ ] **Step 7: Commit**

```powershell
git add src/panel src/content src/platforms/bilibili/api.ts tests/dom/panel tests/unit/content
git commit -m "fix: make subtitle language changes transactional"
```

## Plan Completion Gate

Before starting the generation plan, run:

```powershell
npm test
npm run build
git diff --check
```

Expected: zero test failures, build exit 0, and no whitespace errors. Do not claim Chrome behavior verified until the final smoke matrix in the settings/build plan is executed.
