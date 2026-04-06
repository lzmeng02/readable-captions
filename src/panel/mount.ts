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

type ClosestCapableTarget = EventTarget & {
    closest: (selector: string) => Element | null;
};

function canUseClosest(value: EventTarget | null): value is ClosestCapableTarget {
    return typeof value === "object" && value !== null && "closest" in value;
}

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
    let uiLanguage: "zh" | "en" = "zh";

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
        overflowButton.classList.toggle("active", isOverflowOpen);
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
        menu.setAttribute("aria-label", uiLanguage === "zh" ? "更多操作" : "More Actions");

        const settingsButton = document.createElement("button");
        settingsButton.type = "button";
        settingsButton.className = "overflow-item";
        settingsButton.dataset.rcOverflow = "true";
        settingsButton.setAttribute("role", "menuitem");
        settingsButton.setAttribute("aria-label", uiLanguage === "zh" ? "设置" : "Settings");

        const settingsIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        settingsIcon.setAttribute("viewBox", "0 0 24 24");
        settingsIcon.setAttribute("width", "14");
        settingsIcon.setAttribute("height", "14");
        settingsIcon.setAttribute("fill", "none");
        settingsIcon.setAttribute("stroke", "currentColor");
        settingsIcon.setAttribute("stroke-width", "2");
        settingsIcon.setAttribute("stroke-linecap", "round");
        settingsIcon.setAttribute("stroke-linejoin", "round");
        settingsIcon.classList.add("overflow-item-icon");

        const settingsIconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        settingsIconPath.setAttribute(
            "d",
            "M12 3l1.2 2.2 2.5.4-1.8 1.8.4 2.6L12 9.2 9.7 10l.4-2.6-1.8-1.8 2.5-.4L12 3zm0 6.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM5.3 13l1.1.5.5 1.1-1.1 2 1.7 1.7 2-1.1 1.1.5.5 1.1h2.4l.5-1.1 1.1-.5 2 1.1 1.7-1.7-1.1-2 .5-1.1 1.1-.5v-2.4l-1.1-.5-.5-1.1 1.1-2-1.7-1.7-2 1.1-1.1-.5-.5-1.1h-2.4l-.5 1.1-1.1.5-2-1.1-1.7 1.7 1.1 2-.5 1.1-1.1.5V13z",
        );
        settingsIcon.appendChild(settingsIconPath);

        const settingsLabel = document.createElement("span");
        settingsLabel.className = "overflow-item-label";
        settingsLabel.textContent = uiLanguage === "zh" ? "设置" : "Settings";

        settingsButton.append(settingsIcon, settingsLabel);
        settingsButton.onclick = (): void => {
            onSettingsClick();
        };

        const langButton = document.createElement("button");
        langButton.type = "button";
        langButton.className = "overflow-item";
        langButton.dataset.rcOverflow = "true";
        langButton.setAttribute("role", "menuitem");
        langButton.setAttribute("aria-label", uiLanguage === "zh" ? "语言: 中文" : "Lang: English");

        const langIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        langIcon.setAttribute("viewBox", "0 0 24 24");
        langIcon.setAttribute("width", "14");
        langIcon.setAttribute("height", "14");
        langIcon.setAttribute("fill", "none");
        langIcon.setAttribute("stroke", "currentColor");
        langIcon.setAttribute("stroke-width", "2");
        langIcon.setAttribute("stroke-linecap", "round");
        langIcon.setAttribute("stroke-linejoin", "round");
        langIcon.classList.add("overflow-item-icon");

        const langIconPath1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        langIconPath1.setAttribute("cx", "12");
        langIconPath1.setAttribute("cy", "12");
        langIconPath1.setAttribute("r", "10");
        const langIconPath2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        langIconPath2.setAttribute("d", "M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z");
        langIcon.append(langIconPath1, langIconPath2);

        const langLabel = document.createElement("span");
        langLabel.className = "overflow-item-label";
        langLabel.textContent = uiLanguage === "zh" ? "语言: 中文" : "Lang: English";

        langButton.append(langIcon, langLabel);
        langButton.onclick = (): void => {
            uiLanguage = uiLanguage === "zh" ? "en" : "zh";
            syncOverflowUi();
        };

        menu.appendChild(settingsButton);
        menu.appendChild(langButton);
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

        const path = event.composedPath();
        const clickedInsideOverflow = path.some((node) => {
            if (!canUseClosest(node)) {
                return false;
            }

            return node.closest("[data-rc-overflow='true']") !== null;
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
