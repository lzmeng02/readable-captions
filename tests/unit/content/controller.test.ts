// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createContentController,
    type ContentControllerDeps,
} from "../../../src/content/controller";
import { waitForElm } from "../../../src/content/dom";
import type { PanelCallbacks, PanelData, PanelHandle } from "../../../src/panel/types";
import { bilibiliAdapter } from "../../../src/platforms/bilibili/adapter";
import { getBilibiliRouteKey, getBiliPart } from "../../../src/platforms/bilibili/api";
import { getPlatformRouteKey, getTranscriptForUrl } from "../../../src/platforms";
import type { PlatformTranscriptResult } from "../../../src/platforms/types";

const videoUrl = "https://www.bilibili.com/video/BV1abc?p=1";
const readyResult: PlatformTranscriptResult = {
    transcript: [{ from: 0, to: 1, content: "ready" }],
    source: "human_view",
};

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

function createPanelHandle(): PanelHandle {
    return {
        updateData: vi.fn(),
        reset: vi.fn(),
        dispose: vi.fn(),
    };
}

function createDeps(options: {
    routeKey?: string | null;
    routeKeyForUrl?(url: string): string | null;
    loadError?: Error;
    loadResult?: PlatformTranscriptResult;
    loadTranscript?(url: string, signal: AbortSignal): Promise<PlatformTranscriptResult>;
} = {}) {
    let attached = false;
    const loadedSignals: AbortSignal[] = [];
    const panelHandles: PanelHandle[] = [];
    const panelCallbacks: PanelCallbacks[] = [];
    const stopObservers: Array<ReturnType<typeof vi.fn>> = [];

    const host = {
        remove: vi.fn(() => {
            attached = false;
        }),
    } as unknown as HTMLElement;
    const anchor = {
        contains: vi.fn((candidate: Node) => candidate === host && attached),
        prepend: vi.fn((candidate: Node) => {
            if (candidate === host) attached = true;
        }),
    } as unknown as Element;

    const supportedKey = options.routeKey === undefined
        ? "bilibili:BV1abc:p=1"
        : options.routeKey;
    const routeKeyForUrl = vi.fn(options.routeKeyForUrl ?? ((url: string) => (
        url.includes("/video/") ? supportedKey : null
    )));
    const waitForAnchor = vi.fn(async (_signal: AbortSignal) => anchor);
    const getAnchor = vi.fn(() => anchor);
    const ensureHost = vi.fn((_anchor: Element) => {
        attached = true;
        return host;
    });
    const loadTranscript = vi.fn(async (url: string, signal: AbortSignal) => {
        loadedSignals.push(signal);
        if (options.loadTranscript) return options.loadTranscript(url, signal);
        if (options.loadError) throw options.loadError;
        return options.loadResult ?? readyResult;
    });
    const mountPanel = vi.fn((_host: HTMLElement, _data: PanelData, callbacks: PanelCallbacks) => {
        const handle = createPanelHandle();
        panelHandles.push(handle);
        panelCallbacks.push(callbacks);
        return handle;
    });
    const observeDom = vi.fn((_listener: () => void) => {
        const stop = vi.fn();
        stopObservers.push(stop);
        return stop;
    });

    const deps = {
        routeKeyForUrl,
        waitForAnchor,
        getAnchor,
        ensureHost,
        loadTranscript,
        mountPanel,
        observeDom,
    } satisfies ContentControllerDeps;

    return {
        ...deps,
        anchor,
        host,
        loadedSignals,
        panelHandles,
        panelCallbacks,
        stopObservers,
        detachHost(): void {
            attached = false;
        },
    };
}

describe("createContentController", () => {
    it("does not wait for an anchor on an unsupported initial route", async () => {
        const deps = createDeps({ routeKey: null });

        await createContentController(deps).navigate("https://www.bilibili.com/");

        expect(deps.waitForAnchor).not.toHaveBeenCalled();
    });

    it("ignores hash and tracking-query changes for the same video part", async () => {
        const deps = createDeps({ routeKey: "bilibili:BV1abc:p=1" });
        const controller = createContentController(deps);

        await controller.navigate(videoUrl);
        await controller.navigate(`${videoUrl}&spm_id_from=x#reply`);

        expect(deps.loadTranscript).toHaveBeenCalledTimes(1);
        expect(deps.mountPanel).toHaveBeenCalledTimes(1);
    });

    it("leaving a supported route aborts, disposes, removes, and stops observing once", async () => {
        const deps = createDeps();
        const controller = createContentController(deps);
        await controller.navigate(videoUrl);
        const loadedSignal = deps.loadedSignals[0]!;

        await controller.navigate("https://www.bilibili.com/");
        controller.dispose();

        expect(deps.panelHandles[0]!.dispose).toHaveBeenCalledTimes(1);
        expect(loadedSignal.aborted).toBe(true);
        expect(deps.host.remove).toHaveBeenCalledTimes(1);
        expect(deps.stopObservers[0]).toHaveBeenCalledTimes(1);
    });

    it("replacing a supported route disposes the previous session once", async () => {
        const deps = createDeps({
            routeKeyForUrl: (url) => {
                const id = url.match(/\/video\/(BV[^?/#]+)/)?.[1];
                return id ? `bilibili:${id}:p=1` : null;
            },
        });
        const controller = createContentController(deps);
        await controller.navigate("https://www.bilibili.com/video/BV1first");
        const firstSignal = deps.loadedSignals[0]!;

        await controller.navigate("https://www.bilibili.com/video/BV1second");

        expect(firstSignal.aborted).toBe(true);
        expect(deps.panelHandles[0]!.dispose).toHaveBeenCalledTimes(1);
        expect(deps.host.remove).toHaveBeenCalledTimes(1);
        expect(deps.stopObservers[0]).toHaveBeenCalledTimes(1);
    });

    it("does not let stale transcript results update a replacement session", async () => {
        const first = deferred<PlatformTranscriptResult>();
        const second = deferred<PlatformTranscriptResult>();
        const deps = createDeps({
            routeKeyForUrl: (url) => {
                const id = url.match(/\/video\/(BV[^?/#]+)/)?.[1];
                return id ? `bilibili:${id}:p=1` : null;
            },
            loadTranscript: (url) => url.includes("BV1first") ? first.promise : second.promise,
        });
        const controller = createContentController(deps);

        const firstNavigation = controller.navigate("https://www.bilibili.com/video/BV1first");
        await vi.waitFor(() => expect(deps.loadTranscript).toHaveBeenCalledTimes(1));
        const secondNavigation = controller.navigate("https://www.bilibili.com/video/BV1second");
        await vi.waitFor(() => expect(deps.loadTranscript).toHaveBeenCalledTimes(2));
        second.resolve({ transcript: [{ from: 2, to: 3, content: "second" }], source: "ai_wbi" });
        await secondNavigation;
        first.resolve({ transcript: [{ from: 0, to: 1, content: "stale" }], source: "human_view" });
        await firstNavigation;

        expect(deps.panelHandles[0]!.updateData).not.toHaveBeenCalled();
        expect(deps.panelHandles[1]!.updateData).toHaveBeenCalledTimes(1);
        expect(deps.panelHandles[1]!.updateData).toHaveBeenCalledWith(expect.objectContaining({
            transcript: [{ from: 2, to: 3, content: "second" }],
            status: "ready",
        }));
    });

    it("host recovery reinserts the same host and reapplies terminal data without remounting", async () => {
        const deps = createDeps();
        const controller = createContentController(deps);
        await controller.navigate(videoUrl);
        const handle = deps.panelHandles[0]!;
        const terminalData = vi.mocked(handle.updateData).mock.calls.at(-1)?.[0];

        deps.detachHost();
        controller.recoverHost();

        expect(deps.anchor.prepend).toHaveBeenCalledWith(deps.host);
        expect(deps.mountPanel).toHaveBeenCalledTimes(1);
        expect(handle.updateData).toHaveBeenCalledTimes(2);
        expect(vi.mocked(handle.updateData).mock.calls.at(-1)?.[0]).toBe(terminalData);
        expect(handle.reset).not.toHaveBeenCalled();
    });

    it("stores an error terminal state so recovery never returns to loading", async () => {
        const deps = createDeps({ loadError: new Error("network down") });
        const controller = createContentController(deps);
        await controller.navigate(videoUrl);
        const handle = deps.panelHandles[0]!;

        expect(handle.updateData).toHaveBeenLastCalledWith(expect.objectContaining({
            status: "error",
            errorMessage: expect.stringContaining("network down"),
        }));
        deps.detachHost();
        controller.recoverHost();

        expect(deps.mountPanel).toHaveBeenCalledTimes(1);
        expect(handle.updateData).toHaveBeenLastCalledWith(expect.objectContaining({
            status: "error",
            errorMessage: expect.stringContaining("network down"),
        }));
        expect(handle.reset).not.toHaveBeenCalled();
    });

    it("stores transcript changes from the mounted panel for later recovery", async () => {
        const deps = createDeps();
        const controller = createContentController(deps);
        await controller.navigate(videoUrl);
        const selected: PlatformTranscriptResult = {
            transcript: [{ from: 4, to: 5, content: "selected language" }],
            source: "human_view",
        };

        deps.panelCallbacks[0]!.onTranscriptChange?.(selected);
        deps.detachHost();
        controller.recoverHost();

        expect(deps.panelHandles[0]!.updateData).toHaveBeenLastCalledWith({
            ...selected,
            status: "ready",
        });
    });
});

describe("waitForElm", () => {
    beforeEach(() => document.body.replaceChildren());

    function stubMutationObserver() {
        let callback: MutationCallback | null = null;
        const disconnect = vi.fn();
        const observe = vi.fn();
        class FakeMutationObserver {
            constructor(nextCallback: MutationCallback) {
                callback = nextCallback;
            }

            disconnect = disconnect;
            observe = observe;
            takeRecords(): MutationRecord[] {
                return [];
            }
        }
        vi.stubGlobal("MutationObserver", FakeMutationObserver);
        return {
            disconnect,
            observe,
            notify(): void {
                if (!callback) throw new Error("MutationObserver was not created");
                callback([], {} as MutationObserver);
            },
        };
    }

    it("rejects immediately when its signal is already aborted", async () => {
        vi.spyOn(document, "querySelector").mockReturnValue(null);
        const controller = new AbortController();
        controller.abort();

        await expect(waitForElm("#missing", { signal: controller.signal })).rejects.toMatchObject({
            name: "AbortError",
        });
    });

    it("disconnects its observer and removes its abort listener on abort", async () => {
        vi.spyOn(document, "querySelector").mockReturnValue(null);
        const observer = stubMutationObserver();
        const controller = new AbortController();
        const removeListener = vi.spyOn(controller.signal, "removeEventListener");

        const waiting = waitForElm("#missing", { signal: controller.signal });
        controller.abort();

        await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
        expect(observer.disconnect).toHaveBeenCalledTimes(1);
        expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    });

    it("disconnects its observer and removes its abort listener on resolve", async () => {
        const found = document.createElement("div");
        vi.spyOn(document, "querySelector")
            .mockReturnValueOnce(null)
            .mockReturnValue(found);
        const observer = stubMutationObserver();
        const controller = new AbortController();
        const removeListener = vi.spyOn(controller.signal, "removeEventListener");

        const waiting = waitForElm("#anchor", { signal: controller.signal });
        observer.notify();

        await expect(waiting).resolves.toBe(found);
        expect(observer.disconnect).toHaveBeenCalledTimes(1);
        expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    });
});

describe("platform route identity", () => {
    it("uses a validated Bilibili part and ignores unrelated URL state", () => {
        const tracked = "https://www.bilibili.com/video/BV1abc?p=2&spm_id_from=x#reply";

        expect(getBiliPart(tracked)).toBe(2);
        expect(getBilibiliRouteKey(tracked)).toBe("bilibili:BV1abc:p=2");
        expect(bilibiliAdapter.getRouteKey(tracked)).toBe("bilibili:BV1abc:p=2");
        expect(getPlatformRouteKey(tracked)).toBe("bilibili:BV1abc:p=2");
        expect(getBilibiliRouteKey("https://www.bilibili.com/video/BV1abc?p=0"))
            .toBe("bilibili:BV1abc:p=1");
    });

    it("returns no route key for unsupported URLs", () => {
        expect(getPlatformRouteKey("https://www.bilibili.com/")).toBeNull();
        expect(getBilibiliRouteKey("https://example.com/video/BV1abc?p=2")).toBeNull();
    });
});

describe("platform request cancellation", () => {
    it("forwards the controller signal through the platform registry", async () => {
        const signal = new AbortController().signal;
        const getTranscript = vi.spyOn(bilibiliAdapter, "getTranscript")
            .mockResolvedValue({ transcript: null, source: "none" });

        await getTranscriptForUrl(videoUrl, signal);

        expect(getTranscript).toHaveBeenCalledWith(videoUrl, signal);
    });
});
