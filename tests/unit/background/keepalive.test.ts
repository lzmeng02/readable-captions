import { afterEach, describe, expect, it, vi } from "vitest";
import {
    GENERATION_KEEPALIVE_INTERVAL_MS,
    withKeepAlive,
    type KeepAliveDependencies,
} from "../../../src/generation/keepalive";

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

function timerDependencies(pulse: KeepAliveDependencies["pulse"]): KeepAliveDependencies {
    return {
        pulse,
        setInterval: globalThis.setInterval.bind(globalThis),
        clearInterval: globalThis.clearInterval.bind(globalThis),
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("withKeepAlive", () => {
    it("pulses every 25 seconds while work is pending", async () => {
        vi.useFakeTimers();
        const pending = deferred<void>();
        const pulse = vi.fn();

        const result = withKeepAlive(
            () => pending.promise,
            new AbortController().signal,
            timerDependencies(pulse),
        );

        expect(GENERATION_KEEPALIVE_INTERVAL_MS).toBe(25_000);
        expect(vi.getTimerCount()).toBe(1);

        await vi.advanceTimersByTimeAsync(50_000);

        expect(pulse).toHaveBeenCalledTimes(2);

        pending.resolve();
        await result;

        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(50_000);
        expect(pulse).toHaveBeenCalledTimes(2);
    });

    it("cleans the timer when work rejects and preserves the rejection", async () => {
        vi.useFakeTimers();
        const pending = deferred<void>();
        const pulse = vi.fn();
        const error = new Error("generation failed");
        const result = withKeepAlive(
            () => pending.promise,
            new AbortController().signal,
            timerDependencies(pulse),
        );
        const rejected = expect(result).rejects.toBe(error);

        pending.reject(error);

        await rejected;
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(25_000);
        expect(pulse).not.toHaveBeenCalled();
    });

    it("cleans immediately and idempotently when the request is aborted", async () => {
        const pending = deferred<void>();
        const controller = new AbortController();
        const intervalHandle = 17 as unknown as ReturnType<typeof globalThis.setInterval>;
        const clearInterval = vi.fn();
        const setInterval = vi.fn(() => intervalHandle);
        const result = withKeepAlive(
            () => pending.promise,
            controller.signal,
            { pulse: vi.fn(), setInterval, clearInterval },
        );

        expect(setInterval).toHaveBeenCalledOnce();
        expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 25_000);

        controller.abort();

        expect(clearInterval).toHaveBeenCalledOnce();
        expect(clearInterval).toHaveBeenCalledWith(intervalHandle);

        controller.abort();
        pending.resolve();
        await result;

        expect(clearInterval).toHaveBeenCalledOnce();
    });

    it("ignores synchronous and asynchronous pulse failures", async () => {
        vi.useFakeTimers();
        const pending = deferred<string>();
        const pulse = vi.fn()
            .mockImplementationOnce(() => {
                throw new Error("sync pulse failure");
            })
            .mockImplementationOnce(() => Promise.reject(new Error("async pulse failure")));
        const result = withKeepAlive(
            () => pending.promise,
            new AbortController().signal,
            timerDependencies(pulse),
        );

        await vi.advanceTimersByTimeAsync(50_000);
        pending.resolve("complete");

        await expect(result).resolves.toBe("complete");
        expect(pulse).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
    });
});
