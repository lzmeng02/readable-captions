export const BILIBILI_PANEL_ANCHORS = [
    "div.bpx-player-auxiliary",
    ".bpx-player-auxiliary",
    "#danmukuBox",
] as const;

export const BILIBILI_PLAYER_ROOTS = [
    ".bpx-player-video-area",
    ".bpx-player-primary-area",
    ".bpx-player-container",
    "#bilibili-player",
] as const;

export const BILIBILI_VIDEO_SELECTORS = [
    "video",
] as const;

export const BILIBILI_READER_SLOT_CLASS = "rc-bilibili-reader-slot";

function queryFirst<T extends Element>(root: ParentNode, selectors: readonly string[]): T | null {
    for (const selector of selectors) {
        const found = root.querySelector<T>(selector);
        if (found) {
            return found;
        }
    }

    return null;
}

export function findPanelAnchor(root: ParentNode = document): Element | null {
    return queryFirst(root, BILIBILI_PANEL_ANCHORS);
}

export function findPlayerRoot(root: ParentNode = document): HTMLElement | null {
    return queryFirst<HTMLElement>(root, BILIBILI_PLAYER_ROOTS);
}

export function findVideo(root: ParentNode = document): HTMLVideoElement | null {
    return queryFirst<HTMLVideoElement>(root, BILIBILI_VIDEO_SELECTORS);
}

export function findPictureInPictureButton(root: ParentNode = document): HTMLElement | null {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>("button, [role='button'], .bpx-player-ctrl-btn"));

    return candidates.find((candidate) => {
        const title = candidate.getAttribute("title") ?? "";
        const label = candidate.getAttribute("aria-label") ?? "";
        const text = candidate.textContent ?? "";
        const blob = `${title} ${label} ${text}`;
        return blob.includes("画中画") || blob.includes("小窗");
    }) ?? null;
}
