import { mountPanel, cleanupKey } from "../panel/mount";
import type { HostWithCleanup } from "../panel/mount";
import { getPlatformAdapter, getTranscriptForUrl } from "../platforms";
import type { PlatformTranscriptResult } from "../platforms/types";
import { ensureHostInside, waitForElm, ROOT_ID } from "./dom";
import { watchRouteChange } from "./route-watcher";

const ANCHOR_ID = "div.bpx-player-auxiliary";

let activeRenderId = 0;
let currentData: PlatformTranscriptResult | null = null;
let currentUrl: string = "";
let persistenceObserver: MutationObserver | null = null;

function mountShell() {
    const anchor = document.querySelector(ANCHOR_ID);
    if (!anchor) return;
    const host = ensureHostInside(anchor);
    mountPanel(host, { transcript: null, source: "loading", isLoading: true });
}

function fillData(data: PlatformTranscriptResult & { isLoading?: boolean }) {
    const anchor = document.querySelector(ANCHOR_ID);
    if (!anchor) return;
    const host = ensureHostInside(anchor);
    mountPanel(host, { 
        transcript: data.transcript, 
        source: data.source, 
        availableSubtitles: data.availableSubtitles, 
        subtitleUrl: data.subtitleUrl,
        aid: data.aid,
        cid: data.cid,
        isLoading: false
    });
}

function setupPersistence() {
    if (persistenceObserver) {
        persistenceObserver.disconnect();
    }
    
    // Watch for removal of our root from within the anchor, or innerHTML clearing
    persistenceObserver = new MutationObserver(() => {
        if (!currentUrl) return;

        const anchor = document.querySelector(ANCHOR_ID);
        if (!anchor) return; // Wait until anchor comes back naturally
        
        const host = document.getElementById(ROOT_ID);
        // If host was removed from anchor
        if (!host || !anchor.contains(host)) {
            console.warn("[RC] Persistence observer: host missing, re-mounting!", { hasData: !!currentData });
            if (currentData) {
                fillData(currentData);
            } else {
                mountShell();
            }
        }
    });

    persistenceObserver.observe(document.documentElement, { childList: true, subtree: true });
}

async function renderCurrentPage(renderId: number, url: string): Promise<void> {
    currentUrl = url;
    currentData = null; // reset

    await waitForElm(ANCHOR_ID);
    if (renderId !== activeRenderId || url !== location.href) {
        return;
    }

    // Stage 1: mount loading shell immediately
    mountShell();
    setupPersistence();

    // Stage 2: Fetch data and fill
    let data: PlatformTranscriptResult;
    try {
        data = await getTranscriptForUrl(url);
    } catch (err) {
        if (renderId !== activeRenderId || url !== location.href) return;
        console.error("[RC] Failed to fetch transcript:", err instanceof Error ? err.message : err);
        fillData({ transcript: null, source: "none", isLoading: false });
        return;
    }

    if (renderId !== activeRenderId || url !== location.href) {
        return;
    }

    currentData = data;
    fillData(data);
}

function scheduleRender(url: string): void {
    const renderId = ++activeRenderId;
    void renderCurrentPage(renderId, url);
}

function isSupportedRoute(url: string): boolean {
    return getPlatformAdapter(url) !== null;
}

export function startContentScript(): void {
    if (isSupportedRoute(location.href)) {
        scheduleRender(location.href);
    }

    watchRouteChange((url): void => {
        if (isSupportedRoute(url)) {
            scheduleRender(url);
            return;
        }

        activeRenderId += 1;
        currentUrl = "";
        currentData = null;
        if (persistenceObserver) {
            persistenceObserver.disconnect();
        }
        const host = document.getElementById(ROOT_ID) as HostWithCleanup | null;
        host?.[cleanupKey]?.();
    });
}
