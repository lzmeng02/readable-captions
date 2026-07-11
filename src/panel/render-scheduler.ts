export type RenderScheduler = {
    schedule(): void;
    flush(): void;
    cancel(): void;
};

const requestBrowserFrame: typeof requestAnimationFrame = (callback) =>
    globalThis.requestAnimationFrame(callback);

const cancelBrowserFrame: typeof cancelAnimationFrame = (handle) =>
    globalThis.cancelAnimationFrame(handle);

export function createRenderScheduler(
    renderNow: () => void,
    requestFrame: typeof requestAnimationFrame = requestBrowserFrame,
    cancelFrame: typeof cancelAnimationFrame = cancelBrowserFrame,
): RenderScheduler {
    let pendingFrame: number | null = null;

    const cancel = (): void => {
        if (pendingFrame === null) return;
        cancelFrame(pendingFrame);
        pendingFrame = null;
    };

    return {
        schedule(): void {
            if (pendingFrame !== null) return;
            pendingFrame = requestFrame(() => {
                pendingFrame = null;
                renderNow();
            });
        },
        flush(): void {
            cancel();
            renderNow();
        },
        cancel,
    };
}
