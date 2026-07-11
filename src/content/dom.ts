const ROOT_ID = "readable-captions-root";

export function waitForElm(selector: string, options: { signal?: AbortSignal } = {}): Promise<Element> {
    const found = document.querySelector(selector);
    if (found) {
        return Promise.resolve(found);
    }
    if (options.signal?.aborted) {
        return Promise.reject(new DOMException("Element wait was aborted.", "AbortError"));
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const obs = new MutationObserver(() => {
            const elm = document.querySelector(selector);
            if (elm) {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(elm);
            }
        });
        const onAbort = (): void => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new DOMException("Element wait was aborted.", "AbortError"));
        };
        const cleanup = (): void => {
            obs.disconnect();
            options.signal?.removeEventListener("abort", onAbort);
        };

        options.signal?.addEventListener("abort", onAbort, { once: true });
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
