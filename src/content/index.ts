import { mountPanel } from "../panel/mount";
import { getPlatformRouteKey, getTranscriptForUrl } from "../platforms";
import { createContentController } from "./controller";
import { ensureHostInside, waitForElm } from "./dom";
import { watchRouteChange } from "./route-watcher";

const ANCHOR_SELECTOR = "div.bpx-player-auxiliary";

export function startContentScript(): void {
    const controller = createContentController({
        routeKeyForUrl: getPlatformRouteKey,
        waitForAnchor(signal) {
            return waitForElm(ANCHOR_SELECTOR, { signal });
        },
        getAnchor() {
            return document.querySelector(ANCHOR_SELECTOR);
        },
        ensureHost: ensureHostInside,
        loadTranscript: getTranscriptForUrl,
        mountPanel,
        observeDom(listener) {
            const observer = new MutationObserver(() => listener());
            observer.observe(document.documentElement, { childList: true, subtree: true });
            return () => observer.disconnect();
        },
    });

    void controller.navigate(location.href);
    watchRouteChange((url) => {
        void controller.navigate(url);
    });
}
