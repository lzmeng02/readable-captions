import { css, html } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { TranscriptLine } from "../transcript/model";

export type Mode = "overview" | "intensive" | "original";

export type GenerationUiState = {
    isGenerating: boolean;
    text: string | null;
    error: string | null;
    onRetry: () => void;
};

export type NoteUiState = GenerationUiState & {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
    onCopy: () => void | Promise<void>;
    onDownload: () => void | Promise<void>;
};

export type PanelUiOptions = {
    generationEnabled: boolean;
};

let isCollapsed = false;
let isMenuOpen = false;

export function resetPanelUiState(): void {
    isCollapsed = false;
    isMenuOpen = false;
}

export function panelTemplate(
    mode: Mode,
    setMode: (m: Mode, userSelected?: boolean) => void,
    data: {
        transcript: TranscriptLine[] | null;
        source: string;
        availableSubtitles?: { lan_doc: string; subtitle_url: string }[];
        subtitleUrl?: string;
        isLoading?: boolean;
        errorMessage?: string;
    },
    onSettingsClick: () => void,
    currentLang: "zh" | "en" = "zh",
    onLangClick?: () => void,
    generationState?: GenerationUiState,
    onCopy?: () => void | Promise<void>,
    onDownload?: () => void | Promise<void>,
    onSubtitleLanguageChange?: (url: string) => void,
    uiOptions: PanelUiOptions = { generationEnabled: true },
    noteState?: NoteUiState,
) {
    const generationEnabled = uiOptions.generationEnabled;

    const toggleCollapse = () => {
        isCollapsed = !isCollapsed;
        setMode(mode);
    };

    const toggleMenu = (event: Event) => {
        event.stopPropagation();
        isMenuOpen = !isMenuOpen;
        setMode(mode);
    };

    const closeMenu = (event: Event) => {
        event.stopPropagation();
        isMenuOpen = false;
        setMode(mode);
    };

    const handleSettingsClick = (event: Event) => {
        event.stopPropagation();
        isMenuOpen = false;
        setMode(mode);
        onSettingsClick();
    };

    const handleLangClick = (event: Event) => {
        event.stopPropagation();
        onLangClick?.();
    };

    const handleNoteClick = (event: Event) => {
        event.stopPropagation();
        isMenuOpen = false;
        noteState?.onOpen();
    };

    const handleActionClick = (event: Event, action?: () => void | Promise<void>) => {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(action?.()).catch((err) => {
            console.error("Readable Captions action failed", err);
        });
    };

    const tab = (id: Mode, label: string) => {
        const active = mode === id;
        return html`
            <button class="tab ${active ? "active" : ""}" @click=${() => setMode(id, true)}>
                ${label}
            </button>
        `;
    };

    const fmt = (sec: number) => {
        const s = Math.max(0, Math.floor(sec));
        const mm = String(Math.floor(s / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        return `${mm}:${ss}`;
    };

    const jump = (sec: number) => {
        const video = document.querySelector("video") as HTMLVideoElement | null;
        if (!video) return;
        video.currentTime = sec;
        video.play().catch(() => { });
    };

    const parseTimestamp = (text: string): number | null => {
        const match = text.match(/\[(\d{1,3}):([0-5]\d)\]/) ?? text.match(/\b(\d{1,3}):([0-5]\d)\b/);
        if (!match) {
            return null;
        }

        return Number(match[1]) * 60 + Number(match[2]);
    };

    const handleMarkdownClick = (event: Event) => {
        const target = event.target as HTMLElement | null;
        const text = target?.textContent ?? "";
        const seconds = parseTimestamp(text);
        if (seconds !== null) {
            jump(seconds);
        }
    };

    const renderMarkdown = (text: string) => {
        const rawHtml = marked.parse(text) as string;
        return unsafeHTML(DOMPurify.sanitize(rawHtml));
    };

    const emptyState = () => {
        if (data.isLoading) {
            return html`
                <div class="empty-state">
                    <div class="bili-loading">
                        <svg class="circular" viewBox="25 25 50 50">
                            <circle class="path" cx="50" cy="50" r="20" fill="none" stroke-width="4" stroke-miterlimit="10"></circle>
                        </svg>
                        <p>${currentLang === "zh" ? "正在加载字幕..." : "Loading captions..."}</p>
                    </div>
                </div>
            `;
        }

        if (data.errorMessage) {
            return html`
                <div class="empty-state error-state">
                    <p class="error-copy">${data.errorMessage}</p>
                </div>
            `;
        }

        return html`
            <div class="empty-state">
                <svg viewBox="0 0 48 48" width="64" height="64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 8H38C39.1046 8 40 8.89543 40 10V38C40 39.1046 39.1046 40 38 40H10C8.89543 40 8 39.1046 8 38V10C8 8.89543 8.89543 8 10 8Z" fill="#F4F5F7" stroke="#E3E5E7" stroke-width="2"/>
                    <path d="M16 20H32" stroke="#C9CCD0" stroke-width="2" stroke-linecap="round"/>
                    <path d="M16 28H26" stroke="#C9CCD0" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <p>${currentLang === "zh" ? "当前视频没有可用字幕" : "No captions available for this video"}</p>
            </div>
        `;
    };

    const renderMetaBar = () => {
        const transcript = data.transcript;
        const count = transcript ? transcript.length : 0;

        let sourceLabel = "未知";
        if (currentLang === "zh") {
            sourceLabel = data.source === "human_view" ? "人工字幕" : data.source === "ai_wbi" ? "AI 字幕" : "未知";
        } else {
            sourceLabel = data.source === "human_view" ? "Human CC" : data.source === "ai_wbi" ? "AI Auto" : "Unknown";
        }

        const hasSubtitles = data.availableSubtitles && data.availableSubtitles.length > 0;

        return html`
            <div class="meta-bar">
                <div class="meta-info">
                    ${currentLang === "zh" ? "来源：" : "Source: "}${sourceLabel}
                    <span class="meta-divider">|</span>
                    ${currentLang === "zh" ? "共" : "Total"} ${count} ${currentLang === "zh" ? "条" : "lines"}
                </div>

                ${hasSubtitles ? html`
                    <div class="lang-selector">
                        <select
                            class="lang-select"
                            title="${currentLang === "zh" ? "切换语言" : "Switch Language"}"
                            @change=${(event: Event) => {
                                const target = event.target as HTMLSelectElement;
                                onSubtitleLanguageChange?.(target.value);
                            }}
                        >
                            ${data.availableSubtitles!.map((subtitle) => html`
                                <option value="${subtitle.subtitle_url}" ?selected=${subtitle.subtitle_url === data.subtitleUrl}>
                                    ${subtitle.lan_doc}
                                </option>
                            `)}
                        </select>
                        <svg class="lang-arrow" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                ` : ""}
            </div>
        `;
    };

    const renderTranscriptList = () => {
        const transcript = data.transcript;
        if (!transcript || transcript.length === 0) return emptyState();

        return html`
            ${renderMetaBar()}
            <div class="list">
                ${transcript.map((line) => html`
                    <button class="line" @click=${() => jump(line.from)}>
                        <span class="t">${fmt(line.from)}</span>
                        <span class="c">${line.content}</span>
                    </button>
                `)}
            </div>
        `;
    };

    const renderDisabledGeneration = () => html`
        <div class="empty-state">
            <p>${currentLang === "zh" ? "AI 生成已关闭" : "AI generation is disabled"}</p>
            <button class="retry-btn" @click=${onSettingsClick}>
                ${currentLang === "zh" ? "打开设置" : "Open Settings"}
            </button>
        </div>
    `;

    const renderGenerationView = (title: string, loadingText: string) => {
        if (!generationEnabled) {
            return renderDisabledGeneration();
        }

        if (!data.transcript || data.transcript.length === 0) {
            return emptyState();
        }

        if (generationState?.isGenerating && generationState.text) {
            return html`
                <div class="generation-container">
                    <div class="generation-header">
                        <h3 class="generation-title">${title}</h3>
                        <span class="streaming-indicator">
                            <span class="streaming-dot"></span>
                            ${currentLang === "zh" ? "生成中" : "Generating"}
                        </span>
                    </div>
                    <div class="generation-desc markdown-body" @click=${handleMarkdownClick}>
                        ${renderMarkdown(generationState.text)}
                    </div>
                </div>
            `;
        }

        if (generationState?.isGenerating) {
            return html`
                <div class="generation-container loading-state">
                    <div class="bili-loading">
                        <svg class="circular" viewBox="25 25 50 50">
                            <circle class="path" cx="50" cy="50" r="20" fill="none" stroke-width="4" stroke-miterlimit="10"></circle>
                        </svg>
                        <p>${loadingText}</p>
                    </div>
                </div>
            `;
        }

        if (generationState?.error) {
            return html`
                <div class="generation-container error-state">
                    <svg viewBox="0 0 24 24" width="32" height="32" stroke="#ff6666" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <p class="error-copy">${generationState.error}</p>
                    <button class="retry-btn" @click=${generationState.onRetry}>
                        ${currentLang === "zh" ? "重试" : "Retry"}
                    </button>
                </div>
            `;
        }

        if (generationState?.text) {
            return html`
                <div class="generation-container">
                    <div class="generation-header">
                        <h3 class="generation-title">${title}</h3>
                        <button class="regenerate-btn" @click=${generationState.onRetry} title="${currentLang === "zh" ? "基于当前字幕重新生成" : "Regenerate with current captions"}">
                            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
                            ${currentLang === "zh" ? "重新生成" : "Regenerate"}
                        </button>
                    </div>
                    <div class="generation-desc markdown-body" @click=${handleMarkdownClick}>
                        ${renderMarkdown(generationState.text)}
                    </div>
                </div>
            `;
        }

        return emptyState();
    };

    const renderOverviewView = () => renderGenerationView(
        currentLang === "zh" ? "总览" : "Overview",
        currentLang === "zh" ? "正在判断这个视频是否值得看..." : "Deciding how this video should be read...",
    );

    const renderIntensiveView = () => renderGenerationView(
        currentLang === "zh" ? "精读稿" : "Intensive Read",
        currentLang === "zh" ? "正在整理高信息密度阅读稿..." : "Generating intensive read...",
    );

    const renderNoteDrawer = () => {
        if (!noteState?.isOpen) {
            return "";
        }

        const noteBody = () => {
            if (!generationEnabled) {
                return renderDisabledGeneration();
            }

            if (noteState.isGenerating && noteState.text) {
                return html`
                    <div class="note-status-row">
                        <span class="streaming-indicator"><span class="streaming-dot"></span>${currentLang === "zh" ? "生成中" : "Generating"}</span>
                    </div>
                    <div class="note-preview markdown-body" @click=${handleMarkdownClick}>${renderMarkdown(noteState.text)}</div>
                `;
            }

            if (noteState.isGenerating) {
                return html`
                    <div class="note-loading">
                        <div class="bili-loading">
                            <svg class="circular" viewBox="25 25 50 50">
                                <circle class="path" cx="50" cy="50" r="20" fill="none" stroke-width="4" stroke-miterlimit="10"></circle>
                            </svg>
                            <p>${currentLang === "zh" ? "正在生成 Markdown Note..." : "Generating Markdown Note..."}</p>
                        </div>
                    </div>
                `;
            }

            if (noteState.error) {
                return html`
                    <div class="note-loading">
                        <p class="error-copy">${noteState.error}</p>
                        <button class="retry-btn" @click=${noteState.onRetry}>${currentLang === "zh" ? "重试" : "Retry"}</button>
                    </div>
                `;
            }

            if (noteState.text) {
                return html`
                    <div class="note-actions">
                        <button class="note-action-btn primary" @click=${(event: Event) => handleActionClick(event, noteState.onCopy)}>${currentLang === "zh" ? "复制 Markdown" : "Copy Markdown"}</button>
                        <button class="note-action-btn" @click=${(event: Event) => handleActionClick(event, noteState.onDownload)}>${currentLang === "zh" ? "下载 .md" : "Download .md"}</button>
                    </div>
                    <div class="note-preview markdown-body" @click=${handleMarkdownClick}>${renderMarkdown(noteState.text)}</div>
                `;
            }

            return html`
                <div class="note-loading">
                    <button class="retry-btn" @click=${noteState.onRetry}>${currentLang === "zh" ? "生成 Note" : "Generate Note"}</button>
                </div>
            `;
        };

        return html`
            <section class="note-drawer">
                <div class="note-header">
                    <h3>${currentLang === "zh" ? "Markdown Note" : "Markdown Note"}</h3>
                    <button class="note-close" @click=${noteState.onClose} title="${currentLang === "zh" ? "关闭" : "Close"}">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                ${noteBody()}
            </section>
        `;
    };

    const content = () => {
        switch (mode) {
            case "overview": return renderOverviewView();
            case "intensive": return renderIntensiveView();
            case "original": return renderTranscriptList();
        }
    };

    return html`
        <div class="panel ${isCollapsed ? "collapsed" : ""}">
            <header class="header">
                <div class="title-area" @click=${toggleCollapse} title=${isCollapsed ? (currentLang === "zh" ? "点击展开面板" : "Click to expand") : (currentLang === "zh" ? "点击收起面板" : "Click to collapse")}>
                    <span class="title">${currentLang === "zh" ? "可读字幕" : "Readable Captions"}</span>
                    <span class="sub-title">${currentLang === "zh" ? "Readable Captions" : ""}</span>
                </div>

                <div class="actions">
                    <button class="icon-btn" title="${currentLang === "zh" ? "下载当前内容" : "Download current content"}" @click=${(event: Event) => handleActionClick(event, onDownload)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                    <button class="icon-btn" title="${currentLang === "zh" ? "复制当前内容" : "Copy current content"}" @click=${(event: Event) => handleActionClick(event, onCopy)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>

                    <div class="more-actions-wrapper">
                        <button class="icon-btn ${isMenuOpen ? "active" : ""}" title="${currentLang === "zh" ? "更多" : "More"}" @click=${toggleMenu}>
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                        </button>

                        ${isMenuOpen ? html`
                            <div class="menu-overlay" @click=${closeMenu}></div>
                            <div class="overflow-menu">
                                <button class="overflow-item" @click=${handleNoteClick}>
                                    <svg class="overflow-item-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
                                    <span class="overflow-item-label">${currentLang === "zh" ? "导出 Markdown Note" : "Export Markdown Note"}</span>
                                </button>
                                <button class="overflow-item" @click=${handleSettingsClick}>
                                    <svg class="overflow-item-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                                    <span class="overflow-item-label">${currentLang === "zh" ? "设置" : "Settings"}</span>
                                </button>
                                <button class="overflow-item" @click=${handleLangClick}>
                                    <svg class="overflow-item-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                    <span class="overflow-item-label">${currentLang === "zh" ? "语言：中文" : "Lang: English"}</span>
                                </button>
                            </div>
                        ` : ""}
                    </div>
                </div>
            </header>

            ${!isCollapsed ? html`
                <nav class="bili-tabs">
                    ${tab("original", currentLang === "zh" ? "原文" : "Original")}
                    ${tab("intensive", currentLang === "zh" ? "精读" : "Intensive")}
                    ${tab("overview", currentLang === "zh" ? "总览" : "Overview")}
                </nav>

                <main class="content">${content()}</main>
                ${renderNoteDrawer()}
            ` : ""}
        </div>
    `;
}

export const panelStyles = css`
    :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        display: block;
        box-sizing: border-box;
    }

    * {
        box-sizing: border-box;
    }

    button {
        font-family: inherit;
    }

    .panel {
        height: 540px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        border-radius: 6px;
        background: #ffffff;
        border: 1px solid #e3e5e7;
        overflow: hidden;
        color: #18191c;
        position: relative;
    }

    .panel.collapsed {
        height: auto;
    }

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        height: 46px;
        flex-shrink: 0;
    }

    .title-area {
        cursor: pointer;
        user-select: none;
        display: flex;
        align-items: baseline;
        gap: 8px;
        flex: 1;
    }

    .title {
        font-size: 15px;
        font-weight: 600;
        color: #18191c;
    }

    .sub-title {
        font-size: 12px;
        color: #bcc0c5;
        font-weight: 400;
    }

    .actions {
        display: flex;
        align-items: center;
        gap: 4px;
        position: relative;
    }

    .icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 4px;
        border: none;
        background: transparent;
        color: #9499a0;
        cursor: pointer;
        transition: all 0.2s;
    }

    .icon-btn:hover {
        background: #f4f5f7;
        color: #18191c;
    }

    .icon-btn.active {
        background: #e3e5e7;
        color: #18191c;
    }

    .more-actions-wrapper {
        position: relative;
    }

    .menu-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 90;
        cursor: default;
    }

    .overflow-menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        width: 190px;
        padding: 6px;
        border: 1px solid #e3e5e7;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
        z-index: 100;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .overflow-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #18191c;
        cursor: pointer;
        font-size: 13px;
        line-height: 1.4;
        min-height: 34px;
        padding: 6px 10px;
        text-align: left;
        transition: background-color 0.2s, color 0.2s;
    }

    .overflow-item-icon {
        flex: 0 0 auto;
        color: #9499a0;
        transition: color 0.2s;
    }

    .overflow-item-label {
        flex: 1 1 auto;
        white-space: nowrap;
    }

    .overflow-item:hover,
    .overflow-item:focus-visible {
        background: #f4f5f7;
        color: #00aeec;
        outline: none;
    }

    .overflow-item:hover .overflow-item-icon,
    .overflow-item:focus-visible .overflow-item-icon {
        color: #00aeec;
    }

    .bili-tabs {
        display: flex;
        padding: 0 8px;
        border-bottom: 1px solid #e3e5e7;
        flex-shrink: 0;
    }

    .bili-tabs .tab {
        flex: 1;
        text-align: center;
        background: transparent;
        border: none;
        padding: 10px 0;
        font-size: 14px;
        font-family: inherit;
        white-space: nowrap;
        color: #61666d;
        cursor: pointer;
        position: relative;
        border-radius: 4px 4px 0 0;
        transition: color 0.2s, background-color 0.2s;
    }

    .bili-tabs .tab:hover {
        color: #18191c;
        background: #f4f5f7;
    }

    .bili-tabs .tab.active {
        color: #00aeec;
        font-weight: 500;
    }

    .bili-tabs .tab.active::after {
        content: "";
        position: absolute;
        bottom: -1px;
        left: 50%;
        transform: translateX(-50%);
        width: 28px;
        height: 2px;
        background: #00aeec;
        border-radius: 2px;
        transition: width 0.3s ease;
    }

    .content {
        padding: 12px 12px 16px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .content::-webkit-scrollbar,
    .note-preview::-webkit-scrollbar {
        width: 6px;
    }

    .content::-webkit-scrollbar-track,
    .note-preview::-webkit-scrollbar-track {
        background: transparent;
    }

    .content::-webkit-scrollbar-thumb,
    .note-preview::-webkit-scrollbar-thumb {
        background: #e3e5e7;
        border-radius: 3px;
    }

    .meta-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 4px 10px 4px;
        margin-bottom: 8px;
        border-bottom: 1px solid #f1f2f3;
        gap: 10px;
    }

    .meta-info {
        font-size: 11px;
        color: #9499a0;
        opacity: 0.8;
    }

    .meta-divider {
        margin: 0 6px;
        color: #e3e5e7;
    }

    .lang-selector {
        position: relative;
        display: flex;
        align-items: center;
    }

    .lang-select {
        appearance: none;
        -webkit-appearance: none;
        background: transparent;
        border: 1px solid #e3e5e7;
        border-radius: 4px;
        padding: 2px 20px 2px 8px;
        font-size: 12px;
        font-family: inherit;
        color: #61666d;
        cursor: pointer;
        outline: none;
        transition: all 0.2s;
    }

    .lang-select:hover {
        border-color: #00aeec;
        color: #00aeec;
    }

    .lang-arrow {
        position: absolute;
        right: 6px;
        pointer-events: none;
        color: #9499a0;
    }

    .list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .line {
        text-align: left;
        border: none;
        border-radius: 4px;
        padding: 10px 12px;
        background: transparent;
        cursor: pointer;
        display: flex;
        gap: 16px;
        align-items: baseline;
        transition: background-color 0.2s;
    }

    .line:hover {
        background: #f4f5f7;
    }

    .t {
        display: inline-block;
        min-width: 38px;
        font-size: 11px;
        font-weight: 400;
        color: #9499a0;
        font-variant-numeric: tabular-nums;
        flex: 0 0 auto;
        transition: color 0.2s;
    }

    .line:hover .t {
        color: #00aeec;
    }

    .c {
        flex: 1 1 auto;
        color: #18191c;
        font-size: 14px;
        line-height: 1.8;
    }

    .generation-container {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 0 8px;
    }

    .generation-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 2px;
    }

    .generation-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: #18191c;
        display: flex;
        align-items: center;
    }

    .generation-desc {
        color: #18191c;
        font-size: 14px;
        line-height: 1.8;
    }

    .markdown-body h1,
    .markdown-body h2,
    .markdown-body h3,
    .markdown-body h4 {
        margin: 12px 0 8px;
        font-weight: 600;
        font-size: 14px;
        color: #18191c;
    }

    .markdown-body h3 {
        margin: 20px 0 10px;
        font-size: 15px;
        color: #00aeec;
    }

    .markdown-body h1:first-child,
    .markdown-body h2:first-child,
    .markdown-body h3:first-child,
    .markdown-body h4:first-child {
        margin-top: 0;
    }

    .markdown-body p {
        margin: 0 0 16px;
        font-size: 14px;
        line-height: 1.8;
    }

    .markdown-body p:last-child {
        margin-bottom: 0;
    }

    .markdown-body ul,
    .markdown-body ol {
        margin: 0 0 16px;
        padding-left: 20px;
    }

    .markdown-body li {
        margin-bottom: 8px;
    }

    .markdown-body strong {
        font-weight: 600;
        color: #18191c;
    }

    .markdown-body blockquote {
        margin: 0 0 12px;
        padding-left: 12px;
        border-left: 4px solid #e3e5e7;
        color: #61666d;
    }

    .markdown-body code {
        font-family: monospace;
        background-color: #f4f5f7;
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 12px;
    }

    .markdown-body a,
    .markdown-body li,
    .markdown-body p {
        cursor: default;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #9499a0;
        font-size: 13px;
        padding: 60px 0;
        gap: 12px;
        text-align: center;
    }

    .loading-state,
    .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 0 16px;
        color: #9499a0;
        font-size: 13px;
        flex: 1;
        min-height: 260px;
    }

    .bili-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .bili-loading .circular {
        width: 36px;
        height: 36px;
        animation: rotate 2s linear infinite;
    }

    .bili-loading .path {
        stroke: #00aeec;
        stroke-dasharray: 1, 200;
        stroke-dashoffset: 0;
        animation: dash 1.5s ease-in-out infinite;
        stroke-linecap: round;
    }

    @keyframes rotate {
        100% { transform: rotate(360deg); }
    }

    @keyframes dash {
        0% { stroke-dasharray: 1, 200; stroke-dashoffset: 0; }
        50% { stroke-dasharray: 89, 200; stroke-dashoffset: -35px; }
        100% { stroke-dasharray: 89, 200; stroke-dashoffset: -124px; }
    }

    .retry-btn {
        background: #00aeec;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 6px 16px;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.2s;
    }

    .retry-btn:hover {
        background: #00bdfa;
    }

    .regenerate-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        background: transparent;
        color: #9499a0;
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
        flex: 0 0 auto;
    }

    .regenerate-btn:hover {
        background: #f4f5f7;
        color: #00aeec;
    }

    .streaming-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #00aeec;
        user-select: none;
        flex: 0 0 auto;
    }

    .streaming-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #00aeec;
        animation: pulse 1.2s ease-in-out infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 0.3; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.2); }
    }

    .error-copy {
        text-align: center;
        margin: 0 0 16px 0;
        color: #18191c;
        font-size: 13px;
        line-height: 1.5;
    }

    .note-drawer {
        position: absolute;
        top: 92px;
        right: 12px;
        bottom: 12px;
        left: 12px;
        z-index: 80;
        display: flex;
        flex-direction: column;
        border: 1px solid #e3e5e7;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
        overflow: hidden;
    }

    .note-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 44px;
        padding: 0 12px 0 14px;
        border-bottom: 1px solid #e3e5e7;
        flex: 0 0 auto;
    }

    .note-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: #18191c;
    }

    .note-close {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: #9499a0;
        cursor: pointer;
    }

    .note-close:hover {
        background: #f4f5f7;
        color: #18191c;
    }

    .note-actions {
        display: flex;
        gap: 8px;
        padding: 12px 14px;
        border-bottom: 1px solid #f0f1f3;
        flex: 0 0 auto;
    }

    .note-action-btn {
        border: 1px solid #e3e5e7;
        border-radius: 4px;
        background: #ffffff;
        color: #61666d;
        cursor: pointer;
        font-size: 13px;
        padding: 6px 12px;
    }

    .note-action-btn.primary {
        border-color: #00aeec;
        background: #00aeec;
        color: #ffffff;
    }

    .note-action-btn:hover {
        border-color: #00aeec;
        color: #00aeec;
    }

    .note-action-btn.primary:hover {
        background: #00bdfa;
        color: #ffffff;
    }

    .note-preview {
        padding: 14px;
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.8;
        flex: 1;
    }

    .note-loading {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        color: #9499a0;
        font-size: 13px;
    }

    .note-status-row {
        padding: 10px 14px;
        border-bottom: 1px solid #f0f1f3;
    }
`;
