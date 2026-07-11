// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamGeneration } from "../../../src/generation/llm-provider";
import { mountPanel } from "../../../src/panel/mount";
import type { PanelHandle } from "../../../src/panel/types";

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

    it("keeps Overview copy bound to generated Markdown export", async () => {
        const { host } = mountReadyPanel();
        clickTab(host, "overview");
        mocks.generationOptions.at(-1)!.onDone("# overview");
        clickAction(host, "复制当前内容");
        await Promise.resolve();
        expect(mocks.copyMarkdownText).toHaveBeenCalledWith("# overview");
    });
});
