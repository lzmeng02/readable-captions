// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountPanel } from "../../../src/panel/mount";
import type { PanelHandle } from "../../../src/panel/types";

type GenerationCallbacks = {
    request: { task: "overview" | "intensive" | "note" };
    onToken(text: string): void;
    onDone(text: string): void;
    onError(error: Error): void;
};

const mocks = vi.hoisted(() => ({
    defaultTab: "original" as "original" | "intensive" | "overview",
    generationOptions: [] as GenerationCallbacks[],
    litRender: vi.fn(),
    stopSettings: vi.fn(),
}));

vi.mock("lit", async (importOriginal) => {
    const actual = await importOriginal<typeof import("lit")>();
    return {
        ...actual,
        render: (...args: Parameters<typeof actual.render>) => {
            mocks.litRender(...args);
            return actual.render(...args);
        },
    };
});

vi.mock("../../../src/settings/public-client", async () => {
    const { DEFAULT_PUBLIC_SETTINGS } = await import("../../../src/settings/public");
    return {
        watchPublicSettings(listener: (settings: typeof DEFAULT_PUBLIC_SETTINGS) => void) {
            listener({ ...DEFAULT_PUBLIC_SETTINGS, defaultTab: mocks.defaultTab });
            return mocks.stopSettings;
        },
    };
});

vi.mock("../../../src/generation/llm-provider", () => ({
    streamGeneration: vi.fn((options: GenerationCallbacks) => {
        mocks.generationOptions.push(options);
        return new AbortController();
    }),
}));

const litRenderSpy = mocks.litRender;
const mountedHandles: PanelHandle[] = [];
let nextFrameId = 1;
const frameCallbacks = new Map<number, FrameRequestCallback>();

type MountedGeneration = {
    host: HTMLElement;
    handle: PanelHandle;
    generation: GenerationCallbacks;
};

function runAnimationFrame(): void {
    const pending = [...frameCallbacks.values()];
    frameCallbacks.clear();
    for (const callback of pending) callback(0);
}

function mountGeneratedPanel(task: "overview" | "intensive"): MountedGeneration {
    mocks.defaultTab = task;
    const host = document.createElement("section");
    document.body.append(host);
    const handle = mountPanel(host, {
        transcript: [{ from: 0, to: 1, content: "ready" }],
        source: "human_view",
        status: "ready",
    });
    mountedHandles.push(handle);

    const generation = mocks.generationOptions.find((options) => options.request.task === task);
    if (!generation) throw new Error(`Missing ${task} generation callbacks`);
    return { host, handle, generation };
}

function clickTab(host: HTMLElement, tabIndex: 0 | 1 | 2): void {
    const button = host.shadowRoot?.querySelectorAll<HTMLButtonElement>("button.tab")[tabIndex];
    if (!button) throw new Error(`Missing tab ${tabIndex}`);
    button.click();
}

function openNote(host: HTMLElement): GenerationCallbacks {
    const moreButton = host.shadowRoot
        ?.querySelector<HTMLButtonElement>(".more-actions-wrapper > button");
    if (!moreButton) throw new Error("Missing More button");
    moreButton.click();

    const noteButton = host.shadowRoot?.querySelector<HTMLButtonElement>("button.overflow-item");
    if (!noteButton) throw new Error("Missing note action");
    noteButton.click();

    const generation = mocks.generationOptions.find((options) => options.request.task === "note");
    if (!generation) throw new Error("Missing note generation callbacks");
    return generation;
}

beforeEach(() => {
    document.body.replaceChildren();
    mocks.defaultTab = "original";
    mocks.generationOptions.length = 0;
    frameCallbacks.clear();
    nextFrameId = 1;
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        frameCallbacks.set(id, callback);
        return id;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => {
        frameCallbacks.delete(id);
    }));
});

afterEach(() => {
    for (const handle of mountedHandles.splice(0)) handle.dispose();
});

describe("mountPanel generation rendering", () => {
    it("renders multiple visible tokens once on the next frame", () => {
        const { generation } = mountGeneratedPanel("overview");
        const baseline = litRenderSpy.mock.calls.length;
        generation.onToken("a");
        generation.onToken("ab");
        expect(litRenderSpy).toHaveBeenCalledTimes(baseline);
        runAnimationFrame();
        expect(litRenderSpy).toHaveBeenCalledTimes(baseline + 1);
    });

    it("does not render hidden task tokens", () => {
        const { host, generation } = mountGeneratedPanel("overview");
        clickTab(host, 0);
        const baseline = litRenderSpy.mock.calls.length;
        generation.onToken("hidden");
        runAnimationFrame();
        expect(litRenderSpy).toHaveBeenCalledTimes(baseline);

        clickTab(host, 2);
        expect(host.shadowRoot?.textContent).toContain("hidden");
    });

    it("flushes a visible completion and leaves no queued frame", () => {
        const { generation } = mountGeneratedPanel("overview");
        const baseline = litRenderSpy.mock.calls.length;
        generation.onToken("partial");
        generation.onDone("complete");

        expect(litRenderSpy).toHaveBeenCalledTimes(baseline + 1);
        expect(frameCallbacks.size).toBe(0);
        runAnimationFrame();
        expect(litRenderSpy).toHaveBeenCalledTimes(baseline + 1);
    });

    it("flushes a visible error and leaves no queued frame", () => {
        const { generation } = mountGeneratedPanel("overview");
        const baseline = litRenderSpy.mock.calls.length;
        generation.onToken("partial");
        generation.onError(new Error("generation failed"));

        expect(litRenderSpy).toHaveBeenCalledTimes(baseline + 1);
        expect(frameCallbacks.size).toBe(0);
        runAnimationFrame();
        expect(litRenderSpy).toHaveBeenCalledTimes(baseline + 1);
    });

    it("does not render a hidden completion", () => {
        const { host, generation } = mountGeneratedPanel("overview");
        clickTab(host, 0);
        const baseline = litRenderSpy.mock.calls.length;

        generation.onDone("hidden complete");
        runAnimationFrame();

        expect(litRenderSpy).toHaveBeenCalledTimes(baseline);
    });

    it("does not render a hidden error", () => {
        const { host, generation } = mountGeneratedPanel("overview");
        clickTab(host, 0);
        const baseline = litRenderSpy.mock.calls.length;

        generation.onError(new Error("hidden failure"));
        runAnimationFrame();

        expect(litRenderSpy).toHaveBeenCalledTimes(baseline);
    });

    it("cancels a pending frame when reset renders fresh state", () => {
        const { handle, generation } = mountGeneratedPanel("overview");
        generation.onToken("queued");
        expect(frameCallbacks.size).toBe(1);

        handle.reset({ transcript: null, source: "none", status: "loading" });
        const afterReset = litRenderSpy.mock.calls.length;

        expect(frameCallbacks.size).toBe(0);
        runAnimationFrame();
        expect(litRenderSpy).toHaveBeenCalledTimes(afterReset);
    });

    it("cancels a pending frame when disposed", () => {
        const { handle, generation } = mountGeneratedPanel("overview");
        const baseline = litRenderSpy.mock.calls.length;
        generation.onToken("queued");
        expect(frameCallbacks.size).toBe(1);

        handle.dispose();

        expect(frameCallbacks.size).toBe(0);
        runAnimationFrame();
        expect(litRenderSpy).toHaveBeenCalledTimes(baseline);
    });

    it("treats the note drawer as visible instead of its underlying tab", () => {
        const { host, generation: overview } = mountGeneratedPanel("overview");
        const note = openNote(host);
        const baseline = litRenderSpy.mock.calls.length;

        overview.onToken("hidden overview");
        expect(frameCallbacks.size).toBe(0);
        expect(litRenderSpy).toHaveBeenCalledTimes(baseline);

        note.onToken("visible note");
        expect(litRenderSpy).toHaveBeenCalledTimes(baseline);
        runAnimationFrame();
        expect(litRenderSpy).toHaveBeenCalledTimes(baseline + 1);
    });

    it("cancels a pending generation frame before an immediate tab render", () => {
        const { host, generation } = mountGeneratedPanel("overview");
        generation.onToken("queued");
        expect(frameCallbacks.size).toBe(1);

        clickTab(host, 0);
        const afterTabRender = litRenderSpy.mock.calls.length;

        expect(frameCallbacks.size).toBe(0);
        runAnimationFrame();
        expect(litRenderSpy).toHaveBeenCalledTimes(afterTabRender);
    });
});
