export const ROOT_ID = "readable-captions-root";

export function waitForElm(anchorID: string, options: { signal?: AbortSignal } = {}): Promise<Element> {
    const found = document.querySelector(anchorID);
    if (found) {
        return Promise.resolve(found);
    }

    if (options.signal?.aborted) {
        return Promise.reject(new DOMException("Element wait was aborted.", "AbortError"));
    }

    return new Promise((resolve, reject) => {
        const obs = new MutationObserver(() => {
            const elm = document.querySelector(anchorID);
            if (elm) {
                cleanup();
                resolve(elm);
            }
        });

        const abort = (): void => {
            cleanup();
            reject(new DOMException("Element wait was aborted.", "AbortError"));
        };

        const cleanup = (): void => {
            obs.disconnect();
            options.signal?.removeEventListener("abort", abort);
        };

        options.signal?.addEventListener("abort", abort, { once: true });
        obs.observe(document.documentElement, { childList: true, subtree: true });
    });
}

export function ensureHostInside(anchor: Element): HTMLElement {
    let host = document.getElementById(ROOT_ID);
    if (!host) {
        host = document.createElement("section");
        host.id = ROOT_ID;
        host.style.display = "block";
        host.style.width = "100%";
        host.style.marginBottom = "12px";
    }

    anchor.prepend(host);

    return host;
}
