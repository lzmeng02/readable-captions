import { mountPanel } from "../panel/mount";
import type { PanelData, PanelHandle } from "../panel/types";
import { getPlatformAdapter, getTranscriptForUrl } from "../platforms";
import type { PlatformTranscriptResult } from "../platforms/types";
import { ensureHostInside, waitForElm } from "./dom";
import { watchRouteChange } from "./route-watcher";

const ANCHOR_ID = "div.bpx-player-auxiliary";
const ROOT_ID = "readable-captions-root"; // From dom.ts

let activeRenderId = 0;
let currentData: PlatformTranscriptResult | null = null;
let currentUrl = "";
let persistenceObserver: MutationObserver | null = null;
let panelHost: HTMLElement | null = null;
let panelHandle: PanelHandle | null = null;

function mountPanelInstance(host: HTMLElement, data: PanelData): void {
    panelHandle?.dispose();
    panelHost = host;
    panelHandle = mountPanel(host, data, {
        onTranscriptChange(result) {
            currentData = result;
        },
    });
}

function mountShell() {
    const anchor = document.querySelector(ANCHOR_ID);
    if (!anchor) return;
    const host = ensureHostInside(anchor);
    const data: PanelData = { transcript: null, source: "none", status: "loading" };
    if (panelHandle && panelHost === host) {
        panelHandle.reset(data);
        return;
    }

    mountPanelInstance(host, data);
}

function fillData(data: PlatformTranscriptResult) {
    const anchor = document.querySelector(ANCHOR_ID);
    if (!anchor) return;
    const host = ensureHostInside(anchor);
    const panelData: PanelData = { ...data, status: "ready" };
    if (panelHandle && panelHost === host) {
        panelHandle.updateData(panelData);
        return;
    }

    mountPanelInstance(host, panelData);
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
    const data = await getTranscriptForUrl(url);

    if (renderId !== activeRenderId || url !== location.href) {
        return;
    }

    console.log("RC subtitle source:", data.source, "lines:", data.transcript?.length);
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
    scheduleRender(location.href);

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
        panelHandle?.dispose();
        panelHandle = null;
        panelHost = null;
    });
}
