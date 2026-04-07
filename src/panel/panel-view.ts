import { css, html } from "lit";
import type { TranscriptLine } from "../transcript/model";
import type { SummaryResult } from "../summary/types";

export type Mode = "read" | "timeline" | "summary" | "cc" | "ts";

// 引入全局状态来记录是否收起面板和菜单状态
let isCollapsed = false;
let isMenuOpen = false;

export function panelTemplate(
    mode: Mode,
    setMode: (m: Mode) => void,
    data: { transcript: TranscriptLine[] | null; source: string },
    onSettingsClick: () => void,
    currentLang: "zh" | "en" = "zh",
    onLangClick?: () => void,
    summaryState?: {
        isSummarizing: boolean;
        result: SummaryResult | null;
        error: string | null;
        onRetry: () => void;
    },
    onCopy?: () => void,
    onDownload?: () => void
) {
    // 切换收起/展开状态
    const toggleCollapse = () => {
        isCollapsed = !isCollapsed;
        setMode(mode); 
    };

    // 切换更多菜单状态
    const toggleMenu = (e: Event) => {
        e.stopPropagation();
        isMenuOpen = !isMenuOpen;
        setMode(mode);
    };

    // 点击遮罩关闭菜单
    const closeMenu = (e: Event) => {
        e.stopPropagation();
        isMenuOpen = false;
        setMode(mode);
    };

    // 处理点击设置选项
    const handleSettingsClick = (e: Event) => {
        e.stopPropagation();
        isMenuOpen = false; // 关闭菜单
        setMode(mode);      // 触发重渲染
        onSettingsClick();  // 调用外部传入的打开设置页方法
    };

    // 处理点击语言选项
    const handleLangClick = (e: Event) => {
        e.stopPropagation();
        // 语言切换不需要关闭菜单，所以只调外部回调，外部会触发重渲染
        if (onLangClick) {
            onLangClick();
        }
    };

    const tab = (id: Mode, label: string) => {
        const active = mode === id;
        return html`
            <button class="tab ${active ? "active" : ""}" @click=${() => setMode(id)}>
                ${label}
            </button>
        `;
    };

    // 秒 -> mm:ss
    const fmt = (sec: number) => {
        const s = Math.max(0, Math.floor(sec));
        const mm = String(Math.floor(s / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        return `${mm}:${ss}`;
    };

    // 跳转到视频时间
    const jump = (sec: number) => {
        const v = document.querySelector("video") as HTMLVideoElement | null;
        if (!v) return;
        v.currentTime = sec;
        v.play().catch(() => {});
    };

    // 空状态组件
    const emptyState = () => html`
        <div class="empty-state">
            <svg viewBox="0 0 48 48" width="64" height="64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 8H38C39.1046 8 40 8.89543 40 10V38C40 39.1046 39.1046 40 38 40H10C8.89543 40 8 39.1046 8 38V10C8 8.89543 8.89543 8 10 8Z" fill="#F4F5F7" stroke="#E3E5E7" stroke-width="2"/>
                <path d="M16 20H32" stroke="#C9CCD0" stroke-width="2" stroke-linecap="round"/>
                <path d="M16 28H26" stroke="#C9CCD0" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p>${currentLang === "zh" ? "当前视频没有可用字幕" : "No captions available for this video"}</p>
        </div>
    `;

    // 渲染元数据和语言选择器
    const renderMetaBar = () => {
        const t = data.transcript;
        const count = t ? t.length : 0;
        
        let sourceLabel = "未知";
        if (currentLang === "zh") {
            sourceLabel = data.source === "human_view" ? "人工字幕" : data.source === "ai_wbi" ? "AI 字幕" : "未知";
        } else {
            sourceLabel = data.source === "human_view" ? "Human CC" : data.source === "ai_wbi" ? "AI Auto" : "Unknown";
        }

        return html`
            <div class="meta-bar">
                <div class="meta-info">
                    ${currentLang === "zh" ? "来源：" : "Source: "}${sourceLabel} <span class="meta-divider">|</span> ${currentLang === "zh" ? "共" : "Total"} ${count} ${currentLang === "zh" ? "条" : "lines"}
                </div>
                
                ${data.source === "ai_wbi" ? html`
                    <div class="lang-selector">
                        <select class="lang-select" title="${currentLang === 'zh' ? '切换语言' : 'Switch Language'}">
                            <option value="zh">中文 (AI)</option>
                            <option value="en">English (AI)</option>
                            <option value="ja">日本語 (AI)</option>
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
        const t = data.transcript;
        if (!t || t.length === 0) return emptyState();

        return html`
            ${renderMetaBar()}
            <div class="list">
                ${t.map(
                    (l) => html`
                        <button class="line" @click=${() => jump(l.from)}>
                            <span class="t">${fmt(l.from)}</span>
                            <span class="c">${l.content}</span>
                        </button>
                    `,
                )}
            </div>
        `;
    };

    const renderReadView = () => {
        const t = data.transcript;
        if (!t || t.length === 0) return emptyState();

        const paragraphs = [];
        for (let i = 0; i < t.length; i += 4) {
            paragraphs.push(t.slice(i, i + 4));
        }

        return html`
            ${renderMetaBar()}
            <div class="article">
                ${paragraphs.map((para) => {
                    const firstLine = para[0];
                    const text = para.map((l) => l.content).join("，"); 
                    return html`
                        <p class="paragraph">
                            <span class="inline-t" @click=${() => jump(firstLine.from)}>
                                ${fmt(firstLine.from)}
                            </span>
                            ${text}。
                        </p>
                    `;
                })}
            </div>
        `;
    };

    const renderSummaryView = () => {
        if (summaryState?.isSummarizing) {
            return html`
                <div class="summary-container loading-state">
                    <div class="bili-loading">
                        <svg class="circular" viewBox="25 25 50 50">
                            <circle class="path" cx="50" cy="50" r="20" fill="none" stroke-width="4" stroke-miterlimit="10"></circle>
                        </svg>
                        <p>${currentLang === "zh" ? "AI 总结生成中..." : "AI summarizing..."}</p>
                    </div>
                </div>
            `;
        }

        if (summaryState?.error) {
            return html`
                <div class="summary-container error-state">
                    <svg viewBox="0 0 24 24" width="32" height="32" stroke="#ff6666" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <p style="text-align: center; margin: 0 0 16px 0; color: #18191c;">${summaryState.error}</p>
                    <button class="retry-btn" @click=${summaryState.onRetry}>
                        ${currentLang === "zh" ? "重试" : "Retry"}
                    </button>
                </div>
            `;
        }

        const res = summaryState?.result;
        if (res && res.text) {
            const paragraphs = res.text.split("\n").filter(p => p.trim().length > 0);
            return html`
                <div class="summary-container">
                    <div class="summary-card">
                        <h3 class="summary-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00aeec" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                            ${currentLang === "zh" ? "AI 内容摘要" : "AI Summary"}
                        </h3>
                        <div class="summary-desc">
                            ${paragraphs.map(p => html`<p style="margin: 0 0 8px 0; max-width: 100%; white-space: pre-wrap; word-wrap: break-word;">${p}</p>`)}
                        </div>
                    </div>
                </div>
            `;
        }

        // 默认返回空状态，如果没有可用的数据和状态
        return emptyState();
    };

    const content = () => {
        switch (mode) {
            case "read": return renderReadView();
            case "timeline":
            case "cc":
            case "ts": return renderTranscriptList();
            case "summary": return renderSummaryView();
            default: return renderTranscriptList();
        }
    };

    return html`
        <div class="panel ${isCollapsed ? 'collapsed' : ''}">
            <header class="header">
                <div class="title-area" @click=${toggleCollapse} title=${isCollapsed ? (currentLang === "zh" ? "点击展开面板" : "Click to expand") : (currentLang === "zh" ? "点击收起面板" : "Click to collapse")}>
                    <span class="title">${currentLang === "zh" ? "可读字幕" : "Readable Captions"}</span>
                    <span class="sub-title">${currentLang === "zh" ? "Readable Captions" : ""}</span>
                </div>

                <div class="actions">
                    <button class="icon-btn" title="${currentLang === 'zh' ? '下载' : 'Download'}" @click=${onDownload}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                    <button class="icon-btn" title="${currentLang === 'zh' ? '复制' : 'Copy'}" @click=${onCopy}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    
                    <div class="more-actions-wrapper">
                        <button class="icon-btn ${isMenuOpen ? 'active' : ''}" title="${currentLang === 'zh' ? '更多' : 'More'}" @click=${toggleMenu}>
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                        </button>
                        
                        ${isMenuOpen ? html`
                            <div class="menu-overlay" @click=${closeMenu}></div>
                            <div class="overflow-menu">
                                <button class="overflow-item" @click=${handleSettingsClick}>
                                    <svg class="overflow-item-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                                    <span class="overflow-item-label">${currentLang === "zh" ? "设置" : "Settings"}</span>
                                </button>
                                <button class="overflow-item" @click=${handleLangClick}>
                                    <svg class="overflow-item-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                    <span class="overflow-item-label">${currentLang === "zh" ? "语言：中文" : "Lang: English"}</span>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </header>

            ${!isCollapsed ? html`
                <nav class="bili-tabs">
                    ${tab("read", currentLang === "zh" ? "可读" : "Read")}
                    ${tab("summary", currentLang === "zh" ? "摘要" : "Summary")}
                    ${tab("ts", currentLang === "zh" ? "原转写" : "Transcript")}
                    ${tab("cc", currentLang === "zh" ? "原字幕" : "CC")}
                </nav>

                <main class="content">${content()}</main>
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
        font-size: 16px;
        font-weight: 500;
        color: #18191c;
    }

    .sub-title {
        font-size: 12px;
        color: #9499a0;
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

    /* ======= 新设计的下拉菜单 ======= */
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
        width: 132px;
        padding: 6px;
        border: 1px solid #e3e5e7; 
        border-radius: 8px; 
        background: #ffffff;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 0 4px rgba(0, 0, 0, 0.02);
        z-index: 100;
        display: flex;
        flex-direction: column;
        gap: 2px; 
        transform-origin: top right;
        animation: menuFadeIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    @keyframes menuFadeIn {
        from {
            opacity: 0;
            transform: scale(0.95) translateY(-4px);
        }
        to {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
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

    /* ======= B站原生风格 Tab ======= */
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
        transition: color 0.2s;
    }

    .bili-tabs .tab:hover {
        color: #00aeec;
    }

    .bili-tabs .tab.active {
        color: #00aeec;
        font-weight: 500;
    }

    .bili-tabs .tab.active::after {
        content: '';
        position: absolute;
        bottom: -1px; 
        left: 50%;
        transform: translateX(-50%);
        width: 24px; 
        height: 2px;
        background: #00aeec;
        border-radius: 2px;
    }

    /* ======= 内容区域 ======= */
    .content {
        padding: 12px 12px 16px;
        overflow-y: auto;
        flex: 1;
    }

    .content::-webkit-scrollbar {
        width: 6px;
    }
    .content::-webkit-scrollbar-track {
        background: transparent;
    }
    .content::-webkit-scrollbar-thumb {
        background: #e3e5e7;
        border-radius: 3px;
    }
    .content::-webkit-scrollbar-thumb:hover {
        background: #c9ccd0;
    }

    /* ======= 元数据与语言选择器 ======= */
    .meta-bar {
        display: flex;
        align-items: center;
        justify-content: space-between; 
        padding: 0 4px 12px 4px; 
    }
    
    .meta-info {
        font-size: 12px;
        color: #9499a0;
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
        transition: color 0.2s;
    }
    .lang-select:hover + .lang-arrow {
        color: #00aeec;
    }

    /* ======= 通用列表项 ======= */
    .list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .line {
        text-align: left;
        border: none;
        border-radius: 6px;
        padding: 8px; 
        background: transparent;
        cursor: pointer;
        display: flex;
        gap: 12px; 
        align-items: baseline; 
        transition: background-color 0.2s;
    }
    .line:hover {
        background: #f4f5f7; 
    }

    .t {
        display: inline-block;
        font-size: 12px;
        color: #9499a0;
        font-variant-numeric: tabular-nums;
        flex: 0 0 auto;
        margin-top: 0; 
        transition: color 0.2s;
    }
    
    .line:hover .t {
        color: #00aeec; 
    }

    .c {
        flex: 1 1 auto;
        color: #18191c; 
        font-size: 13px;
        line-height: 1.6;
    }

    /* ======= 视图 2：可读段落 ======= */
    .article {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 0 4px; 
    }
    
    .paragraph {
        margin: 0;
        font-size: 13px;  
        line-height: 1.6; 
        color: #18191c;
        text-align: justify;
    }

    .inline-t {
        display: inline-block;
        font-size: 12px;
        background: #f4f5f7;
        color: #61666d;
        padding: 0 6px;
        border-radius: 4px;
        margin-right: 6px;
        font-variant-numeric: tabular-nums;
        cursor: pointer;
        transition: all 0.2s;
        user-select: none;
    }
    .inline-t:hover {
        background: #e3e5e7;
        color: #00aeec;
    }

    /* ======= 视图 3：摘要 ======= */
    .summary-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 0 4px;
    }

    .summary-card {
        background: #f4f5f7;
        border-radius: 6px;
        padding: 16px;
    }

    .summary-title {
        margin: 0 0 8px 0;
        font-size: 14px;
        font-weight: 500;
        color: #18191c;
        display: flex;
        align-items: center;
    }

    .summary-desc {
        margin: 0;
        font-size: 13px;
        color: #61666d;
        line-height: 1.6;
    }

    .points-title {
        margin: 0 0 8px 4px;
        font-size: 13px;
        font-weight: 500;
        color: #18191c;
    }

    .summary-points {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    /* ======= 空状态 ======= */
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #9499a0;
        font-size: 13px;
        padding: 60px 0;
        gap: 12px;
    }

    /* ======= 摘要加载/报错状态 ======= */
    .loading-state, .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 16px;
        color: #9499a0;
        font-size: 13px;
        min-height: 200px;
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
`;