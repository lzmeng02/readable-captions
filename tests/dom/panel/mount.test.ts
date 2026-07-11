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

        expect.soft(host.shadowRoot?.textContent).toContain("generation failed");
        expect.soft(mocks.copyMarkdownText).not.toHaveBeenCalled();
        expect.soft(downloadedFilename).toBe("");
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
