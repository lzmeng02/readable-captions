import { css, html } from "lit";
import type { TranscriptLine } from "../transcript/model";

export type Mode = "read" | "timeline" | "summary" | "cc" | "ts";

// 引入全局状态来记录是否收起面板
let isCollapsed = false;

export function panelTemplate(
    mode: Mode,
    setMode: (m: Mode) => void,
    data: { transcript: TranscriptLine[] | null; source: string },
) {
    // 切换收起/展开状态，并触发重渲染
    const toggleCollapse = () => {
        isCollapsed = !isCollapsed;
        setMode(mode); // 巧妙利用现有的 setMode 触发 Lit 重新渲染
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

    // 空状态组件 (带图标，更原生)
    const emptyState = () => html`
        <div class="empty-state">
            <svg viewBox="0 0 48 48" width="64" height="64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 8H38C39.1046 8 40 8.89543 40 10V38C40 39.1046 39.1046 40 38 40H10C8.89543 40 8 39.1046 8 38V10C8 8.89543 8.89543 8 10 8Z" fill="#F4F5F7" stroke="#E3E5E7" stroke-width="2"/>
                <path d="M16 20H32" stroke="#C9CCD0" stroke-width="2" stroke-linecap="round"/>
                <path d="M16 28H26" stroke="#C9CCD0" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p>当前视频没有可用字幕</p>
        </div>
    `;

    // 渲染元数据和语言选择器 (抽离出来以便复用)
    const renderMetaBar = () => {
        const t = data.transcript;
        const count = t ? t.length : 0;
        const sourceLabel =
            data.source === "human_view" ? "人工字幕" : data.source === "ai_wbi" ? "AI 字幕" : "未知";

        return html`
            <div class="meta-bar">
                <div class="meta-info">
                    来源：${sourceLabel} <span class="meta-divider">|</span> 共 ${count} 条
                </div>
                
                ${data.source === "ai_wbi" ? html`
                    <div class="lang-selector">
                        <select class="lang-select" title="切换语言">
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

    // 视图 1：时间轴/原字幕 (基础列表视图)
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

    // 视图 2：可读段落 (模拟将零碎句子聚合成段落)
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

    // 视图 3：摘要 (AI 结构化总结占位设计)
    const renderSummaryView = () => {
        return html`
            <div class="summary-container">
                <div class="summary-card">
                    <h3 class="summary-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00aeec" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                        AI 内容摘要
                    </h3>
                    <p class="summary-desc">这是 AI 生成的视频内容结构化总结，目前为占位设计。后续可接入大模型总结的数据。</p>
                </div>
                
                <div class="summary-points">
                    <h4 class="points-title">章节看点</h4>
                    <button class="line" @click=${() => jump(0)}>
                        <span class="t">00:00</span>
                        <div class="c">伊朗革命卫队总司令相关发言与背景介绍</div>
                    </button>
                    <button class="line" @click=${() => jump(10)}>
                        <span class="t">00:10</span>
                        <div class="c">2026年特朗普第二次动用军事手段的深层分析</div>
                    </button>
                    <button class="line" @click=${() => jump(18)}>
                        <span class="t">00:18</span>
                        <div class="c">解读该地区强国及石油生产大国在国际局势中的地位</div>
                    </button>
                </div>
            </div>
        `;
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
                <!-- 点击标题区域即可收起/展开 -->
                <div class="title-area" @click=${toggleCollapse} title=${isCollapsed ? "点击展开面板" : "点击收起面板"}>
                    <span class="title">可读字幕</span>
                    <span class="sub-title">Readable Captions</span>
                </div>

                <div class="actions">
                    <button class="icon-btn" title="下载">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                    <button class="icon-btn" title="复制">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button class="icon-btn" title="更多">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                    </button>
                </div>
            </header>

            ${!isCollapsed ? html`
                <nav class="bili-tabs">
                    ${tab("read", "可读")}
                    ${tab("summary", "摘要")}
                    ${tab("ts", "原转写")}
                    ${tab("cc", "原字幕")}
                </nav>

                <main class="content">${content()}</main>
            ` : ""}
        </div>
    `;
}

export const panelStyles = css`
    :host {
        all: initial;
        /* 使用B站标准字体栈 */
        font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        display: block;
        box-sizing: border-box;
    }

    * {
        box-sizing: border-box;
    }

    /* 修复所有 button 的字体继承问题 */
    button {
        font-family: inherit;
    }

    .panel {
        height: 540px; 
        max-height: 85vh; 
        display: flex;
        flex-direction: column;
        border-radius: 6px; /* B站侧边栏通常是较小的圆角 */
        background: #ffffff;
        border: 1px solid #e3e5e7; /* B站标准的描边颜色 */
        overflow: hidden;
        color: #18191c; /* B站正文标准色 */
    }

    .panel.collapsed {
        height: auto;
    }

    /* 顶部标题栏 */
    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        height: 46px; /* 固定高度更严谨 */
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

    /* 操作按钮 */
    .actions {
        display: flex;
        gap: 4px;
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

    /* B站原生风格 Tab */
    .bili-tabs {
        display: flex;
        padding: 0 8px; /* 稍微缩减一点外边距，让均分看起来更饱满 */
        border-bottom: 1px solid #e3e5e7;
        flex-shrink: 0;
    }

    .bili-tabs .tab {
        flex: 1; /* 关键修改：让每个按钮等比例占用所有空间，实现均分 */
        text-align: center; /* 确保文字在均分的块里居中 */
        background: transparent;
        border: none;
        padding: 10px 0;
        font-size: 14px;
        font-family: inherit; /* 强制继承字体，避免由于默认字体差异导致字号不一 */
        white-space: nowrap;  /* 防止文字换行压缩 */
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
        bottom: -1px; /* 盖住父元素的下边框 */
        left: 50%;
        transform: translateX(-50%);
        width: 24px; /* 关键修改：均分后按钮变宽，改为固定的短横线更符合B站设计风格 */
        height: 2px;
        background: #00aeec;
        border-radius: 2px;
    }

    /* 内容区域 */
    .content {
        padding: 12px 12px 16px;
        overflow-y: auto;
        flex: 1;
    }

    /* 细长优雅的滚动条 */
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

    /* 原生语言选择器 */
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
        align-items: baseline; /* 关键修复：使用基线对齐，完美解决大小字体的视觉居中问题 */
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
        margin-top: 0; /* 移除之前为了顶部对齐而加的强行偏移 */
        transition: color 0.2s;
    }
    
    .line:hover .t {
        color: #00aeec; /* Hover 时时间戳亮起 */
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
        font-size: 13px;     /* 统一字号：将 14px 改为 13px */ 
        line-height: 1.6;    /* 统一行高：将 1.8 改为 1.6 */
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
`;
