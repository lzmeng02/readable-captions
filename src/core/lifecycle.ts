function findFirst(selectors: readonly string[], root: ParentNode): Element | null {
    for (const selector of selectors) {
        const found = root.querySelector(selector);
        if (found) {
            return found;
        }
    }

    return null;
}

export function waitForAnyElement(selectors: readonly string[], root: ParentNode = document): Promise<Element> {
    const existing = findFirst(selectors, root);
    if (existing) {
        return Promise.resolve(existing);
    }

    const observeTarget = root instanceof Document ? root.documentElement : root;

    return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
            const found = findFirst(selectors, root);
            if (!found) {
                return;
            }

            observer.disconnect();
            resolve(found);
        });

        observer.observe(observeTarget, {
            childList: true,
            subtree: true,
        });
    });
}

export function watchLocationChange(targetWindow: Window, onChange: () => void, intervalMs = 800): () => void {
    let current = targetWindow.location.href;

    const timer = targetWindow.setInterval(() => {
        const next = targetWindow.location.href;
        if (next === current) {
            return;
        }

        current = next;
        onChange();
    }, intervalMs);

    return () => {
        targetWindow.clearInterval(timer);
    };
}
