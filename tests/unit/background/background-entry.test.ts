import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERATION_STREAM_PORT } from "../../../src/generation/protocol";
import type { ExtensionSettings } from "../../../src/settings/types";
import { createSettings, createSseResponse, generationRequest, successfulSse } from "../../helpers/generation";
import { createFakeRuntimePort } from "../../helpers/runtime-port";

type FakePort = ReturnType<typeof createFakeRuntimePort>;

const activePorts: FakePort[] = [];

async function flushPromises(count = 20): Promise<void> {
    for (let index = 0; index < count; index += 1) {
        await Promise.resolve();
    }
}

function createFakeChrome(settings: ExtensionSettings) {
    let connectListener: ((port: FakePort["port"]) => void) | undefined;
    const getPlatformInfo = vi.fn(async () => ({ os: "win" }));
    const chrome = {
        runtime: {
            getPlatformInfo,
            onConnect: {
                addListener(listener: (port: FakePort["port"]) => void): void {
                    connectListener = listener;
                },
            },
        },
        storage: {
            local: {
                get(_keys: string | string[], callback: (items: Record<string, unknown>) => void): void {
                    callback({ extensionSettings: settings });
                },
                setAccessLevel(
                    _options: { accessLevel: string },
                    callback?: () => void,
                ): void {
                    callback?.();
                },
            },
            onChanged: {
                addListener(): void { },
                removeListener(): void { },
            },
        },
    };

    return {
        chrome,
        getPlatformInfo,
        connect(port: FakePort["port"]): void {
            if (!connectListener) {
                throw new Error("background.ts did not register an onConnect listener");
            }
            connectListener(port);
        },
    };
}

function createAbortableFetch() {
    let requestSignal: AbortSignal | undefined;
    let resolveResponse!: (response: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
        resolveResponse = resolve;
    });
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        requestSignal = init?.signal ?? undefined;

        return new Promise<Response>((resolve, reject) => {
            responsePromise.then(resolve, reject);
            const rejectAbort = (): void => reject(new DOMException("Aborted", "AbortError"));
            if (requestSignal?.aborted) {
                rejectAbort();
                return;
            }
            requestSignal?.addEventListener("abort", rejectAbort, { once: true });
        });
    });

    return {
        fetch,
        complete(response: Response): void {
            resolveResponse(response);
        },
        get signal(): AbortSignal | undefined {
            return requestSignal;
        },
    };
}

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
});

afterEach(async () => {
    for (const port of activePorts.splice(0)) {
        port.emitDisconnect();
    }
    await flushPromises();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("background entry keepalive wiring", () => {
    it("pulses at 25 seconds while a request is pending and stops after completion", async () => {
        const fakeChrome = createFakeChrome(createSettings());
        const fetch = createAbortableFetch();
        vi.stubGlobal("chrome", fakeChrome.chrome);
        vi.stubGlobal("fetch", fetch.fetch);

        await import("../../../src/background");

        const generation = createFakeRuntimePort(GENERATION_STREAM_PORT);
        activePorts.push(generation);
        fakeChrome.connect(generation.port);
        generation.emitMessage({ type: "start", request: generationRequest });
        await flushPromises();

        expect(fetch.fetch).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(24_999);
        expect(fakeChrome.getPlatformInfo).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(fakeChrome.getPlatformInfo).toHaveBeenCalledOnce();

        fetch.complete(createSseResponse(successfulSse));
        await flushPromises(40);

        expect(generation.postedMessages.at(-1)).toEqual({ type: "done", text: "ok" });
        await vi.advanceTimersByTimeAsync(50_000);
        expect(fakeChrome.getPlatformInfo).toHaveBeenCalledOnce();
    });

    it("pulses while pending and stops immediately after explicit cancel", async () => {
        const fakeChrome = createFakeChrome(createSettings());
        const fetch = createAbortableFetch();
        vi.stubGlobal("chrome", fakeChrome.chrome);
        vi.stubGlobal("fetch", fetch.fetch);

        await import("../../../src/background");

        const generation = createFakeRuntimePort(GENERATION_STREAM_PORT);
        activePorts.push(generation);
        fakeChrome.connect(generation.port);
        generation.emitMessage({ type: "start", request: generationRequest });
        await flushPromises();

        await vi.advanceTimersByTimeAsync(25_000);
        expect(fakeChrome.getPlatformInfo).toHaveBeenCalledOnce();

        generation.emitMessage({ type: "cancel" });
        await flushPromises();

        expect(fetch.signal?.aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(50_000);
        expect(fakeChrome.getPlatformInfo).toHaveBeenCalledOnce();
        expect(generation.postedMessages).toEqual([]);
    });
});
