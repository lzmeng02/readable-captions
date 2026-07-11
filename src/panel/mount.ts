import { render } from "lit";
import { panelTemplate, panelStyles } from "./panel-view";
import type { Mode } from "./panel-view";
import { streamGeneration } from "../generation/llm-provider";
import type { GenerationMetadata, GenerationTask } from "../generation/types";
import { watchPublicSettings } from "../settings/public-client";
import type { PublicExtensionSettings } from "../settings/types";
import {
    copyMarkdownNote,
    copyMarkdownText,
    copyTranscript,
    downloadMarkdownNote,
    downloadMarkdownText,
    downloadTranscript,
} from "./export-utils";
import { fetchBilibiliSubtitleBody } from "../platforms/bilibili/api";
import { normalizeBilibiliTranscript } from "../platforms/bilibili/normalize";
import type { PanelCallbacks, PanelData, PanelHandle } from "./types";
import { createRenderScheduler } from "./render-scheduler";
import { extractVideoTitle } from "./title-utils";

const cleanupKey = Symbol("rcPanelCleanup");

type HostWithCleanup = HTMLElement & {
    [cleanupKey]?: () => void;
};

type GenerationState = {
    text: string | null;
    isGenerating: boolean;
    error: string | null;
    activeAbort: AbortController | null;
    requestVersion: number;
};

async function openExtensionOptionsPage(): Promise<void> {
    const chromeApi = (globalThis as any).chrome;
    if (chromeApi?.runtime?.openOptionsPage) {
        chromeApi.runtime.openOptionsPage();
    } else if (chromeApi?.runtime?.getURL) {
        window.open(chromeApi.runtime.getURL("options.html"), "_blank");
    }
}

function resolveInitialMode(defaultTab: PublicExtensionSettings["defaultTab"]): Mode {
    return defaultTab;
}

function createGenerationState(): GenerationState {
    return {
        text: null,
        isGenerating: false,
        error: null,
        activeAbort: null,
        requestVersion: 0,
    };
}

function isPanelGenerationMode(mode: Mode): mode is Exclude<GenerationTask, "note"> {
    return mode === "overview" || mode === "intensive";
}

function buildGenerationMetadata(data: PanelData): GenerationMetadata {
    return {
        title: extractVideoTitle(document.title),
        url: location.href,
        aid: data.aid,
        cid: data.cid,
        source: data.source,
    };
}

function getGenerationFileSuffix(mode: Exclude<Mode, "original">): string {
    return mode === "overview" ? "overview" : "intensive";
}

export function mountPanel(
    host: HTMLElement,
    initialData: PanelData,
    callbacks: PanelCallbacks = {},
): PanelHandle {
    const managedHost = host as HostWithCleanup;
    managedHost[cleanupKey]?.();

    let data = initialData;

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
    let hasLoadedSettings = false;
    let copyFormat: PublicExtensionSettings["copyFormat"] = "readable_text";
    let downloadFormat: PublicExtensionSettings["downloadFormat"] = "txt";
    let subtitleRequestId = 0;
    let subtitleController: AbortController | null = null;
    let pendingSubtitleUrl: string | null = null;
    let subtitleError: string | null = null;

    const generationStates: Record<GenerationTask, GenerationState> = {
        overview: createGenerationState(),
        intensive: createGenerationState(),
        note: createGenerationState(),
    };
    let stopWatchingSettings: (() => void) | null = null;

    const isGenerationTaskVisible = (task: GenerationTask): boolean =>
        isNoteOpen ? task === "note" : task !== "note" && mode === task;

    const invalidateSubtitleRequest = (): number => {
        subtitleRequestId += 1;
        const activeController = subtitleController;
        subtitleController = null;
        activeController?.abort();
        pendingSubtitleUrl = null;
        subtitleError = null;
        return subtitleRequestId;
    };

    const clearGenerationState = (task: GenerationTask): void => {
        const state = generationStates[task];
        state.requestVersion += 1;
        const activeAbort = state.activeAbort;
        state.activeAbort = null;
        activeAbort?.abort();
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

        state.requestVersion += 1;
        const requestVersion = state.requestVersion;
        const activeAbort = state.activeAbort;
        state.activeAbort = null;
        activeAbort?.abort();
        state.isGenerating = true;
        state.text = null;
        state.error = null;
        renderPanel();

        const isCurrentRequest = (): boolean => !isDisposed && state.requestVersion === requestVersion;
        const controller = streamGeneration({
            request: {
                transcript: data.transcript,
                task,
                metadata: buildGenerationMetadata(data),
            },
            onToken: (partialText: string) => {
                if (!isCurrentRequest()) return;
                state.text = partialText;
                if (isGenerationTaskVisible(task)) {
                    generationRenderScheduler.schedule();
                }
            },
            onDone: (fullText: string) => {
                if (!isCurrentRequest()) return;
                state.requestVersion += 1;
                state.text = fullText;
                state.isGenerating = false;
                state.activeAbort = null;
                if (isGenerationTaskVisible(task)) {
                    generationRenderScheduler.flush();
                }
            },
            onError: (err: Error) => {
                if (!isCurrentRequest()) return;
                state.requestVersion += 1;
                state.text = null;
                state.error = err.message || (uiLanguage === "zh" ? "生成内容时发生未知错误" : "Unknown error occurred during generation.");
                state.isGenerating = false;
                state.activeAbort = null;
                if (isGenerationTaskVisible(task)) {
                    generationRenderScheduler.flush();
                }
            },
        });

        if (isCurrentRequest()) {
            state.activeAbort = controller;
        } else {
            controller.abort();
        }
    };

    const maybeGenerateForMode = (): boolean => {
        if (
            data.status !== "ready"
            || !isPanelGenerationMode(mode)
            || !generationEnabled
            || !data.transcript
            || data.transcript.length === 0
        ) {
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
        downloadMarkdownNote(note, extractVideoTitle(document.title));
    };

    const handleCopy = async (): Promise<void> => {
        if (isPanelGenerationMode(mode)) {
            const text = generationStates[mode].text;
            if (!text) return;
            await copyMarkdownText(text);
            return;
        }

        if (!data.transcript || data.transcript.length === 0) return;
        await copyTranscript(data.transcript, copyFormat);
    };

    const handleDownload = (): void => {
        if (isPanelGenerationMode(mode)) {
            const text = generationStates[mode].text;
            if (!text) return;
            downloadMarkdownText(text, extractVideoTitle(document.title), getGenerationFileSuffix(mode));
            return;
        }

        if (!data.transcript || data.transcript.length === 0) return;
        downloadTranscript(data.transcript, downloadFormat, extractVideoTitle(document.title));
    };

    const handleSubtitleLanguageChange = async (newUrl: string): Promise<void> => {
        if (!newUrl || isDisposed) return;

        const requestId = invalidateSubtitleRequest();
        if (newUrl === data.subtitleUrl) {
            renderPanel();
            return;
        }

        const controller = new AbortController();
        subtitleController = controller;
        pendingSubtitleUrl = newUrl;
        renderPanel();

        try {
            const { body } = await fetchBilibiliSubtitleBody(newUrl, controller.signal);
            const transcript = normalizeBilibiliTranscript(body);
            if (!transcript || transcript.length === 0) throw new Error("Invalid subtitle body.");
            if (requestId !== subtitleRequestId || isDisposed) return;

            data = {
                ...data,
                transcript,
                subtitleUrl: newUrl,
                status: "ready",
            };
            subtitleController = null;
            pendingSubtitleUrl = null;
            subtitleError = null;
            clearAllGenerationStates();
            isNoteOpen = false;
            callbacks.onTranscriptChange?.({
                transcript,
                source: data.source,
                subtitleUrl: newUrl,
                aid: data.aid,
                cid: data.cid,
                availableSubtitles: data.availableSubtitles,
            });

            if (!maybeGenerateForMode()) {
                renderPanel();
            }
        } catch (err) {
            if (requestId !== subtitleRequestId || isDisposed) return;
            subtitleController = null;
            pendingSubtitleUrl = null;
            subtitleError = err instanceof Error && err.message
                ? err.message
                : "Failed to load subtitles.";
            renderPanel();
        }
    };

    const toggleLang = (): void => {
        uiLanguage = uiLanguage === "zh" ? "en" : "zh";
        renderPanel();
    };

    const renderPanelNow = (): void => {
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
            { pendingSubtitleUrl, subtitleError },
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

    const generationRenderScheduler = createRenderScheduler(renderPanelNow);

    const renderPanel = (): void => {
        generationRenderScheduler.cancel();
        renderPanelNow();
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

    const applyPanelSettings = (settings: PublicExtensionSettings): void => {
        if (isDisposed) {
            return;
        }

        const wasEnabled = generationEnabled;
        const nextGenerationSettingsKey = settings.generationSettingsKey;
        const generationSettingsChanged = hasLoadedSettings && generationSettingsKey !== nextGenerationSettingsKey;
        const nextDefaultMode = resolveInitialMode(settings.defaultTab);

        generationEnabled = settings.generationEnabled;
        generationSettingsKey = nextGenerationSettingsKey;
        copyFormat = settings.copyFormat;
        downloadFormat = settings.downloadFormat;

        if (!hasLoadedSettings) {
            hasLoadedSettings = true;
            hasUserSelectedMode = false;
            mode = nextDefaultMode;
        } else if (!hasUserSelectedMode) {
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
    };

    const handlePointerDown = (event: PointerEvent): void => {
        const path = event.composedPath();
        const isInside = path.some((node: any) => node?.classList?.contains("more-actions-wrapper"));
        if (!isInside) {
            renderPanel();
        }
    };

    const dispose = (): void => {
        if (isDisposed) return;
        isDisposed = true;
        generationRenderScheduler.cancel();
        invalidateSubtitleRequest();
        clearAllGenerationStates();
        stopWatchingSettings?.();
        stopWatchingSettings = null;
        document.removeEventListener("pointerdown", handlePointerDown, true);
    };

    const handle: PanelHandle = {
        updateData(next) {
            if (isDisposed) return;
            data = next;
            if (!maybeGenerateForMode()) renderPanel();
        },
        reset(next) {
            if (isDisposed) return;
            generationRenderScheduler.cancel();
            invalidateSubtitleRequest();
            clearAllGenerationStates();
            data = next;
            mode = "original";
            hasUserSelectedMode = false;
            isNoteOpen = false;
            renderPanel();
        },
        dispose,
    };

    managedHost[cleanupKey] = dispose;
    document.addEventListener("pointerdown", handlePointerDown, true);
    stopWatchingSettings = watchPublicSettings(applyPanelSettings);

    renderPanel();
    return handle;
}
