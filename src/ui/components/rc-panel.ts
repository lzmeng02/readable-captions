import { html, nothing } from "lit";
import { BUILTIN_TABS } from "../../services/settings/schema";
import type {
    AppSettings,
    LoadStatus,
    PanelPlacement,
    PlatformCapabilities,
    SummaryState,
    TabDefinition,
    TabId,
    TranscriptBundle,
} from "../../shared/types";
import { readViewTemplate } from "./rc-read-view";
import { settingsModalTemplate } from "./rc-settings-modal";
import { summaryViewTemplate } from "./rc-summary-view";
import { tabbarTemplate } from "./rc-tabbar";
import { transcriptListTemplate } from "./rc-transcript-list";

export interface PanelViewModel {
    collapsed: boolean;
    status: LoadStatus;
    errorMessage: string | null;
    currentTab: TabId;
    availableTabs: readonly TabDefinition[];
    transcript: TranscriptBundle | null;
    summary: SummaryState;
    settings: AppSettings;
    settingsOpen: boolean;
    placement: PanelPlacement;
    capabilities: PlatformCapabilities;
}

export interface PanelHandlers {
    onToggleCollapse: () => void;
    onSelectTab: (tab: TabId) => void;
    onToggleSettings: () => void;
    onCloseSettings: () => void;
    onSaveSettings: (event: Event) => void;
    onCopyTranscript: () => void;
    onDownloadTranscript: () => void;
    onGenerateSummary: () => void;
    onJumpTo: (seconds: number) => void;
    onToggleReaderMode: () => void;
}

function sourceLabel(bundle: TranscriptBundle | null): string {
    if (!bundle) {
        return "未知来源";
    }

    switch (bundle.source) {
        case "human_view":
            return "人工字幕";
        case "ai_wbi":
            return "AI 字幕";
        default:
            return "未找到字幕";
    }
}

function renderMetaBar(bundle: TranscriptBundle | null) {
    const lineCount = bundle?.lines.length ?? 0;

    return html`
        <div class="meta-bar">
            <div class="meta-info">
                <span class="meta-dot"></span>
                来源：${sourceLabel(bundle)} · 共 ${lineCount} 条
            </div>
        </div>
    `;
}

function renderBody(state: PanelViewModel, handlers: PanelHandlers) {
    if (state.status === "loading") {
        return html`<div class="placeholder">正在加载字幕和页面挂载点...</div>`;
    }

    if (state.status === "error") {
        return html`<div class="placeholder error-state">${state.errorMessage ?? "加载失败"}</div>`;
    }

    if (!state.transcript || state.transcript.lines.length === 0) {
        return html`<div class="empty-state">当前视频没有可用字幕</div>`;
    }

    if (state.currentTab === "summary") {
        return summaryViewTemplate(state.transcript, state.summary, state.settings, {
            onGenerateSummary: handlers.onGenerateSummary,
            onJumpTo: handlers.onJumpTo,
            onOpenSettings: handlers.onToggleSettings,
        });
    }

    const content = state.currentTab === "read"
        ? readViewTemplate(state.transcript.lines, handlers.onJumpTo)
        : transcriptListTemplate(
            state.transcript.lines,
            state.currentTab === "captions" ? "captions" : "transcript",
            handlers.onJumpTo,
        );

    return html`${renderMetaBar(state.transcript)}${content}`;
}

function tabDefinitions(settings: AppSettings): readonly TabDefinition[] {
    return BUILTIN_TABS.filter((tab) => settings.visibleTabs.includes(tab.id));
}

export function panelTemplate(state: PanelViewModel, handlers: PanelHandlers) {
    const tabs = tabDefinitions(state.settings);

    return html`
        <div class="panel ${state.collapsed ? "collapsed" : ""} ${state.placement === "reader" ? "reader-mode" : ""}">
            <header class="header">
                <div
                    class="title"
                    title=${state.collapsed ? "点击展开面板" : "点击收起面板"}
                    @click=${handlers.onToggleCollapse}
                >
                    <div class="name">可读字幕</div>
                    <div class="sub">Readable Captions</div>
                </div>

                <div class="actions">
                    ${state.capabilities.readerMode ? html`
                        <button
                            class="icon-btn ${state.placement === "reader" ? "active" : ""}"
                            title=${state.placement === "reader" ? "退出阅读模式" : "进入阅读模式"}
                            @click=${handlers.onToggleReaderMode}
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-4 4v-4H5a2 2 0 0 1-2-2Z"></path>
                                <path d="M8 9h8"></path>
                                <path d="M8 13h5"></path>
                            </svg>
                        </button>
                    ` : nothing}
                    <button class="icon-btn" title="下载字幕" @click=${handlers.onDownloadTranscript}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                    <button class="icon-btn" title="复制字幕" @click=${handlers.onCopyTranscript}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    <button class="icon-btn" title="设置" @click=${handlers.onToggleSettings}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.26.3.46.64.6 1 .1.31.12.63.09.96A2 2 0 1 1 21 13h-.09c-.33-.03-.65 0-.96.09-.36.14-.7.34-1 .6Z"></path>
                        </svg>
                    </button>
                    <button class="icon-btn collapse-btn" title=${state.collapsed ? "展开面板" : "收起面板"} @click=${handlers.onToggleCollapse}>
                        ${state.collapsed
                            ? html`<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`
                            : html`<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`}
                    </button>
                </div>
            </header>

            ${state.settingsOpen ? settingsModalTemplate(state.settings, handlers.onCloseSettings, handlers.onSaveSettings) : nothing}

            ${state.collapsed
                ? nothing
                : html`
                    ${tabbarTemplate(state.currentTab, tabs, handlers.onSelectTab)}
                    <main class="content">
                        ${renderBody({
                            ...state,
                            availableTabs: tabs,
                        }, handlers)}
                    </main>
                `}
        </div>
    `;
}
