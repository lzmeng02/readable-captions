const ROOT_ID = "readable-captions-root";

export function waitForElm(anchorID: string): Promise<Element> {
    const found = document.querySelector(anchorID);
    if (found) {
        return Promise.resolve(found);
    }

    return new Promise((resolve) => {
        const obs = new MutationObserver(() => {
            const elm = document.querySelector(anchorID);
            if (elm) {
                obs.disconnect();
                resolve(elm);
            }
        });

        obs.observe(document.documentElement, { childList: true, subtree: true });
    });
}

export function ensureHostBefore(anchor: Element): HTMLElement {
    let host = document.getElementById(ROOT_ID);
    if (!host) {
        host = document.createElement("section");
        host.id = ROOT_ID;
        host.style.display = "block";
        host.style.width = "100%";
        host.style.marginBottom = "12px";
    }

    anchor.insertAdjacentElement("beforebegin", host);

    return host;
}
