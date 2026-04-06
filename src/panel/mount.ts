import { render } from "lit";
import { panelTemplate, panelStyles } from "./panel-view";
import type { Mode } from "./panel-view";
import type { Transcript } from "../transcript/model";

const cleanupKey = Symbol("rcPanelCleanup");

type PanelData = {
    transcript: Transcript | null;
    source: string;
};

type HostWithCleanup = HTMLElement & {
    [cleanupKey]?: () => void;
};

type ExtensionRuntime = {
    openOptionsPage?: () => Promise<void> | void;
    getURL?: (path: string) => string;
};

function getExtensionRuntime(): ExtensionRuntime | null {
    const chromeObject = (globalThis as typeof globalThis & { chrome?: { runtime?: ExtensionRuntime } }).chrome;

    return chromeObject?.runtime ?? null;
}

async function openExtensionOptionsPage(): Promise<void> {
    const runtime = getExtensionRuntime();
    if (!runtime) {
        return;
    }

    if (typeof runtime.openOptionsPage === "function") {
        try {
            await runtime.openOptionsPage();
            return;
        } catch {
            // Fall through to direct URL open when the runtime helper is unavailable in the current context.
        }
    }

    const optionsUrl = runtime.getURL?.("options.html");
    if (!optionsUrl) {
        return;
    }

    window.open(optionsUrl, "_blank", "noopener,noreferrer");
}

export function mountPanel(host: HTMLElement, data: PanelData): void {
    const managedHost = host as HostWithCleanup;
    managedHost[cleanupKey]?.();

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

    if (!shadow.querySelector("style[data-rc]")) {
        const styleTag = document.createElement("style");
        styleTag.setAttribute("data-rc", "1");
        styleTag.textContent = String(panelStyles);

        shadow.appendChild(styleTag);
    }

    let mode: Mode = "ts";
    let isOverflowOpen = false;

    const syncOverflowUi = (): void => {
        const actions = shadow.querySelector(".actions");
        if (!(actions instanceof HTMLElement)) {
            return;
        }

        const overflowButton = actions.querySelector(".icon-btn:last-child");
        if (!(overflowButton instanceof HTMLButtonElement)) {
            return;
        }

        overflowButton.dataset.rcOverflow = "true";
        overflowButton.setAttribute("aria-haspopup", "menu");
        overflowButton.setAttribute("aria-expanded", isOverflowOpen ? "true" : "false");
        overflowButton.onclick = (): void => {
            toggleOverflow();
        };

        const existingMenu = actions.querySelector(".overflow-menu");
        existingMenu?.remove();

        if (!isOverflowOpen) {
            return;
        }

        const menu = document.createElement("div");
        menu.className = "overflow-menu";
        menu.dataset.rcOverflow = "true";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", "More actions");

        const settingsButton = document.createElement("button");
        settingsButton.type = "button";
        settingsButton.className = "overflow-item";
        settingsButton.dataset.rcOverflow = "true";
        settingsButton.setAttribute("role", "menuitem");
        settingsButton.textContent = "Settings";
        settingsButton.onclick = (): void => {
            onSettingsClick();
        };

        menu.appendChild(settingsButton);
        actions.appendChild(menu);
    };

    const renderPanel = (): void => {
        render(panelTemplate(mode, setMode, data), shadow);
        syncOverflowUi();
    };

    const setMode = (nextMode: Mode): void => {
        mode = nextMode;
        renderPanel();
    };

    const closeOverflow = (): void => {
        if (!isOverflowOpen) {
            return;
        }

        isOverflowOpen = false;
        renderPanel();
    };

    const toggleOverflow = (): void => {
        isOverflowOpen = !isOverflowOpen;
        renderPanel();
    };

    const onSettingsClick = (): void => {
        closeOverflow();
        void openExtensionOptionsPage();
    };

    const handlePointerDown = (event: PointerEvent): void => {
        if (!isOverflowOpen) {
            return;
        }

        const clickedInsideOverflow = event.composedPath().some((node) => {
            return node instanceof HTMLElement && node.dataset.rcOverflow === "true";
        });

        if (!clickedInsideOverflow) {
            closeOverflow();
        }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            closeOverflow();
        }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);

    managedHost[cleanupKey] = (): void => {
        document.removeEventListener("pointerdown", handlePointerDown, true);
        document.removeEventListener("keydown", handleKeyDown, true);
    };

    renderPanel();
}
