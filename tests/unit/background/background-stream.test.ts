import { describe, expect, it, vi } from "vitest";
import {
    attachGenerationStreamPort,
    type GenerationPortDependencies,
    type KeepAliveRunner,
} from "../../../src/generation/background-stream";
import type { GenerationRequest } from "../../../src/generation/types";
import { createSettings, generationRequest } from "../../helpers/generation";
import { createFakeRuntimePort } from "../../helpers/runtime-port";

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
    for (let index = 0; index < 12; index += 1) {
        await Promise.resolve();
    }
}

function createDependencies(
    overrides: Partial<GenerationPortDependencies> = {},
): GenerationPortDependencies {
    const getSettings: GenerationPortDependencies["getSettings"] = async () => createSettings();
    const streamGenerationFromApi: GenerationPortDependencies["streamGenerationFromApi"] = async () => "complete";
    const keepAlive: KeepAliveRunner = (work) => work();

    return {
        getSettings,
        streamGenerationFromApi,
        keepAlive,
        ...overrides,
    };
}

describe("attachGenerationStreamPort", () => {
    it("streams API deltas and the canonical final text through one keepalive request", async () => {
        const fake = createFakeRuntimePort();
        const settings = createSettings();
        const keepAliveSignals: AbortSignal[] = [];
        const keepAlive: KeepAliveRunner = (work, signal) => {
            keepAliveSignals.push(signal);
            return work();
        };
        const streamGenerationFromApi = vi.fn<GenerationPortDependencies["streamGenerationFromApi"]>(
            async (options) => {
                options.onToken("first ");
                options.onToken("second");
                return "first second";
            },
        );
        const deps = createDependencies({
            getSettings: vi.fn(async () => settings),
            streamGenerationFromApi,
            keepAlive,
        });

        attachGenerationStreamPort(fake.port, deps);
        fake.emitMessage({ type: "start", request: generationRequest });
        await flushPromises();

        expect(keepAliveSignals).toHaveLength(1);
        expect(streamGenerationFromApi).toHaveBeenCalledWith(expect.objectContaining({
            settings,
            request: generationRequest,
            signal: keepAliveSignals[0],
            onToken: expect.any(Function),
        }));
        expect(fake.postedMessages).toEqual([
            { type: "token", text: "first " },
            { type: "token", text: "second" },
            { type: "done", text: "first second" },
        ]);
    });

    it("reports settings and API failures without changing their messages", async () => {
        const settingsFailure = createFakeRuntimePort();
        attachGenerationStreamPort(settingsFailure.port, createDependencies({
            getSettings: vi.fn(async () => {
                throw new Error("settings unavailable");
            }),
        }));

        settingsFailure.emitMessage({ type: "start", request: generationRequest });
        await flushPromises();

        expect(settingsFailure.postedMessages).toEqual([
            { type: "error", message: "settings unavailable" },
        ]);

        const apiFailure = createFakeRuntimePort();
        attachGenerationStreamPort(apiFailure.port, createDependencies({
            streamGenerationFromApi: vi.fn(async () => {
                throw new Error("API error (401): denied");
            }),
        }));

        apiFailure.emitMessage({ type: "start", request: generationRequest });
        await flushPromises();

        expect(apiFailure.postedMessages).toEqual([
            { type: "error", message: "API error (401): denied" },
        ]);
    });

    it("rejects invalid messages without starting or replacing a request", async () => {
        const fake = createFakeRuntimePort();
        const first = deferred<string>();
        const signals: AbortSignal[] = [];
        const streamGenerationFromApi = vi.fn<GenerationPortDependencies["streamGenerationFromApi"]>(
            async (options) => {
                signals.push(options.signal);
                return first.promise;
            },
        );
        attachGenerationStreamPort(fake.port, createDependencies({ streamGenerationFromApi }));

        fake.emitMessage({ type: "start", request: generationRequest });
        await flushPromises();
        fake.emitMessage({ type: "start", request: { transcript: [], task: "invalid" } });

        expect(streamGenerationFromApi).toHaveBeenCalledOnce();
        expect(signals[0]?.aborted).toBe(false);
        expect(fake.postedMessages).toEqual([
            { type: "error", message: "Invalid generation request." },
        ]);

        first.resolve("still active");
        await flushPromises();
        expect(fake.postedMessages.at(-1)).toEqual({ type: "done", text: "still active" });
    });

    it("aborts the previous request when a replacement starts and ignores its late output", async () => {
        const fake = createFakeRuntimePort();
        const calls: Array<{
            pending: ReturnType<typeof deferred<string>>;
            signal: AbortSignal;
            onToken(delta: string): void;
        }> = [];
        const keepAliveSignals: AbortSignal[] = [];
        const keepAlive: KeepAliveRunner = (work, signal) => {
            keepAliveSignals.push(signal);
            return work();
        };
        const streamGenerationFromApi = vi.fn<GenerationPortDependencies["streamGenerationFromApi"]>(
            async (options) => {
                const pending = deferred<string>();
                calls.push({ pending, signal: options.signal, onToken: options.onToken });
                return pending.promise;
            },
        );
        const secondRequest: GenerationRequest = { ...generationRequest, task: "intensive" };
        attachGenerationStreamPort(fake.port, createDependencies({ streamGenerationFromApi, keepAlive }));

        fake.emitMessage({ type: "start", request: generationRequest });
        await flushPromises();
        fake.emitMessage({ type: "start", request: secondRequest });
        await flushPromises();

        expect(calls).toHaveLength(2);
        expect(keepAliveSignals).toEqual([calls[0]?.signal, calls[1]?.signal]);
        expect(calls[0]?.signal.aborted).toBe(true);
        expect(calls[1]?.signal.aborted).toBe(false);

        calls[0]?.onToken("late token");
        calls[0]?.pending.resolve("late done");
        await flushPromises();
        expect(fake.postedMessages).toEqual([]);

        calls[1]?.onToken("current token");
        calls[1]?.pending.resolve("current done");
        await flushPromises();
        expect(fake.postedMessages).toEqual([
            { type: "token", text: "current token" },
            { type: "done", text: "current done" },
        ]);
    });

    it("aborts and silences the active request on explicit cancel", async () => {
        const fake = createFakeRuntimePort();
        const pending = deferred<string>();
        let signal: AbortSignal | undefined;
        let emitToken: ((delta: string) => void) | undefined;
        const streamGenerationFromApi = vi.fn<GenerationPortDependencies["streamGenerationFromApi"]>(
            async (options) => {
                signal = options.signal;
                emitToken = options.onToken;
                return pending.promise;
            },
        );
        attachGenerationStreamPort(fake.port, createDependencies({ streamGenerationFromApi }));

        fake.emitMessage({ type: "start", request: generationRequest });
        await flushPromises();
        fake.emitMessage({ type: "cancel" });

        expect(signal?.aborted).toBe(true);
        emitToken?.("late token");
        pending.reject(new Error("late failure"));
        await flushPromises();
        expect(fake.postedMessages).toEqual([]);
    });

    it("aborts and silences the active request when the port disconnects", async () => {
        const fake = createFakeRuntimePort();
        const pending = deferred<string>();
        let signal: AbortSignal | undefined;
        const streamGenerationFromApi = vi.fn<GenerationPortDependencies["streamGenerationFromApi"]>(
            async (options) => {
                signal = options.signal;
                return pending.promise;
            },
        );
        attachGenerationStreamPort(fake.port, createDependencies({ streamGenerationFromApi }));

        fake.emitMessage({ type: "start", request: generationRequest });
        await flushPromises();
        fake.emitDisconnect();

        expect(signal?.aborted).toBe(true);
        pending.resolve("late done");
        await flushPromises();
        expect(fake.postedMessages).toEqual([]);
    });
});
