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

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

beforeEach(() => {
    document.body.replaceChildren();
    mocks.generationOptions.length = 0;
    vi.clearAllMocks();
});

afterEach(() => {
    for (const handle of handles.splice(0)) handle.dispose();
    vi.useRealTimers();
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

    it("clears feedback after exactly 2500 ms", async () => {
        vi.useFakeTimers();
        const host = mountReadyPanel();
        action(host, "复制当前内容").click();
        await flushPromises();
        expect(host.shadowRoot?.querySelector(".action-feedback")).not.toBeNull();

        await vi.advanceTimersByTimeAsync(2499);
        expect(host.shadowRoot?.querySelector(".action-feedback")).not.toBeNull();

        await vi.advanceTimersByTimeAsync(1);
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

    it("does not claim success when there is no exportable content", async () => {
        const host = mountReadyPanel();
        action(host, "复制当前内容").click();
        await flushPromises();
        expect(host.shadowRoot?.querySelector(".action-feedback")).not.toBeNull();

        handles.at(-1)!.updateData({
            transcript: null,
            source: "none",
            status: "ready",
        });

        action(host, "下载当前内容").click();
        await flushPromises();

        expect.soft(mocks.copyTranscript).toHaveBeenCalledTimes(1);
        expect.soft(mocks.downloadTranscript).not.toHaveBeenCalled();
        expect(host.shadowRoot?.querySelector(".action-feedback")).toBeNull();
    });
});
