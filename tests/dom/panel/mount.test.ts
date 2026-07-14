// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamGeneration } from "../../../src/generation/llm-provider";
import { mountPanel } from "../../../src/panel/mount";
import type { PanelCallbacks, PanelData, PanelHandle } from "../../../src/panel/types";

const mocks = vi.hoisted(() => ({
    stopSettings: vi.fn(),
    controllers: [] as AbortController[],
    generationOptions: [] as Array<{
        onToken(text: string): void;
        onDone(text: string): void;
        onError(error: Error): void;
    }>,
    copyTranscript: vi.fn(async () => undefined),
    copyMarkdownText: vi.fn(async () => undefined),
    fetchSubtitleBody: vi.fn(),
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
    streamGeneration: vi.fn((options: {
        onToken(text: string): void;
        onDone(text: string): void;
        onError(error: Error): void;
    }) => {
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

vi.mock("../../../src/platforms/bilibili/api", () => ({
    fetchBilibiliSubtitleBody: mocks.fetchSubtitleBody,
}));

const subtitleUrls = {
    a: "https://subtitle.example/a.json",
    b: "https://subtitle.example/b.json",
    c: "https://subtitle.example/c.json",
};

const availableSubtitles = [
    { lan_doc: "A", subtitle_url: subtitleUrls.a },
    { lan_doc: "B", subtitle_url: subtitleUrls.b },
    { lan_doc: "C", subtitle_url: subtitleUrls.c },
];

function deferred<T>(): {
    promise: Promise<T>;
    resolve(value: T): void;
    reject(reason: unknown): void;
} {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function deferredSubtitle(url: string) {
    const request = deferred<{ subtitleUrl: string; body: unknown }>();
    return {
        ...request,
        resolveTranscript(content: string): void {
            request.resolve({
                subtitleUrl: url,
                body: [{ from: 0, to: 1, content }],
            });
        },
    };
}

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

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

function moreMenu(host: HTMLElement): HTMLElement | null {
    return host.shadowRoot?.querySelector<HTMLElement>(".overflow-menu") ?? null;
}

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

function mountMultilingualPanel(
    callbacks: PanelCallbacks = {},
    subtitleUrl = subtitleUrls.a,
): { host: HTMLElement; handle: PanelHandle; initialData: PanelData } {
    const host = document.createElement("section");
    document.body.append(host);
    const initialData: PanelData = {
        transcript: [{ from: 0, to: 1, content: "A transcript" }],
        source: "human_view",
        status: "ready",
        subtitleUrl,
        availableSubtitles,
        aid: 7,
        cid: 11,
    };
    const handle = mountPanel(host, initialData, callbacks);
    return { host, handle, initialData };
}

function changeLanguage(host: HTMLElement, subtitleUrl: string): void {
    const select = host.shadowRoot?.querySelector<HTMLSelectElement>("select.lang-select");
    if (!select) throw new Error("Missing language select");
    select.value = subtitleUrl;
    select.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function selectedLanguage(host: HTMLElement): string {
    return host.shadowRoot?.querySelector<HTMLSelectElement>("select.lang-select")?.value ?? "";
}

function originalTranscriptText(host: HTMLElement): string {
    return [...host.shadowRoot?.querySelectorAll<HTMLElement>(".list .c") ?? []]
        .map((line) => line.textContent ?? "")
        .join("\n");
}

beforeEach(() => {
    document.body.replaceChildren();
    document.title = "";
    mocks.controllers.length = 0;
    mocks.generationOptions.length = 0;
    vi.clearAllMocks();
    mocks.fetchSubtitleBody.mockReset();
});

describe("mountPanel lifecycle", () => {
    it("renders loading data instead of the ready empty state", () => {
        const host = document.createElement("section");
        document.body.append(host);
        mountPanel(host, { transcript: null, source: "none", status: "loading" });

        expect(host.shadowRoot?.textContent).toContain("正在加载字幕...");
        expect(host.shadowRoot?.textContent).not.toContain("当前视频没有可用字幕");
    });

    it("renders an error message instead of the ready empty state", () => {
        const host = document.createElement("section");
        document.body.append(host);
        mountPanel(host, {
            transcript: null,
            source: "none",
            status: "error",
            errorMessage: "network failed",
        });

        expect(host.shadowRoot?.textContent).toContain("network failed");
        expect(host.shadowRoot?.textContent).not.toContain("当前视频没有可用字幕");
    });

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

    it("reset closes an open More menu", () => {
        const { host, handle } = mountReadyPanel();

        try {
            clickAction(host, "更多");
            expect(moreMenu(host)).not.toBeNull();

            handle.reset({ transcript: null, source: "none", status: "loading" });

            expect(moreMenu(host)).toBeNull();
        } finally {
            handle.dispose();
        }
    });

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

    it("returns before reading the pointer path while the More menu is closed", () => {
        const { host, handle } = mountReadyPanel();
        const pointerDown = new Event("pointerdown", { bubbles: true, composed: true });
        const composedPath = vi.spyOn(pointerDown, "composedPath").mockImplementation(() => {
            throw new Error("closed More menu must not read the pointer path");
        });

        try {
            expect(moreMenu(host)).toBeNull();

            document.body.dispatchEvent(pointerDown);

            expect(composedPath).not.toHaveBeenCalled();
            expect(moreMenu(host)).toBeNull();
        } finally {
            handle.dispose();
        }
    });

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
                .find((button) => button.textContent?.includes("语言"));
            if (!language) throw new Error("Missing language action");

            language.click();

            expect(moreMenu(host)).toBeNull();
        } finally {
            handle.dispose();
        }
    });

    it("keeps More-menu state isolated between mounted panels", () => {
        const first = mountReadyPanel();
        const second = mountReadyPanel();

        try {
            clickAction(first.host, "更多");
            expect(moreMenu(first.host)).not.toBeNull();

            second.handle.updateData({
                transcript: [{ from: 0, to: 1, content: "second panel" }],
                source: "human_view",
                status: "ready",
            });

            expect(moreMenu(second.host)).toBeNull();
        } finally {
            first.handle.dispose();
            second.handle.dispose();
        }
    });

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

    it("localizes control accessibility in English", () => {
        const { host, handle } = mountReadyPanel();
        try {
            clickAction(host, "更多");
            const language = [...host.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.overflow-item")]
                .find((button) => button.textContent?.includes("语言：中文"));
            if (!language) throw new Error("Missing language action");
            language.click();

            const download = host.shadowRoot?.querySelector<HTMLButtonElement>(
                'button[aria-label="Download current content"]',
            );
            const copy = host.shadowRoot?.querySelector<HTMLButtonElement>(
                'button[aria-label="Copy current content"]',
            );
            const more = host.shadowRoot?.querySelector<HTMLButtonElement>(
                'button[aria-label="More"]',
            );
            expect.soft(download?.getAttribute("title")).toBe("Download current content");
            expect.soft(copy?.getAttribute("title")).toBe("Copy current content");
            expect.soft(more?.getAttribute("title")).toBe("More");
            expect.soft(more?.getAttribute("aria-expanded")).toBe("false");
            expect.soft(more?.getAttribute("aria-controls")).toBe("rc-overflow-menu");

            more?.click();
            const openMore = host.shadowRoot?.querySelector<HTMLButtonElement>(
                'button[aria-label="More"]',
            );
            expect.soft(openMore?.getAttribute("aria-expanded")).toBe("true");
            expect(host.shadowRoot?.querySelector("#rc-overflow-menu")).not.toBeNull();
            openMore?.click();

            const control = host.shadowRoot?.querySelector<HTMLButtonElement>("button.title-area");
            expect.soft(control?.getAttribute("aria-label"))
                .toBe("Readable Captions, Collapse panel");
            expect.soft(control?.getAttribute("title"))
                .toBe("Readable Captions, Collapse panel");
            expect(control?.getAttribute("aria-expanded")).toBe("true");
            control?.click();

            const collapsed = host.shadowRoot?.querySelector<HTMLButtonElement>("button.title-area");
            expect.soft(collapsed?.getAttribute("aria-label"))
                .toBe("Readable Captions, Expand panel");
            expect.soft(collapsed?.getAttribute("title"))
                .toBe("Readable Captions, Expand panel");
            expect(collapsed?.getAttribute("aria-expanded")).toBe("false");
            collapsed?.click();

            clickAction(host, "More");
            const note = [...host.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.overflow-item")]
                .find((button) => button.textContent?.includes("Export Markdown Note"));
            if (!note) throw new Error("Missing Note action");
            note.click();
            const close = host.shadowRoot?.querySelector<HTMLButtonElement>(
                'button[aria-label="Close Markdown Note"]',
            );
            expect.soft(close?.getAttribute("title")).toBe("Close Markdown Note");
            expect(close?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
        } finally {
            handle.dispose();
        }
    });

    it("uses the sufficient-contrast collapse focus outline", () => {
        const { host, handle } = mountReadyPanel();
        try {
            expect(host.shadowRoot?.querySelector("style[data-rc]")?.textContent)
                .toMatch(/\.title-area:focus-visible\s*\{[^}]*outline:\s*2px solid #0077a3/s);
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
            const close = host.shadowRoot?.querySelector<HTMLButtonElement>(
                'button[aria-label="关闭 Markdown Note"]',
            );
            expect(close).not.toBeNull();
            expect(close?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
        } finally {
            handle.dispose();
        }
    });

    it("ignores stale generation callbacks after reset", async () => {
        const { host, handle } = mountReadyPanel();
        clickTab(host, "overview");
        const staleGeneration = mocks.generationOptions.at(-1)!;

        handle.reset({ transcript: null, source: "none", status: "loading" });
        staleGeneration.onToken("stale token");
        staleGeneration.onDone("# stale overview");
        staleGeneration.onError(new Error("stale error"));

        clickTab(host, "overview");
        clickAction(host, "复制当前内容");
        await Promise.resolve();
        handle.updateData({
            transcript: [{ from: 0, to: 1, content: "fresh" }],
            source: "human_view",
            status: "ready",
        });

        expect.soft(mocks.copyMarkdownText).not.toHaveBeenCalled();
        expect(streamGeneration).toHaveBeenCalledTimes(2);
    });

    it("dispose is idempotent and removes listeners once", () => {
        const removeSpy = vi.spyOn(document, "removeEventListener");
        const { handle } = mountReadyPanel();
        handle.dispose();
        handle.dispose();
        expect(mocks.stopSettings).toHaveBeenCalledTimes(1);
        expect(removeSpy).toHaveBeenCalledTimes(1);
    });

    it("disposes the previous handle when the same host is mounted again", () => {
        const host = document.createElement("section");
        document.body.append(host);
        const first = mountPanel(host, { transcript: null, source: "none", status: "loading" });
        const second = mountPanel(host, { transcript: null, source: "none", status: "loading" });

        expect(mocks.stopSettings).toHaveBeenCalledTimes(1);
        first.dispose();
        expect(mocks.stopSettings).toHaveBeenCalledTimes(1);

        second.dispose();
    });

    it("keeps Original copy bound to transcript export", async () => {
        const { host } = mountReadyPanel();
        clickAction(host, "复制当前内容");
        await Promise.resolve();
        expect(mocks.copyTranscript).toHaveBeenCalledTimes(1);
        expect(mocks.copyMarkdownText).not.toHaveBeenCalled();
    });

    it("preserves legal hyphens in Original download filenames", () => {
        document.title = "GPT-5 教程_哔哩哔哩_bilibili";
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
        vi.spyOn(window, "setTimeout").mockImplementation(() => 0);
        let downloadedFilename = "";
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
            downloadedFilename = this.download;
        });
        const { host } = mountReadyPanel();

        clickAction(host, "下载当前内容");

        expect(downloadedFilename).toBe("GPT-5 教程.txt");
    });

    it("keeps Overview copy bound to generated Markdown export", async () => {
        const { host } = mountReadyPanel();
        clickTab(host, "overview");
        mocks.generationOptions.at(-1)!.onDone("# overview");
        clickAction(host, "复制当前内容");
        await Promise.resolve();
        expect(mocks.copyMarkdownText).toHaveBeenCalledWith("# overview");
    });

    it("does not export partial generated text after a terminal error", async () => {
        document.title = "Failed generation_哔哩哔哩_bilibili";
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
        vi.spyOn(window, "setTimeout").mockImplementation(() => 0);
        let downloadedFilename = "";
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
            downloadedFilename = this.download;
        });
        const { host } = mountReadyPanel();
        clickTab(host, "overview");
        const generation = mocks.generationOptions.at(-1)!;
        generation.onToken("# partial output");
        generation.onError(new Error("generation failed"));

        clickAction(host, "复制当前内容");
        clickAction(host, "下载当前内容");
        await Promise.resolve();

        expect.soft(host.shadowRoot?.textContent).toContain("Generation failed. Please try again.");
        expect.soft(mocks.copyMarkdownText).not.toHaveBeenCalled();
        expect.soft(downloadedFilename).toBe("");
    });

    it("does not render arbitrary generation dependency details", () => {
        const leakMarker = "oa-test-key";
        const { host } = mountReadyPanel();
        clickTab(host, "overview");

        mocks.generationOptions.at(-1)!.onError(new Error(`provider failure ${leakMarker}`));

        expect.soft(host.shadowRoot?.textContent).toContain("Generation failed. Please try again.");
        expect(host.shadowRoot?.textContent).not.toContain(leakMarker);
    });
});

describe("mountPanel subtitle language changes", () => {
    it("shows a committed non-first language on the initial render", () => {
        const { host } = mountMultilingualPanel({}, subtitleUrls.c);

        expect(selectedLanguage(host)).toBe(subtitleUrls.c);
    });

    it("commits only the latest language request and aborts the superseded request", async () => {
        const b = deferredSubtitle(subtitleUrls.b);
        const c = deferredSubtitle(subtitleUrls.c);
        const requests = new Map([
            [subtitleUrls.b, b.promise],
            [subtitleUrls.c, c.promise],
        ]);
        mocks.fetchSubtitleBody.mockImplementation((url: string) => requests.get(url));
        const onTranscriptChange = vi.fn();
        const { host } = mountMultilingualPanel({ onTranscriptChange });

        changeLanguage(host, subtitleUrls.b);
        const bSignal = mocks.fetchSubtitleBody.mock.calls[0]?.[1] as AbortSignal | undefined;
        changeLanguage(host, subtitleUrls.c);

        expect(bSignal?.aborted).toBe(true);
        c.resolveTranscript("C transcript");
        await flushPromises();
        b.resolveTranscript("B transcript");
        await flushPromises();

        expect(selectedLanguage(host)).toBe(subtitleUrls.c);
        expect(originalTranscriptText(host)).toContain("C transcript");
        expect(originalTranscriptText(host)).not.toContain("B transcript");
        expect(onTranscriptChange).toHaveBeenCalledTimes(1);
        expect(onTranscriptChange).toHaveBeenCalledWith({
            transcript: [{ from: 0, to: 1, content: "C transcript" }],
            source: "human_view",
            subtitleUrl: subtitleUrls.c,
            availableSubtitles,
            aid: 7,
            cid: 11,
        });
    });

    it("ignores a stale language failure after the latest request commits", async () => {
        const b = deferredSubtitle(subtitleUrls.b);
        const c = deferredSubtitle(subtitleUrls.c);
        const requests = new Map([
            [subtitleUrls.b, b.promise],
            [subtitleUrls.c, c.promise],
        ]);
        mocks.fetchSubtitleBody.mockImplementation((url: string) => requests.get(url));
        const onTranscriptChange = vi.fn();
        const { host } = mountMultilingualPanel({ onTranscriptChange });

        changeLanguage(host, subtitleUrls.b);
        changeLanguage(host, subtitleUrls.c);
        c.resolveTranscript("C transcript");
        await flushPromises();
        b.reject(new Error("stale subtitle failure"));
        await flushPromises();

        expect(selectedLanguage(host)).toBe(subtitleUrls.c);
        expect(originalTranscriptText(host)).toContain("C transcript");
        expect(host.shadowRoot?.textContent).not.toContain("stale subtitle failure");
        expect(onTranscriptChange).toHaveBeenCalledTimes(1);
    });

    it("rolls back the controlled selector and transcript when switching fails", async () => {
        mocks.fetchSubtitleBody.mockRejectedValueOnce(new Error("subtitle unavailable"));
        const onTranscriptChange = vi.fn();
        const { host } = mountMultilingualPanel({ onTranscriptChange });

        changeLanguage(host, subtitleUrls.b);
        expect(selectedLanguage(host)).toBe(subtitleUrls.b);
        await flushPromises();

        expect(selectedLanguage(host)).toBe(subtitleUrls.a);
        expect(originalTranscriptText(host)).toContain("A transcript");
        expect(host.shadowRoot?.textContent).toContain("subtitle unavailable");
        expect(onTranscriptChange).not.toHaveBeenCalled();
    });

    it("does not commit a language response after dispose", async () => {
        const b = deferredSubtitle(subtitleUrls.b);
        mocks.fetchSubtitleBody.mockReturnValueOnce(b.promise);
        const onTranscriptChange = vi.fn();
        const { host, handle } = mountMultilingualPanel({ onTranscriptChange });

        changeLanguage(host, subtitleUrls.b);
        const signal = mocks.fetchSubtitleBody.mock.calls[0]?.[1] as AbortSignal | undefined;
        handle.dispose();
        b.resolveTranscript("B transcript");
        await flushPromises();

        expect(signal?.aborted).toBe(true);
        expect(onTranscriptChange).not.toHaveBeenCalled();
    });

    it("invalidates a pending language response when reset starts a new video", async () => {
        const b = deferredSubtitle(subtitleUrls.b);
        mocks.fetchSubtitleBody.mockReturnValueOnce(b.promise);
        const onTranscriptChange = vi.fn();
        const { host, handle } = mountMultilingualPanel({ onTranscriptChange });

        changeLanguage(host, subtitleUrls.b);
        const signal = mocks.fetchSubtitleBody.mock.calls[0]?.[1] as AbortSignal | undefined;
        handle.reset({
            transcript: [{ from: 2, to: 3, content: "New video transcript" }],
            source: "human_view",
            status: "ready",
            subtitleUrl: subtitleUrls.c,
            availableSubtitles,
            aid: 8,
            cid: 12,
        });
        b.resolveTranscript("Stale transcript");
        await flushPromises();

        expect(signal?.aborted).toBe(true);
        expect(selectedLanguage(host)).toBe(subtitleUrls.c);
        expect(originalTranscriptText(host)).toContain("New video transcript");
        expect(originalTranscriptText(host)).not.toContain("Stale transcript");
        expect(onTranscriptChange).not.toHaveBeenCalled();
    });

    it("keeps committed data and reports an invalid subtitle body as a switch error", async () => {
        mocks.fetchSubtitleBody.mockResolvedValueOnce({
            subtitleUrl: subtitleUrls.b,
            body: [{ from: "invalid", to: 1, content: "broken" }],
        });
        const onTranscriptChange = vi.fn();
        const { host } = mountMultilingualPanel({ onTranscriptChange });

        changeLanguage(host, subtitleUrls.b);
        await flushPromises();

        expect(selectedLanguage(host)).toBe(subtitleUrls.a);
        expect(originalTranscriptText(host)).toContain("A transcript");
        expect(host.shadowRoot?.textContent).toContain("Invalid subtitle body");
        expect(onTranscriptChange).not.toHaveBeenCalled();
    });

    it("keeps committed panel state when the selected subtitle body is empty", async () => {
        mocks.fetchSubtitleBody.mockResolvedValueOnce({
            subtitleUrl: subtitleUrls.b,
            body: [],
        });
        const onTranscriptChange = vi.fn();
        const { host } = mountMultilingualPanel({ onTranscriptChange });
        clickTab(host, "overview");
        mocks.generationOptions.at(-1)!.onDone("# committed overview");
        clickTab(host, "original");

        changeLanguage(host, subtitleUrls.b);
        await flushPromises();

        clickTab(host, "overview");
        clickAction(host, "复制当前内容");
        await Promise.resolve();
        expect.soft(mocks.copyMarkdownText).toHaveBeenCalledWith("# committed overview");
        clickTab(host, "original");
        expect.soft(selectedLanguage(host)).toBe(subtitleUrls.a);
        expect.soft(originalTranscriptText(host)).toContain("A transcript");
        expect.soft(host.shadowRoot?.textContent).toContain("Invalid subtitle body");
        expect(onTranscriptChange).not.toHaveBeenCalled();
    });
});
