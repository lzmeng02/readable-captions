# Panel Interaction Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Panel presentation state instance-safe, keep the More disclosure usable while collapsed, surface safe export results, and provide keyboard/accessibility semantics for icon and collapse controls.

**Architecture:** `mountPanel()` remains the owner of lifecycle and mutable UI state; `panelTemplate()` receives controlled values and callbacks and only renders them. Export helpers retain low-level clipboard/download responsibilities and guarantee resource cleanup, while one mount-owned action runner converts operation outcomes into short-lived safe UI feedback.

**Tech Stack:** TypeScript 5.9, Lit 3, Chrome Manifest V3 content-script Shadow DOM, Vitest 4, jsdom, Vite 7.

## Global Constraints

- Work only on `fix/chrome-frontend-runtime` and update existing Draft PR #9; do not open another PR.
- Preserve provider/settings/generation/content-session protocols; this patch is limited to Panel interaction and export helpers.
- Start a newly mounted video Panel expanded; preserve collapse only for `updateData()` and host recovery on the same handle.
- Do not persist collapse across videos, tabs, or browser restarts.
- Keep the More disclosure as ordinary buttons; do not add `role="menu"`, `menuitem`, `aria-haspopup="menu"`, or incomplete APG tab semantics.
- Render only fixed localized export messages; never put raw exception text, API keys, provider bodies, or secrets into Panel DOM.
- Do not add a UI framework, browser-test dependency, or floating-position engine.
- Add each behavioral regression and observe the intended RED result before editing the corresponding production code.
- Real Chrome/Bilibili/authenticated-provider smoke remains explicitly unverified and non-gating.
- Never stage `dist/`, `node_modules/`, secrets, or unrelated user files.

---

### Task 1: Isolate collapse state and release menu clipping

**Files:**
- Modify: `tests/dom/panel/mount.test.ts`
- Modify: `src/panel/mount.ts`
- Modify: `src/panel/panel-view.ts`

**Interfaces:**
- Consumes: existing `PanelUiOptions.isMenuOpen` / `onMenuOpenChange(next)`.
- Produces: `PanelUiOptions.isCollapsed: boolean` and `onCollapsedChange(next: boolean): void`.
- Preserves: `PanelHandle.updateData(next)`, `reset(next)`, and `dispose()` signatures.

- [x] **Step 1: Add collapse/menu test helpers and failing lifecycle regressions**

Add beside `moreMenu()`:

```ts
function panelRoot(host: HTMLElement): HTMLElement {
    const panel = host.shadowRoot?.querySelector<HTMLElement>(".panel");
    if (!panel) throw new Error("Missing panel root");
    return panel;
}

function toggleCollapse(host: HTMLElement): void {
    const control = host.shadowRoot?.querySelector<HTMLElement>(".title-area");
    if (!control) throw new Error("Missing collapse control");
    control.click();
}
```

Add these focused cases inside `describe("mountPanel lifecycle")`:

```ts
it("restores expanded presentation state on reset", () => {
    const { host, handle } = mountReadyPanel();
    try {
        toggleCollapse(host);
        expect(panelRoot(host).classList).toContain("collapsed");
        handle.reset({ transcript: null, source: "none", status: "loading" });
        expect(panelRoot(host).classList).not.toContain("collapsed");
    } finally {
        handle.dispose();
    }
});

it("starts a remounted panel expanded after the previous panel was collapsed", () => {
    const first = mountReadyPanel();
    toggleCollapse(first.host);
    first.handle.dispose();
    first.host.remove();

    const second = mountReadyPanel();
    try {
        expect(panelRoot(second.host).classList).not.toContain("collapsed");
    } finally {
        second.handle.dispose();
    }
});

it("keeps collapse state isolated between mounted panels", () => {
    const first = mountReadyPanel();
    const second = mountReadyPanel();
    try {
        toggleCollapse(first.host);
        second.handle.updateData({
            transcript: [{ from: 0, to: 1, content: "second rerender" }],
            source: "human_view",
            status: "ready",
        });
        expect(panelRoot(first.host).classList).toContain("collapsed");
        expect(panelRoot(second.host).classList).not.toContain("collapsed");
    } finally {
        first.handle.dispose();
        second.handle.dispose();
    }
});

it("preserves collapse state while the same panel receives data updates", () => {
    const { host, handle } = mountReadyPanel();
    try {
        toggleCollapse(host);
        handle.updateData({
            transcript: [{ from: 0, to: 1, content: "updated" }],
            source: "human_view",
            status: "ready",
        });
        expect(panelRoot(host).classList).toContain("collapsed");
    } finally {
        handle.dispose();
    }
});

it("releases panel overflow while More is open in collapsed state", () => {
    const { host, handle } = mountReadyPanel();
    try {
        toggleCollapse(host);
        clickAction(host, "更多");
        expect(panelRoot(host).classList).toContain("collapsed");
        expect(panelRoot(host).classList).toContain("menu-open");
        expect(moreMenu(host)).not.toBeNull();
        expect(host.shadowRoot?.querySelector("style[data-rc]")?.textContent)
            .toMatch(/\.panel\.menu-open\s*\{[^}]*overflow:\s*visible/s);
    } finally {
        handle.dispose();
    }
});
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm test -- tests/dom/panel/mount.test.ts -t "collapse|collapsed|remounted|overflow"
```

Expected: reset/remount and two-panel isolation fail because collapse is module-global; the menu case fails because `menu-open` and its overflow rule do not exist. The same-handle update case may already pass and records the preservation contract.

- [x] **Step 3: Move collapse ownership into `mountPanel()`**

Remove module-level `let isCollapsed = false`. Extend `PanelUiOptions` and its default:

```ts
isCollapsed: boolean;
onCollapsedChange: (isCollapsed: boolean) => void;
```

```ts
isCollapsed: false,
onCollapsedChange: () => undefined,
```

Read and update it in `panelTemplate()`:

```ts
const isCollapsed = uiOptions.isCollapsed;
const toggleCollapse = () => {
    uiOptions.onCollapsedChange(!isCollapsed);
    setMode(mode);
};
```

Create `let isCollapsed = false` beside the other instance UI state in `mount.ts`. Pass:

```ts
isCollapsed,
onCollapsedChange: (nextIsCollapsed) => {
    isCollapsed = nextIsCollapsed;
},
```

Set `isCollapsed = false` in `reset(next)`. Do not change it in `updateData()` or `dispose()`.

- [x] **Step 4: Add the conditional overflow escape**

Render:

```ts
<div class="panel ${isCollapsed ? "collapsed" : ""} ${isMenuOpen ? "menu-open" : ""}">
```

Add:

```css
.panel.menu-open {
    overflow: visible;
}
```

Keep base `.panel { overflow: hidden; }` and `.content { overflow-y: auto; }` unchanged.

- [x] **Step 5: Run GREEN checks and commit**

```powershell
npm test -- tests/dom/panel/mount.test.ts
npm test -- tests/dom/panel/mount-generation-render.test.ts tests/dom/panel/mount-settings-readiness.test.ts
npm exec tsc -- --noEmit --pretty false
git add -- src/panel/mount.ts src/panel/panel-view.ts tests/dom/panel/mount.test.ts
git commit -m "fix: isolate panel presentation state"
```

Expected: all focused tests pass and TypeScript exits 0.

---

### Task 2: Guarantee clipboard and download resource cleanup

**Files:**
- Create: `tests/unit/panel/export-utils.test.ts`
- Modify: `src/panel/export-utils.ts`

**Interfaces:**
- Preserves all exported function signatures in `export-utils.ts`.
- Produces: fallback textarea/selection restoration in `finally` and blob URL cleanup scheduling after successful or throwing anchor activation.

- [x] **Step 1: Add failing cleanup tests**

Create `tests/unit/panel/export-utils.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyMarkdownText, downloadMarkdownText } from "../../../src/panel/export-utils";

describe("Panel export resource cleanup", () => {
    const execCommand = vi.fn();

    beforeEach(() => {
        document.body.replaceChildren();
        Object.defineProperty(document, "execCommand", {
            configurable: true,
            value: execCommand,
        });
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: undefined,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        execCommand.mockReset();
        Reflect.deleteProperty(document, "execCommand");
        Reflect.deleteProperty(navigator, "clipboard");
        document.body.replaceChildren();
    });

    it("removes the fallback textarea when execCommand throws", async () => {
        execCommand.mockImplementationOnce(() => {
            throw new Error("copy failed");
        });

        await expect(copyMarkdownText("content")).rejects.toThrow("copy failed");

        expect(document.querySelector("textarea")).toBeNull();
    });

    it("removes the temporary anchor and revokes its URL after click throws", () => {
        vi.useFakeTimers();
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
        const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
            throw new Error("download blocked");
        });

        expect(() => downloadMarkdownText("# note", "title")).toThrow("download blocked");
        expect(document.querySelector("a[download]")).toBeNull();
        expect(revoke).not.toHaveBeenCalled();

        vi.runAllTimers();
        expect(revoke).toHaveBeenCalledWith("blob:test");
    });
});
```

- [x] **Step 2: Run the new suite and verify RED**

```powershell
npm test -- tests/unit/panel/export-utils.test.ts
```

Expected: the fallback textarea remains attached after `execCommand` throws, and no URL revocation is scheduled after anchor `click` throws.

- [x] **Step 3: Put fallback-copy cleanup in `finally`**

Replace the mutation portion of `fallbackCopyText()`:

```ts
let copied = false;
document.body.appendChild(textarea);

try {
    textarea.focus();
    textarea.select();
    copied = document.execCommand("copy");
} finally {
    textarea.remove();
    if (previousRange && selection) {
        selection.removeAllRanges();
        selection.addRange(previousRange);
    }
}

if (!copied) {
    throw new Error("Failed to copy text to clipboard.");
}
```

- [x] **Step 4: Put download activation and URL cleanup in `finally`**

Replace anchor activation in `downloadTextFile()`:

```ts
const a = document.createElement("a");
a.href = url;
a.download = `${safeTitle}.${extension}`;
a.rel = "noopener";
document.body.appendChild(a);

try {
    a.click();
} finally {
    a.remove();
    window.setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 30000);
}
```

The original exception continues propagating to the Panel action runner.

- [x] **Step 5: Run GREEN checks and commit**

```powershell
npm test -- tests/unit/panel/export-utils.test.ts tests/dom/panel/mount.test.ts
npm exec tsc -- --noEmit --pretty false
git add -- src/panel/export-utils.ts tests/unit/panel/export-utils.test.ts
git commit -m "fix: clean up failed panel exports"
```

Expected: export cleanup and existing filename/export behavior pass.

---

### Task 3: Surface safe copy/download feedback

**Files:**
- Create: `tests/dom/panel/mount-action-feedback.test.ts`
- Modify: `src/panel/mount.ts`
- Modify: `src/panel/panel-view.ts`

**Interfaces:**

```ts
export type PanelAction = "copy" | "download";
export type ActionFeedback =
    | { action: PanelAction; status: "success" | "error" }
    | null;
```

`PanelUiOptions` gains `actionFeedback: ActionFeedback`. Public `PanelHandle` and export-helper signatures stay unchanged.

- [x] **Step 1: Add the feedback harness and basic failing cases**

Create `tests/dom/panel/mount-action-feedback.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountPanel } from "../../../src/panel/mount";
import type { PanelHandle } from "../../../src/panel/types";

const mocks = vi.hoisted(() => ({
    stopSettings: vi.fn(),
    generationOptions: [] as Array<{ onDone(text: string): void }>,
    copyTranscript: vi.fn(async () => undefined),
    copyMarkdownText: vi.fn(async () => undefined),
    copyMarkdownNote: vi.fn(async () => undefined),
    downloadTranscript: vi.fn(),
    downloadMarkdownText: vi.fn(),
    downloadMarkdownNote: vi.fn(),
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
        mocks.generationOptions.push(options);
        return new AbortController();
    }),
}));

vi.mock("../../../src/panel/export-utils", () => ({
    copyTranscript: mocks.copyTranscript,
    copyMarkdownText: mocks.copyMarkdownText,
    copyMarkdownNote: mocks.copyMarkdownNote,
    downloadTranscript: mocks.downloadTranscript,
    downloadMarkdownText: mocks.downloadMarkdownText,
    downloadMarkdownNote: mocks.downloadMarkdownNote,
}));

const handles: PanelHandle[] = [];

function mountReadyPanel(): HTMLElement {
    const host = document.createElement("section");
    document.body.append(host);
    handles.push(mountPanel(host, {
        transcript: [{ from: 0, to: 1, content: "ready" }],
        source: "human_view",
        status: "ready",
    }));
    return host;
}

function action(host: HTMLElement, title: string): HTMLButtonElement {
    const button = host.shadowRoot?.querySelector<HTMLButtonElement>(
        `button[title="${title}"]`,
    );
    if (!button) throw new Error(`Missing action: ${title}`);
    return button;
}

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

beforeEach(() => {
    document.body.replaceChildren();
    mocks.generationOptions.length = 0;
    vi.clearAllMocks();
});

afterEach(() => {
    vi.useRealTimers();
    for (const handle of handles.splice(0)) handle.dispose();
    document.body.replaceChildren();
});

describe("Panel export action feedback", () => {
    it("shows a safe visible error when copy rejects", async () => {
        const marker = "private-copy-detail";
        mocks.copyTranscript.mockRejectedValueOnce(new Error(marker));
        const host = mountReadyPanel();
        action(host, "复制当前内容").click();
        await flushPromises();
        expect(host.shadowRoot?.querySelector(".action-feedback[role=alert]")?.textContent)
            .toContain("复制失败");
        expect(host.shadowRoot?.textContent).not.toContain(marker);
    });

    it("catches a synchronous download throw and shows a safe visible error", async () => {
        const marker = "private-download-detail";
        mocks.downloadTranscript.mockImplementationOnce(() => {
            throw new Error(marker);
        });
        const host = mountReadyPanel();
        action(host, "下载当前内容").click();
        await flushPromises();
        expect(host.shadowRoot?.querySelector(".action-feedback[role=alert]")?.textContent)
            .toContain("下载失败");
        expect(host.shadowRoot?.textContent).not.toContain(marker);
    });

    it("announces copied and download-started outcomes", async () => {
        const host = mountReadyPanel();
        action(host, "复制当前内容").click();
        await flushPromises();
        expect(host.shadowRoot?.querySelector(".action-feedback[role=status]")?.textContent)
            .toContain("已复制");

        action(host, "下载当前内容").click();
        await flushPromises();
        expect(host.shadowRoot?.querySelector(".action-feedback[role=status]")?.textContent)
            .toContain("已开始下载");
    });

    it("routes Note copy and download through the same feedback boundary", async () => {
        const host = mountReadyPanel();
        action(host, "更多").click();
        const openNote = [...host.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.overflow-item")]
            .find((button) => button.textContent?.includes("导出 Markdown Note"));
        openNote?.click();
        mocks.generationOptions.at(-1)!.onDone("# note");

        const noteButtons = [...host.shadowRoot!.querySelectorAll<HTMLButtonElement>(".note-action-btn")];
        noteButtons.find((button) => button.textContent?.includes("复制 Markdown"))?.click();
        await flushPromises();
        expect(mocks.copyMarkdownNote).toHaveBeenCalledWith("# note");
        expect(host.shadowRoot?.textContent).toContain("已复制");

        noteButtons.find((button) => button.textContent?.includes("下载 .md"))?.click();
        await flushPromises();
        expect(mocks.downloadMarkdownNote).toHaveBeenCalled();
        expect(host.shadowRoot?.textContent).toContain("已开始下载");
    });
});
```

- [x] **Step 2: Run the basic cases and verify RED**

```powershell
npm test -- tests/dom/panel/mount-action-feedback.test.ts
```

Expected: no `.action-feedback` exists; the synchronous download case also demonstrates that `Promise.resolve(action())` executes too late to catch the throw.

- [x] **Step 3: Add minimal mount-owned feedback**

Add the Interfaces types and `actionFeedback: null` to the default `PanelUiOptions`. Render after settings status:

```ts
const renderActionFeedback = () => {
    const feedback = uiOptions.actionFeedback;
    if (!feedback) return nothing;
    const message = feedback.action === "copy"
        ? (feedback.status === "success"
            ? (currentLang === "zh" ? "已复制" : "Copied")
            : (currentLang === "zh" ? "复制失败，请重试" : "Copy failed. Please try again."))
        : (feedback.status === "success"
            ? (currentLang === "zh" ? "已开始下载" : "Download started")
            : (currentLang === "zh" ? "下载失败，请重试" : "Download failed. Please try again."));

    return html`
        <div
            class="action-feedback ${feedback.status}"
            role=${feedback.status === "error" ? "alert" : "status"}
        >${message}</div>
    `;
};
```

Add `.action-feedback` styling parallel to `.settings-status`: green status colors (`#f1fbf3`/`#2b7a3d`), red error colors (`#fff3f3`/`#d03030`), 6px/16px padding, 12px text, and top/bottom borders.

Delete `handleActionClick()`. Keep only event suppression in the view:

```ts
const invokeAction = (event: Event, action?: () => void | Promise<void>) => {
    event.preventDefault();
    event.stopPropagation();
    action?.();
};
```

In `mount.ts` import `ActionFeedback` / `PanelAction`, add `let actionFeedback: ActionFeedback = null`, and implement:

```ts
const runAction = (
    action: PanelAction,
    operation: () => boolean | void | Promise<boolean | void>,
): void => {
    void (async () => {
        try {
            const performed = await operation();
            if (performed === false || isDisposed) return;
            actionFeedback = { action, status: "success" };
        } catch (error) {
            if (isDisposed) return;
            console.error(`Readable Captions ${action} failed`, error);
            actionFeedback = { action, status: "error" };
        }
        renderPanel();
    })();
};
```

Make the four low-level copy/download handlers return `false` for guard/no-content and `true` after an actual helper call. Pass these wrappers to the main view and Note state:

```ts
const handleCopyAction = () => runAction("copy", handleCopy);
const handleDownloadAction = () => runAction("download", handleDownload);
const handleCopyNoteAction = () => runAction("copy", handleCopyNote);
const handleDownloadNoteAction = () => runAction("download", handleDownloadNote);
```

Pass `actionFeedback` in `PanelUiOptions`.

- [x] **Step 4: Run basic feedback GREEN**

```powershell
npm test -- tests/dom/panel/mount-action-feedback.test.ts
```

Expected: copy rejection, synchronous download throw, and both success messages pass.

- [x] **Step 5: Add failing stale-result and lifecycle cases**

Add:

```ts
function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

it("keeps the latest action result when an older copy finishes later", async () => {
    const pendingCopy = deferred<void>();
    mocks.copyTranscript.mockReturnValueOnce(pendingCopy.promise);
    const host = mountReadyPanel();
    action(host, "复制当前内容").click();
    action(host, "下载当前内容").click();
    await flushPromises();
    expect(host.shadowRoot?.textContent).toContain("已开始下载");

    pendingCopy.resolve();
    await flushPromises();
    expect(host.shadowRoot?.textContent).toContain("已开始下载");
    expect(host.shadowRoot?.textContent).not.toContain("已复制");
});

it("clears feedback after 2500 ms", async () => {
    vi.useFakeTimers();
    const host = mountReadyPanel();
    action(host, "复制当前内容").click();
    await flushPromises();
    expect(host.shadowRoot?.querySelector(".action-feedback")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2500);
    expect(host.shadowRoot?.querySelector(".action-feedback")).toBeNull();
});

it("invalidates a pending action on reset", async () => {
    const pendingCopy = deferred<void>();
    mocks.copyTranscript.mockReturnValueOnce(pendingCopy.promise);
    const host = mountReadyPanel();
    action(host, "复制当前内容").click();
    handles.at(-1)!.reset({ transcript: null, source: "none", status: "loading" });
    pendingCopy.resolve();
    await flushPromises();
    expect(host.shadowRoot?.querySelector(".action-feedback")).toBeNull();
});

it("does not render a pending action result after dispose", async () => {
    const pendingCopy = deferred<void>();
    mocks.copyTranscript.mockReturnValueOnce(pendingCopy.promise);
    const host = mountReadyPanel();
    action(host, "复制当前内容").click();
    handles.at(-1)!.dispose();
    pendingCopy.resolve();
    await flushPromises();
    expect(host.shadowRoot?.querySelector(".action-feedback")).toBeNull();
});
```

- [x] **Step 6: Run lifecycle cases and verify RED**

```powershell
npm test -- tests/dom/panel/mount-action-feedback.test.ts -t "latest|2500|reset|dispose"
```

Expected: older copy overwrites newer download, feedback never clears, and reset allows a pending completion. Dispose may already pass via `isDisposed` and records the existing suppression contract.

- [x] **Step 7: Add versioning and timer cleanup**

```ts
const ACTION_FEEDBACK_DURATION_MS = 2500;
let actionRequestVersion = 0;
let actionFeedbackTimer: ReturnType<typeof window.setTimeout> | null = null;

const clearActionFeedback = (invalidate = true): void => {
    if (invalidate) actionRequestVersion += 1;
    if (actionFeedbackTimer !== null) {
        window.clearTimeout(actionFeedbackTimer);
        actionFeedbackTimer = null;
    }
    actionFeedback = null;
};
```

`runAction()` captures `const requestVersion = ++actionRequestVersion`, clears the prior timer, and commits only when `!isDisposed && actionRequestVersion === requestVersion`. After rendering, schedule:

```ts
actionFeedbackTimer = window.setTimeout(() => {
    if (isDisposed || actionRequestVersion !== requestVersion) return;
    actionFeedbackTimer = null;
    actionFeedback = null;
    renderPanel();
}, ACTION_FEEDBACK_DURATION_MS);
```

Call `clearActionFeedback()` from `reset()` and `dispose()`.

- [x] **Step 8: Run GREEN checks and commit**

```powershell
npm test -- tests/dom/panel/mount-action-feedback.test.ts
npm test -- tests/dom/panel/mount.test.ts tests/dom/panel/mount-settings-readiness.test.ts
npm exec tsc -- --noEmit --pretty false
git add -- src/panel/mount.ts src/panel/panel-view.ts tests/dom/panel/mount-action-feedback.test.ts
git commit -m "fix: report panel export outcomes"
```

Expected: all action, lifecycle, readiness, and type checks pass.

---

### Task 4: Add explicit Panel control semantics

**Files:**
- Modify: `tests/dom/panel/mount.test.ts`
- Modify: `src/panel/panel-view.ts`

**Interfaces:**
- Preserves controlled collapse/menu/action state from Tasks 1 and 3.
- Produces a native collapse `button` with label-in-name and visible focus, explicit bilingual icon labels, More disclosure state, and decorative-SVG hiding.

- [x] **Step 1: Add failing semantic regressions**

Add to `tests/dom/panel/mount.test.ts`:

```ts
it("exposes the collapse control with label in name and expanded state", () => {
    const { host, handle } = mountReadyPanel();
    try {
        const control = host.shadowRoot?.querySelector<HTMLButtonElement>("button.title-area");
        expect(control).not.toBeNull();
        expect.soft(control?.getAttribute("aria-label"))
            .toBe("可读字幕 Readable Captions，收起面板");
        expect.soft(control?.getAttribute("title"))
            .toBe("可读字幕 Readable Captions，收起面板");
        expect(control?.getAttribute("aria-expanded")).toBe("true");
        control?.click();

        const collapsed = host.shadowRoot?.querySelector<HTMLButtonElement>("button.title-area");
        expect.soft(collapsed?.getAttribute("aria-label"))
            .toBe("可读字幕 Readable Captions，展开面板");
        expect.soft(collapsed?.getAttribute("title"))
            .toBe("可读字幕 Readable Captions，展开面板");
        expect(collapsed?.getAttribute("aria-expanded")).toBe("false");
    } finally {
        handle.dispose();
    }
});

it("labels icon buttons and exposes More disclosure state", () => {
    const { host, handle } = mountReadyPanel();
    try {
        const download = host.shadowRoot?.querySelector('button[aria-label="下载当前内容"]');
        const copy = host.shadowRoot?.querySelector('button[aria-label="复制当前内容"]');
        const more = host.shadowRoot?.querySelector<HTMLButtonElement>(
            'button[aria-label="更多"]',
        );
        expect.soft(download).not.toBeNull();
        expect.soft(copy).not.toBeNull();
        expect.soft(more?.getAttribute("aria-expanded")).toBe("false");
        expect.soft(more?.getAttribute("aria-controls")).toBe("rc-overflow-menu");
        expect([...host.shadowRoot!.querySelectorAll("button.icon-btn svg")]
            .every((svg) => svg.getAttribute("aria-hidden") === "true")).toBe(true);

        more?.click();
        const openMore = host.shadowRoot?.querySelector<HTMLButtonElement>(
            'button[aria-label="更多"]',
        );
        expect.soft(openMore?.getAttribute("aria-expanded")).toBe("true");
        expect(host.shadowRoot?.querySelector("#rc-overflow-menu")).not.toBeNull();
    } finally {
        handle.dispose();
    }
});

it("gives the Note close icon an explicit accessible name", () => {
    const { host, handle } = mountReadyPanel();
    try {
        clickAction(host, "更多");
        const note = [...host.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.overflow-item")]
            .find((button) => button.textContent?.includes("导出 Markdown Note"));
        note?.click();
        expect(host.shadowRoot?.querySelector('button[aria-label="关闭 Markdown Note"]'))
            .not.toBeNull();
    } finally {
        handle.dispose();
    }
});
```

The follow-up accessibility review also requires real-DOM English coverage after switching the UI language. Assert matching `title`/`aria-label` values of `Readable Captions, Collapse panel` and `Readable Captions, Expand panel`, plus the English download/copy/More/Note-close labels and More disclosure state. Add a mounted-style regression for `outline: 2px solid #0077a3`.

- [x] **Step 2: Run semantic tests and verify RED**

The original semantic RED was:

```powershell
npm test -- tests/dom/panel/mount.test.ts -t "named native button|labels icon|accessible name"
```

Expected: collapse is still a `div`; icon buttons lack explicit `aria-label`; More lacks expanded/controls/id; Note close lacks an explicit label.

The follow-up review RED was captured before its production correction:

```powershell
npm test -- tests/dom/panel/mount.test.ts -t "label in name|English|focus outline"
```

Expected: the action-only Chinese/English names omit the visible product label, and the old accent outline fails the sufficient-contrast contract.

- [x] **Step 3: Convert collapse to a native button**

Create:

```ts
const panelVisibleName = currentLang === "zh"
    ? "可读字幕 Readable Captions"
    : "Readable Captions";
const collapseAction = isCollapsed
    ? (currentLang === "zh" ? "展开面板" : "Expand panel")
    : (currentLang === "zh" ? "收起面板" : "Collapse panel");
const collapseLabel = currentLang === "zh"
    ? `${panelVisibleName}，${collapseAction}`
    : `${panelVisibleName}, ${collapseAction}`;
```

Render:

```ts
<button
    type="button"
    class="title-area"
    title=${collapseLabel}
    aria-label=${collapseLabel}
    aria-expanded=${String(!isCollapsed)}
    @click=${toggleCollapse}
>
    <span class="title">${currentLang === "zh" ? "可读字幕" : "Readable Captions"}</span>
    <span class="sub-title">${currentLang === "zh" ? "Readable Captions" : ""}</span>
</button>
```

Add these declarations to the existing `.title-area` rule without removing its flex/cursor styles:

```css
border: none;
padding: 0;
background: transparent;
color: inherit;
font: inherit;
text-align: left;
```

Add:

```css
.title-area:focus-visible {
    outline: 2px solid #0077a3;
    outline-offset: 2px;
    border-radius: 4px;
}
```

- [x] **Step 4: Label icon controls and bind More state**

For download, copy, More, and Note close:

- add `type="button"`;
- keep localized `title`;
- add the same localized `aria-label`;
- add `aria-hidden="true"` to the direct decorative SVG.

For More add:

```ts
aria-expanded=${String(isMenuOpen)}
aria-controls="rc-overflow-menu"
```

Give the conditional disclosure `id="rc-overflow-menu"`. Add `type="button"` to overflow action buttons, but do not add menu roles.

- [x] **Step 5: Run GREEN checks, incorporate follow-up review, and commit**

```powershell
npm test -- tests/dom/panel/mount.test.ts tests/dom/panel/mount-action-feedback.test.ts
npm exec tsc -- --noEmit --pretty false
git add -- src/panel/panel-view.ts tests/dom/panel/mount.test.ts
git commit -m "fix: expose panel control semantics"
```

After the label-in-name/contrast review correction, also run and commit:

```powershell
npm test -- tests/dom/panel/mount.test.ts -t "label in name|English|focus outline"
npm test -- tests/dom/panel/mount.test.ts tests/dom/panel/mount-action-feedback.test.ts
npm exec tsc -- --noEmit --pretty false
git add -- src/panel/panel-view.ts tests/dom/panel/mount.test.ts
git commit -m "fix: meet panel accessibility requirements"
```

Expected: Chinese and English naming, focus contrast, semantic, interaction, feedback, and type checks pass.

---

### Task 5: Update docs, verify, review, and update Draft PR #9

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/development.md`
- Modify: `docs/superpowers/plans/2026-07-14-panel-interaction-hardening.md`
- Build only: `dist/` (ignored; never stage)

**Interfaces:**
- Documents instance-owned presentation/action state and the non-gating layout boundary.
- Does not change settings schemas, runtime messages, or manifest permissions.

- [x] **Step 1: Correct Panel architecture ownership**

Replace the module-level collapse description with:

```markdown
- `isCollapsed`、`isMenuOpen`、`mode`、`uiLanguage`、生成状态、Note drawer 和导出反馈都属于每个 `mountPanel()` 实例。`updateData()`/host recovery 保留同一实例的折叠状态；`reset()` 和新的 dispose/remount session 从展开状态开始，任何实例都不能通过 module-level UI state 影响另一个实例。
- More 打开时只通过 `.panel.menu-open { overflow: visible }` 解除 Panel 自身裁剪，正文仍由 `.content` 滚动。该修复不承诺绕过 Bilibili 祖先的 overflow/stacking context，也不实现 viewport flip/clamp。
- copy/download 统一由 mount-owned action runner 捕获同步 throw 与 Promise rejection；UI 只显示固定本地化 success/error，2500 ms 后清除，reset/dispose 会使旧结果失效。export helper 必须在失败路径清理 fallback DOM 与 blob URL。
```

Update the `reset(next)` paragraph to include collapse and action-feedback reset.

- [x] **Step 2: Update developer regression guidance**

Add under “常见故障定位”:

```markdown
| 折叠一个 Panel 后，新视频或另一个 Panel 也被折叠 | `mountPanel()` 的 per-instance `isCollapsed`、reset 与 dispose/remount 边界 | `tests/dom/panel/mount.test.ts` |
| 折叠后 More 菜单不可见 | `.panel.menu-open` overflow escape；不要把 jsdom DOM 断言冒充真实布局 | `tests/dom/panel/mount.test.ts`；真实 Chrome/Bilibili 仍非门禁 |
| 复制/下载点击后无结果或失败泄漏临时 DOM/blob URL | mount-owned action version/timer、safe feedback、export helper `finally` cleanup | `tests/dom/panel/mount-action-feedback.test.ts`、`tests/unit/panel/export-utils.test.ts` |
```

Replace “修改 Panel UI” language that describes module-level collapse. Add non-gating smoke rows for collapsed More hit-testing and clipboard/download user activation; leave them unverified unless actually executed.

- [x] **Step 3: Run fresh complete verification**

```powershell
npm test
npm exec tsc -- --noEmit --pretty false
npm run build
git diff --check
git status --short
```

Expected:

- every Vitest suite passes;
- TypeScript and build exit 0;
- `dist/` contains `content.js`, `background.js`, `options.html`, `options.js`, and `manifest.json`;
- `git diff --check` prints nothing;
- status contains only intentional tracked files and no `dist/`.

- [x] **Step 4: Mark completed checkboxes and commit docs**

Only after observing each RED/GREEN command, change its corresponding `- [ ]` to `- [x]`.

```powershell
git add -- docs/architecture.md docs/development.md docs/superpowers/plans/2026-07-14-panel-interaction-hardening.md
git commit -m "docs: document panel interaction safeguards"
```

- [x] **Step 5: Request independent whole-diff review**

Review `b3de365..HEAD` for:

- collapse ownership across reset, update, dispose/remount, and concurrent Panels;
- menu-open overflow behavior and external-ancestor/viewport limitations;
- synchronous/asynchronous action capture and safe UI strings;
- action version/timer cleanup on newer action, reset, and dispose;
- export cleanup when `execCommand` or anchor `click` throws;
- explicit names/expanded state/native collapse button, without incomplete menu/tab roles;
- genuine RED evidence before each production change.

Fix every Critical/Important finding with a focused RED→GREEN cycle and rerun Step 3 after production changes.

The whole-diff review found one per-instance outside-pointer identity gap. Commit `f503540` added a two-Panel/page-decoy RED→GREEN regression, switched the document listener from shared-class matching to this Shadow Root's wrapper identity, updated the manual-smoke contract, and passed re-review with no remaining Critical or Important findings.

- [x] **Step 6: Push and refresh Draft PR #9**

```powershell
git status --short --branch
git log --oneline origin/fix/chrome-frontend-runtime..HEAD
git push origin fix/chrome-frontend-runtime
```

Update the PR body with the four defects, exact automated results, explicit non-gating unverified Chrome/Bilibili/provider status, and the residual external ancestor/viewport layout limitation. Do not mark ready until no Critical/Important review finding remains.

The verified branch was pushed and Draft PR #9 was refreshed with the final 233/233 result, build artifacts, review verdict, tradeoffs, and explicit non-gating smoke limitations. The PR remains Draft and stacked on PR #8; GitHub reports the current stack as mergeable/clean.
