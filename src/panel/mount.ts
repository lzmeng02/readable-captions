// src/panel/mount.ts
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

// 获取 Chrome Extension API 以打开设置页
async function openExtensionOptionsPage(): Promise<void> {
    const chromeApi = (globalThis as any).chrome;
    if (chromeApi?.runtime?.openOptionsPage) {
        chromeApi.runtime.openOptionsPage();
    } else if (chromeApi?.runtime?.getURL) {
        window.open(chromeApi.runtime.getURL("options.html"), "_blank");
    }
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
    let uiLanguage: "zh" | "en" = "zh";

    const renderPanel = (): void => {
        // 将 openExtensionOptionsPage 作为回调传入
        render(panelTemplate(mode, setMode, data, openExtensionOptionsPage, uiLanguage, toggleLang), shadow);
    };

    const setMode = (nextMode: Mode): void => {
        mode = nextMode;
        renderPanel();
    };

    const toggleLang = (): void => {
        uiLanguage = uiLanguage === "zh" ? "en" : "zh";
        renderPanel();
    };

    // 处理点击外部关闭菜单的逻辑
    const handlePointerDown = (event: PointerEvent): void => {
        const path = event.composedPath();
        const isInside = path.some((node: any) => node?.classList?.contains('more-actions-wrapper'));
        if (!isInside) {
            // 通过触发 setMode 重新渲染来使得内部的 isMenuOpen 状态重置 (可以在 panel-view 暴露一个 close 方法，或者简单的重新渲染)
            renderPanel(); 
        }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    managedHost[cleanupKey] = (): void => {
        document.removeEventListener("pointerdown", handlePointerDown, true);
    };

    renderPanel();
}