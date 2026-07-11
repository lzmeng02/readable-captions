export const GENERATION_KEEPALIVE_INTERVAL_MS = 25_000;

export type KeepAliveDependencies = {
    pulse(): unknown | Promise<unknown>;
    setInterval(
        callback: () => void,
        delayMs: number,
    ): ReturnType<typeof globalThis.setInterval>;
    clearInterval(handle: ReturnType<typeof globalThis.setInterval>): void;
};

export async function withKeepAlive<T>(
    work: () => Promise<T>,
    signal: AbortSignal,
    deps: KeepAliveDependencies,
): Promise<T> {
    let active = true;
    const pulse = (): void => {
        if (!active) {
            return;
        }

        try {
            void Promise.resolve(deps.pulse()).catch(() => { });
        } catch {
            // Keepalive failures must not change the generation result.
        }
    };
    const intervalHandle = deps.setInterval(pulse, GENERATION_KEEPALIVE_INTERVAL_MS);
    const cleanup = (): void => {
        if (!active) {
            return;
        }

        active = false;
        signal.removeEventListener("abort", cleanup);
        deps.clearInterval(intervalHandle);
    };

    signal.addEventListener("abort", cleanup, { once: true });
    if (signal.aborted) {
        cleanup();
    }

    try {
        return await work();
    } finally {
        cleanup();
    }
}
