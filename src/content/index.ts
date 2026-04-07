import { mountPanel } from "../panel/mount";
import { getPlatformAdapter, getTranscriptForUrl } from "../platforms";
import { ensureHostBefore, waitForElm } from "./dom";
import { watchRouteChange } from "./route-watcher";

const ANCHOR_ID = "div.bpx-player-auxiliary";

let activeRenderId = 0;

async function renderCurrentPage(renderId: number, url: string): Promise<void> {
    const anchor = await waitForElm(ANCHOR_ID);
    if (renderId !== activeRenderId || url !== location.href) {
        return;
    }

    const host = ensureHostBefore(anchor);
    const { transcript, source, availableSubtitles, subtitleUrl } = await getTranscriptForUrl(url);

    if (renderId !== activeRenderId || url !== location.href) {
        return;
    }

    console.log("RC subtitle source:", source, "lines:", transcript?.length);
    console.log("RC transcript type:", Array.isArray(transcript), typeof transcript);
    console.log("RC transcript sample:", Array.isArray(transcript) ? transcript.slice(0, 3) : transcript);

    mountPanel(host, { transcript, source, availableSubtitles, subtitleUrl });
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
    });
}
