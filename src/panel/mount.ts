// src/panel/mount.ts
import { render } from "lit";
import { panelTemplate, panelStyles } from "./panel-view";
import type { Mode } from "./panel-view";
import type { Transcript } from "../transcript/model";
import { summarizeStreaming } from "../summary/llm-provider";
import { getSettings, watchSettings } from "../settings/storage";
import type { DefaultTab } from "../settings/types";
import { copyTranscript, downloadTranscript } from "./export-utils";
import { fetchBilibiliSubtitleBody } from "../platforms/bilibili/api";
import { normalizeBilibiliTranscript } from "../platforms/bilibili/normalize";

const cleanupKey = Symbol("rcPanelCleanup");

type PanelData = {
    transcript: Transcript | null;
    source: string;
    availableSubtitles?: { lan_doc: string; subtitle_url: string }[];
    subtitleUrl?: string;
    isLoading?: boolean;
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

function resolveInitialMode(defaultTab: DefaultTab, summaryEnabled: boolean): Mode {
    if (defaultTab === "summary" && !summaryEnabled) {
        return "read";
    }

    return defaultTab;
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
    let summaryEnabled = true;
    let uiLanguage: "zh" | "en" = "zh";
    let isDisposed = false;

    let summaryText: string | null = null;
    let isSummarizing = false;
    let summaryError: string | null = null;
    let activeAbort: AbortController | null = null;
    let stopWatchingSettings: (() => void) | null = null;

    const clearSummaryState = (): void => {
        activeAbort?.abort();
        activeAbort = null;
        summaryText = null;
        isSummarizing = false;
        summaryError = null;
    };

    const generateSummary = () => {
        if (!summaryEnabled || isDisposed) {
            return;
        }

        if (!data.transcript || data.transcript.length === 0) {
            summaryError = uiLanguage === "zh" ? "没有字幕数据可供总结" : "No transcript data available for summarization";
            renderPanel();
            return;
        }

        // Cancel any in-flight stream
        activeAbort?.abort();

        isSummarizing = true;
        summaryText = null;
        summaryError = null;
        renderPanel();

        activeAbort = summarizeStreaming({
            request: { transcript: data.transcript },
            onToken: (partialText: string) => {
                if (isDisposed) return;
                summaryText = partialText;
                renderPanel();
            },
            onDone: (fullText: string) => {
                if (isDisposed) return;
                summaryText = fullText;
                isSummarizing = false;
                activeAbort = null;
                renderPanel();
            },
            onError: (err: Error) => {
                if (isDisposed) return;
                summaryError = err.message || (uiLanguage === "zh" ? "生成摘要时发生未知错误" : "Unknown error occurred during summarization.");
                isSummarizing = false;
                activeAbort = null;
                renderPanel();
            },
        });
    };

    const handleRetrySummary = () => {
        summaryText = null;
        generateSummary();
    };

    const handleCopy = async (): Promise<void> => {
        if (!data.transcript || data.transcript.length === 0) return;
        const settings = await getSettings();
        await copyTranscript(data.transcript, settings.copyFormat);
    };

    const handleDownload = async (): Promise<void> => {
        if (!data.transcript || data.transcript.length === 0) return;
        const settings = await getSettings();
        // 提取 B 站视频标题，去除 " - 哔哩哔哩" 等后缀
        const videoTitle = document.title.split("_哔哩")[0]?.split("-")[0]?.trim() || "bilibili_video";
        downloadTranscript(data.transcript, settings.downloadFormat, videoTitle);
    };

    const handleSubtitleLanguageChange = async (newUrl: string): Promise<void> => {
        if (!newUrl || newUrl === data.subtitleUrl) return;

        try {
            const { body } = await fetchBilibiliSubtitleBody(newUrl);
            data.transcript = normalizeBilibiliTranscript(body);
            data.subtitleUrl = newUrl;
            console.log("[RC] Subtitle language switched, new first 3 lines:", data.transcript?.slice(0, 3).map(l => l.content));

            // 如果处于 summary 模式，重置当前总结（因为语言/内容已切换）
            if (mode === "summary") {
                summaryText = null;
                isSummarizing = false;
                summaryError = null;
                generateSummary();
            } else {
                renderPanel();
            }
        } catch (err) {
            console.error("Failed to fetch new language subtitle", err);
        }
    };

    const renderPanel = (): void => {
        if (isDisposed) {
            return;
        }

        render(panelTemplate(mode, setMode, data, openExtensionOptionsPage, uiLanguage, toggleLang, {
            isSummarizing,
            text: summaryText,
            error: summaryError,
            onRetry: handleRetrySummary
        }, handleCopy, handleDownload, handleSubtitleLanguageChange, { summaryEnabled }), shadow);
    };

    const setMode = (nextMode: Mode): void => {
        if (nextMode === "summary" && !summaryEnabled) {
            mode = "read";
            renderPanel();
            return;
        }

        mode = nextMode;
        if (mode === "summary" && !summaryText && !isSummarizing && !summaryError) {
            generateSummary();
        } else {
            renderPanel();
        }
    };

    const loadPanelSettings = async (): Promise<void> => {
        try {
            const settings = await getSettings();
            if (isDisposed) {
                return;
            }

            summaryEnabled = settings.summaryEnabled;
            mode = resolveInitialMode(settings.defaultTab, summaryEnabled);

            if (!summaryEnabled) {
                clearSummaryState();
            }

            if (mode === "summary" && data.transcript && data.transcript.length > 0) {
                generateSummary();
                return;
            }

            renderPanel();
        } catch {
            renderPanel();
        }
    };

    stopWatchingSettings = watchSettings((settings) => {
        if (isDisposed || summaryEnabled === settings.summaryEnabled) {
            return;
        }

        summaryEnabled = settings.summaryEnabled;

        if (!summaryEnabled) {
            clearSummaryState();
            if (mode === "summary") {
                mode = "read";
            }
        }

        renderPanel();
    });

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
        isDisposed = true;
        clearSummaryState();
        stopWatchingSettings?.();
        stopWatchingSettings = null;
        document.removeEventListener("pointerdown", handlePointerDown, true);
    };

    renderPanel();
    void loadPanelSettings();
}
