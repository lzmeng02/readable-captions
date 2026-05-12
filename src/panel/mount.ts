import { render } from "lit";
import { panelTemplate, panelStyles } from "./panel-view";
import type { Mode } from "./panel-view";
import type { Transcript } from "../transcript/model";
import { streamGeneration } from "../generation/llm-provider";
import type { GenerationMetadata, GenerationTask } from "../generation/types";
import { getSettings, watchSettings } from "../settings/storage";
import type { DefaultTab, ExtensionSettings } from "../settings/types";
import {
    copyMarkdownNote,
    copyTranscript,
    downloadMarkdownNote,
    downloadTranscript,
} from "./export-utils";
import { fetchBilibiliSubtitleBody } from "../platforms/bilibili/api";
import { normalizeBilibiliTranscript } from "../platforms/bilibili/normalize";

const cleanupKey = Symbol("rcPanelCleanup");

type PanelData = {
    transcript: Transcript | null;
    source: string;
    availableSubtitles?: { lan_doc: string; subtitle_url: string }[];
    subtitleUrl?: string;
    aid?: number;
    cid?: number;
    isLoading?: boolean;
};

type HostWithCleanup = HTMLElement & {
    [cleanupKey]?: () => void;
};

type GenerationState = {
    text: string | null;
    isGenerating: boolean;
    error: string | null;
    activeAbort: AbortController | null;
};

async function openExtensionOptionsPage(): Promise<void> {
    const chromeApi = (globalThis as any).chrome;
    if (chromeApi?.runtime?.openOptionsPage) {
        chromeApi.runtime.openOptionsPage();
    } else if (chromeApi?.runtime?.getURL) {
        window.open(chromeApi.runtime.getURL("options.html"), "_blank");
    }
}

function resolveInitialMode(defaultTab: DefaultTab): Mode {
    return defaultTab;
}

function getGenerationSettingsKey(settings: ExtensionSettings): string {
    return JSON.stringify({
        provider: settings.generationProvider,
        models: settings.generationModels,
        prompts: settings.generationPromptTemplates,
    });
}

function createGenerationState(): GenerationState {
    return {
        text: null,
        isGenerating: false,
        error: null,
        activeAbort: null,
    };
}

function isPanelGenerationMode(mode: Mode): mode is Exclude<GenerationTask, "note"> {
    return mode === "overview" || mode === "intensive";
}

function extractVideoTitle(): string {
    return document.title.split("_哔哩")[0]?.split("-")[0]?.trim() || "bilibili_video";
}

function buildGenerationMetadata(data: PanelData): GenerationMetadata {
    return {
        title: extractVideoTitle(),
        url: location.href,
        aid: data.aid,
        cid: data.cid,
        source: data.source,
    };
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

    let mode: Mode = "original";
    let generationEnabled = true;
    let generationSettingsKey = "";
    let hasUserSelectedMode = false;
    let uiLanguage: "zh" | "en" = "zh";
    let isDisposed = false;
    let isNoteOpen = false;

    const generationStates: Record<GenerationTask, GenerationState> = {
        overview: createGenerationState(),
        intensive: createGenerationState(),
        note: createGenerationState(),
    };
    let stopWatchingSettings: (() => void) | null = null;

    const clearGenerationState = (task: GenerationTask): void => {
        const state = generationStates[task];
        state.activeAbort?.abort();
        state.activeAbort = null;
        state.text = null;
        state.isGenerating = false;
        state.error = null;
    };

    const clearAllGenerationStates = (): void => {
        clearGenerationState("overview");
        clearGenerationState("intensive");
        clearGenerationState("note");
    };

    const generate = (task: GenerationTask): void => {
        if (!generationEnabled || isDisposed) {
            return;
        }

        const state = generationStates[task];

        if (!data.transcript || data.transcript.length === 0) {
            state.error = uiLanguage === "zh" ? "没有字幕数据可供生成" : "No transcript data available for generation.";
            renderPanel();
            return;
        }

        state.activeAbort?.abort();
        state.isGenerating = true;
        state.text = null;
        state.error = null;
        renderPanel();

        state.activeAbort = streamGeneration({
            request: {
                transcript: data.transcript,
                task,
                metadata: buildGenerationMetadata(data),
            },
            onToken: (partialText: string) => {
                if (isDisposed) return;
                state.text = partialText;
                renderPanel();
            },
            onDone: (fullText: string) => {
                if (isDisposed) return;
                state.text = fullText;
                state.isGenerating = false;
                state.activeAbort = null;
                renderPanel();
            },
            onError: (err: Error) => {
                if (isDisposed) return;
                state.error = err.message || (uiLanguage === "zh" ? "生成内容时发生未知错误" : "Unknown error occurred during generation.");
                state.isGenerating = false;
                state.activeAbort = null;
                renderPanel();
            },
        });
    };

    const maybeGenerateForMode = (): boolean => {
        if (!isPanelGenerationMode(mode) || !generationEnabled || !data.transcript || data.transcript.length === 0) {
            return false;
        }

        const state = generationStates[mode];
        if (!state.text && !state.isGenerating && !state.error) {
            generate(mode);
            return true;
        }

        return false;
    };

    const handleRetryGeneration = (): void => {
        if (!isPanelGenerationMode(mode)) {
            return;
        }

        clearGenerationState(mode);
        generate(mode);
    };

    const handleOpenNote = (): void => {
        isNoteOpen = true;
        const state = generationStates.note;
        if (generationEnabled && !state.text && !state.isGenerating && !state.error) {
            generate("note");
            return;
        }
        renderPanel();
    };

    const handleRetryNote = (): void => {
        isNoteOpen = true;
        clearGenerationState("note");
        generate("note");
    };

    const handleCloseNote = (): void => {
        isNoteOpen = false;
        renderPanel();
    };

    const handleCopyNote = async (): Promise<void> => {
        const note = generationStates.note.text;
        if (!note) return;
        await copyMarkdownNote(note);
    };

    const handleDownloadNote = (): void => {
        const note = generationStates.note.text;
        if (!note) return;
        downloadMarkdownNote(note, extractVideoTitle());
    };

    const handleCopy = async (): Promise<void> => {
        if (!data.transcript || data.transcript.length === 0) return;
        const settings = await getSettings();
        await copyTranscript(data.transcript, settings.copyFormat);
    };

    const handleDownload = async (): Promise<void> => {
        if (!data.transcript || data.transcript.length === 0) return;
        const settings = await getSettings();
        downloadTranscript(data.transcript, settings.downloadFormat, extractVideoTitle());
    };

    const handleSubtitleLanguageChange = async (newUrl: string): Promise<void> => {
        if (!newUrl || newUrl === data.subtitleUrl) return;

        try {
            const { body } = await fetchBilibiliSubtitleBody(newUrl);
            data.transcript = normalizeBilibiliTranscript(body);
            data.subtitleUrl = newUrl;
            clearAllGenerationStates();
            isNoteOpen = false;

            if (!maybeGenerateForMode()) {
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

        const activeGenerationState = isPanelGenerationMode(mode)
            ? generationStates[mode]
            : generationStates.overview;
        const noteGenerationState = generationStates.note;

        render(panelTemplate(
            mode,
            setMode,
            data,
            openExtensionOptionsPage,
            uiLanguage,
            toggleLang,
            {
                isGenerating: activeGenerationState.isGenerating,
                text: activeGenerationState.text,
                error: activeGenerationState.error,
                onRetry: handleRetryGeneration,
            },
            handleCopy,
            handleDownload,
            handleSubtitleLanguageChange,
            { generationEnabled },
            {
                isOpen: isNoteOpen,
                isGenerating: noteGenerationState.isGenerating,
                text: noteGenerationState.text,
                error: noteGenerationState.error,
                onRetry: handleRetryNote,
                onOpen: handleOpenNote,
                onClose: handleCloseNote,
                onCopy: handleCopyNote,
                onDownload: handleDownloadNote,
            },
        ), shadow);
    };

    const setMode = (nextMode: Mode, userSelected = false): void => {
        if (userSelected && nextMode !== mode) {
            hasUserSelectedMode = true;
        }

        mode = nextMode;
        if (maybeGenerateForMode()) {
            return;
        }
        renderPanel();
    };

    const loadPanelSettings = async (): Promise<void> => {
        try {
            const settings = await getSettings();
            if (isDisposed) {
                return;
            }

            generationEnabled = settings.generationEnabled;
            generationSettingsKey = getGenerationSettingsKey(settings);
            hasUserSelectedMode = false;
            mode = resolveInitialMode(settings.defaultTab);

            if (!generationEnabled) {
                clearAllGenerationStates();
            }

            if (!maybeGenerateForMode()) {
                renderPanel();
            }
        } catch {
            renderPanel();
        }
    };

    stopWatchingSettings = watchSettings((settings) => {
        if (isDisposed) {
            return;
        }

        const wasEnabled = generationEnabled;
        const nextGenerationSettingsKey = getGenerationSettingsKey(settings);
        const generationSettingsChanged = generationSettingsKey !== nextGenerationSettingsKey;
        const nextDefaultMode = resolveInitialMode(settings.defaultTab);

        generationEnabled = settings.generationEnabled;
        generationSettingsKey = nextGenerationSettingsKey;

        if (!hasUserSelectedMode) {
            mode = nextDefaultMode;
        }

        if (!generationEnabled) {
            clearAllGenerationStates();
        } else if (generationSettingsChanged) {
            clearAllGenerationStates();
            if (!maybeGenerateForMode()) {
                renderPanel();
            }
            return;
        } else if (!wasEnabled) {
            if (!maybeGenerateForMode()) {
                renderPanel();
            }
            return;
        } else if (maybeGenerateForMode()) {
            return;
        }

        renderPanel();
    });

    const toggleLang = (): void => {
        uiLanguage = uiLanguage === "zh" ? "en" : "zh";
        renderPanel();
    };

    const handlePointerDown = (event: PointerEvent): void => {
        const path = event.composedPath();
        const isInside = path.some((node: any) => node?.classList?.contains("more-actions-wrapper"));
        if (!isInside) {
            renderPanel();
        }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    managedHost[cleanupKey] = (): void => {
        isDisposed = true;
        clearAllGenerationStates();
        stopWatchingSettings?.();
        stopWatchingSettings = null;
        document.removeEventListener("pointerdown", handlePointerDown, true);
    };

    renderPanel();
    void loadPanelSettings();
}
