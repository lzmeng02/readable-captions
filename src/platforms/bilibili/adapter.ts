import { waitForAnyElement } from "../../core/lifecycle";
import type { Fetcher } from "../../services/http/fetcher";
import type {
    PanelPlacement,
    PlatformAdapter,
    PlatformCapabilities,
    PlatformSession,
    PlatformSessionContext,
    TranscriptBundle,
} from "../../shared/types";
import {
    BILIBILI_PANEL_ANCHORS,
    findPanelAnchor,
    findPictureInPictureButton,
    findPlayerRoot,
    findVideo,
} from "./selectors";
import { fetchBilibiliTranscript } from "./transcript";

const capabilities: PlatformCapabilities = {
    readerMode: true,
    pictureInPicture: true,
};

function styleHost(host: HTMLElement, placement: PanelPlacement): void {
    host.style.display = "block";
    host.style.width = "100%";
    host.style.marginBottom = placement === "sidebar" ? "12px" : "0";
    host.style.height = placement === "reader" ? "100%" : "auto";
}

class BilibiliSession implements PlatformSession {
    readonly id = "bilibili";
    readonly displayName = "Bilibili";
    readonly capabilities = capabilities;

    private readonly fetcher: Fetcher;
    private readonly url: URL;
    private readonly document: Document;
    private readerSlot: HTMLElement | null = null;
    private originalPlayerPosition: string | null = null;

    constructor(
        context: PlatformSessionContext,
        fetcher: Fetcher,
    ) {
        this.fetcher = fetcher;
        this.url = context.url;
        this.document = context.document;
    }

    async waitForReady(): Promise<void> {
        await waitForAnyElement(BILIBILI_PANEL_ANCHORS, this.document);
    }

    mountPanelHost(host: HTMLElement, placement: PanelPlacement): void {
        if (placement === "reader") {
            const playerRoot = findPlayerRoot(this.document);
            if (!playerRoot) {
                this.mountSidebar(host);
                return;
            }

            const slot = this.ensureReaderSlot(playerRoot);
            slot.appendChild(host);
            styleHost(host, "reader");
            return;
        }

        this.mountSidebar(host);
    }

    async fetchTranscript(): Promise<TranscriptBundle> {
        return fetchBilibiliTranscript(this.url.toString(), this.fetcher);
    }

    getVideoElement(): HTMLVideoElement | null {
        return findVideo(this.document);
    }

    async requestPictureInPicture(): Promise<boolean> {
        const button = findPictureInPictureButton(this.document);
        if (button) {
            button.click();
            return true;
        }

        const video = this.getVideoElement();
        if (!video || typeof video.requestPictureInPicture !== "function") {
            return false;
        }

        try {
            await video.requestPictureInPicture();
            return true;
        } catch {
            return false;
        }
    }

    async exitPictureInPicture(): Promise<void> {
        if (this.document.pictureInPictureElement) {
            await this.document.exitPictureInPicture();
        }
    }

    dispose(): void {
        if (this.readerSlot?.isConnected) {
            this.readerSlot.remove();
        }

        const playerRoot = findPlayerRoot(this.document);
        if (playerRoot && this.originalPlayerPosition !== null) {
            playerRoot.style.position = this.originalPlayerPosition;
        }
    }

    private mountSidebar(host: HTMLElement): void {
        const anchor = findPanelAnchor(this.document);
        if (!anchor) {
            return;
        }

        anchor.insertAdjacentElement("beforebegin", host);
        styleHost(host, "sidebar");
    }

    private ensureReaderSlot(playerRoot: HTMLElement): HTMLElement {
        if (!this.readerSlot || !this.readerSlot.isConnected) {
            const slot = this.document.createElement("section");
            slot.className = "rc-bilibili-reader-slot";
            slot.style.position = "absolute";
            slot.style.inset = "0";
            slot.style.padding = "12px";
            slot.style.background = "rgba(255, 255, 255, 0.98)";
            slot.style.backdropFilter = "blur(8px)";
            slot.style.zIndex = "12";
            slot.style.boxSizing = "border-box";

            if (!playerRoot.style.position) {
                this.originalPlayerPosition = "";
                playerRoot.style.position = "relative";
            } else if (this.originalPlayerPosition === null) {
                this.originalPlayerPosition = playerRoot.style.position;
            }

            playerRoot.appendChild(slot);
            this.readerSlot = slot;
        }

        return this.readerSlot;
    }
}

export function createBilibiliAdapter(fetcher: Fetcher): PlatformAdapter {
    return {
        id: "bilibili",
        displayName: "Bilibili",
        matches(url) {
            return /(^|\.)bilibili\.com$/i.test(url.hostname) && url.pathname.startsWith("/video/");
        },
        createSession(context) {
            return new BilibiliSession(context, fetcher);
        },
    };
}
