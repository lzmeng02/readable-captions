// src/panel/mount.ts
import { render } from "lit";
import { panelTemplate, panelStyles } from "./panel-view";
import type { Mode } from "./panel-view";
import type { Transcript } from "../transcript/model";
import { llmSummaryProvider } from "../summary/llm-provider";
import type { SummaryResult } from "../summary/types";
import { getSettings } from "../settings/storage";
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
    
    let summaryResult: SummaryResult | null = null;
    let isSummarizing = false;
    let summaryError: string | null = null;

    const generateSummary = () => {
        if (!data.transcript || data.transcript.length === 0) {
            summaryError = uiLanguage === "zh" ? "没有字幕数据可供总结" : "No transcript data available for summarization";
            renderPanel();
            return;
        }

        isSummarizing = true;
        summaryError = null;
        renderPanel();

        llmSummaryProvider.summarize({ transcript: data.transcript })
            .then(res => {
                summaryResult = res;
            })
            .catch(err => {
                summaryError = err.message || (uiLanguage === "zh" ? "生成摘要时发生未知错误" : "Unknown error occurred during summarization.");
            })
            .finally(() => {
                isSummarizing = false;
                renderPanel();
            });
    };

    const handleRetrySummary = () => {
        summaryResult = null;
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
            
            // 如果处于 summary 模式，重置当前总结（因为语言/内容已切换）
            if (mode === "summary") {
                summaryResult = null;
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
        // 将 openExtensionOptionsPage 作为回调传入
        render(panelTemplate(mode, setMode, data, openExtensionOptionsPage, uiLanguage, toggleLang, {
            isSummarizing,
            result: summaryResult,
            error: summaryError,
            onRetry: handleRetrySummary
        }, handleCopy, handleDownload, handleSubtitleLanguageChange), shadow);
    };

    const setMode = (nextMode: Mode): void => {
        mode = nextMode;
        if (mode === "summary" && !summaryResult && !isSummarizing && !summaryError) {
            generateSummary();
        } else {
            renderPanel();
        }
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