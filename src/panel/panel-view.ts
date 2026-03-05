// src/panel/panel-view.ts
import { css, html } from "lit";
import type { SubtitleLine } from "../bilibili";

export type Mode = "read" | "timeline" | "summary" | "cc" | "ts";

// 引入全局状态来记录是否收起面板
let isCollapsed = false;

export function panelTemplate(
    mode: Mode,
    setMode: (m: Mode) => void,
    data: { transcript: SubtitleLine[] | null; source: string },
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

    // 渲染元数据和语言选择器 (抽离出来以便复用)
    const renderMetaBar = () => {
        const t = data.transcript;
        const count = t ? t.length : 0;
        const sourceLabel =
            data.source === "human_view" ? "人工字幕" : data.source === "ai_wbi" ? "AI 字幕" : "未知";

        return html`
            <div class="meta-bar">
                <div class="meta-info">
                    <span class="meta-dot"></span>
                    来源：${sourceLabel} · 共 ${count} 条
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
        if (!t || t.length === 0) {
            return html`<div class="empty-state">当前视频没有可用字幕</div>`;
        }

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
        if (!t || t.length === 0) return html`<div class="empty-state">当前视频没有可用字幕</div>`;

        // 这里仅为演示 UI，将每 4 句合并为一个“段落”
        const paragraphs = [];
        for (let i = 0; i < t.length; i += 4) {
            paragraphs.push(t.slice(i, i + 4));
        }

        return html`
            ${renderMetaBar()}
            <div class="article">
                ${paragraphs.map((para) => {
                    const firstLine = para[0];
                    const text = para.map((l) => l.content).join("，"); // 模拟断句组合
                    return html`
                        <p class="paragraph">
                            <span class="inline-t" @click=${() => jump(firstLine.from)}>
                                [${fmt(firstLine.from)}]
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
                    <h3 class="summary-title">✨ 核心摘要</h3>
                    <p class="summary-desc">这是 AI 生成的视频内容结构化总结，目前为占位设计。后续可接入大模型总结的数据。</p>
                </div>
                
                <div class="summary-points">
                    <h4 class="points-title">章节看点</h4>
                    <!-- 复用 .line, .t, .c 类以保证多视图样式绝对统一 -->
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
            case "read":
                return renderReadView();
            case "timeline":
            case "cc":
            case "ts":
                return renderTranscriptList();
            case "summary":
                return renderSummaryView();
            default:
                return renderTranscriptList();
        }
    };

    return html`
        <div class="panel ${isCollapsed ? 'collapsed' : ''}">
            <header class="header">
                <!-- 点击标题区域即可收起/展开 -->
                <div class="title" @click=${toggleCollapse} title=${isCollapsed ? "点击展开面板" : "点击收起面板"}>
                    <div class="name">可读字幕</div>
                    <div class="sub">Readable Captions</div>
                </div>

                <!-- 去除了折叠箭头，仅保留三个核心按钮 -->
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
                <nav class="segment-control">
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
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        display: block;
    }

    .panel {
        height: 540px; 
        max-height: 85vh; 
        display: flex;
        flex-direction: column;
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
        border: 1px solid rgba(0, 0, 0, 0.05);
        overflow: hidden;
        color: #333;
    }

    .panel.collapsed {
        height: auto;
    }

    /* 顶部标题栏 */
    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px 12px;
    }

    .panel.collapsed .header {
        padding: 16px 20px;
    }

    .title {
        cursor: pointer;
        user-select: none;
        transition: opacity 0.2s ease;
        flex: 1; /* 让标题区域撑满左侧，更容易点击 */
    }
    .title:hover {
        opacity: 0.7;
    }

    .title .name {
        font-size: 16px;
        font-weight: 600;
        color: #111;
        letter-spacing: 0.3px;
        line-height: 1.2;
    }

    .title .sub {
        font-size: 12px;
        color: #888;
        line-height: 1.2;
        margin-top: 4px;
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
        width: 32px;
        height: 32px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: #666;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .icon-btn:hover {
        background: #f4f4f5;
        color: #111;
    }

    /* 胶囊分段选择器 (Segmented Control) */
    .segment-control {
        display: flex;
        background: #f4f4f5; 
        border-radius: 8px;
        padding: 4px;
        margin: 0 20px 8px 20px; 
    }

    .segment-control .tab {
        flex: 1; 
        text-align: center;
        border: none;
        background: transparent;
        padding: 6px 0;
        font-size: 13px;
        color: #666;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
        font-weight: 500;
        white-space: nowrap;
    }

    .segment-control .tab:hover {
        color: #111;
    }

    .segment-control .tab.active {
        background: #ffffff; 
        color: #111;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04); 
    }

    /* 内容区域 */
    .content {
        padding: 12px 20px 16px;
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.6;
        flex: 1;
    }

    .content::-webkit-scrollbar {
        width: 6px;
    }
    .content::-webkit-scrollbar-track {
        background: transparent;
    }
    .content::-webkit-scrollbar-thumb {
        background: #e0e0e0;
        border-radius: 4px;
    }
    .content::-webkit-scrollbar-thumb:hover {
        background: #c0c0c0;
    }

    /* ======= 元数据与语言选择器 ======= */
    .meta-bar {
        display: flex;
        align-items: center;
        justify-content: space-between; 
        margin: 0 4px 14px 4px; 
    }
    
    .meta-info {
        font-size: 12px;
        color: #888;
        display: flex;
        align-items: center;
    }
    
    .meta-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #d4d4d4;
        margin-right: 8px;
    }

    /* 语言选择器 */
    .lang-selector {
        position: relative;
        display: flex;
        align-items: center;
    }

    .lang-select {
        appearance: none;
        -webkit-appearance: none;
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        padding: 4px 24px 4px 10px;
        font-size: 12px;
        color: #444;
        cursor: pointer;
        outline: none;
        transition: all 0.2s ease;
        font-family: inherit;
    }

    .lang-select:hover {
        background: #f9f9f9;
        border-color: #d0d0d0;
        color: #111;
    }

    .lang-select:focus {
        border-color: #d4d4d4;
    }

    .lang-arrow {
        position: absolute;
        right: 8px;
        pointer-events: none; 
        color: #888;
    }

    /* ======= 通用列表项 (多视图复用，保证绝对统一) ======= */
    .list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .line {
        text-align: left;
        border: none;
        border-radius: 6px;
        padding: 8px 10px; 
        background: transparent;
        cursor: pointer;
        display: flex;
        gap: 12px; 
        align-items: flex-start;
        transition: background-color 0.15s ease;
    }
    .line:hover {
        background: #f4f5f7; 
    }

    /* 去掉胶囊底色的极简时间戳 */
    .t {
        display: inline-block;
        font-size: 13px; /* 稍微调大一点点，补偿去掉背景后的视觉缩水 */
        color: #999;
        font-variant-numeric: tabular-nums;
        flex: 0 0 auto;
        margin-top: 2px;
        transition: color 0.2s ease;
    }
    
    .line:hover .t {
        color: #333; /* 仅加深颜色，不再变色块 */
    }

    .c {
        flex: 1 1 auto;
        color: #333; 
        font-size: 14px;
        line-height: 1.5;
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
        font-size: 15px;      
        line-height: 1.75;    
        color: #222;
        text-align: justify;
    }

    /* 可读段落里的极简时间戳 */
    .inline-t {
        display: inline-block;
        font-size: 13px;
        color: #aaa;
        margin-right: 6px;
        font-variant-numeric: tabular-nums;
        cursor: pointer;
        transition: color 0.2s ease;
        user-select: none;
    }
    .inline-t:hover {
        color: #111;
    }

    /* ======= 视图 3：摘要 ======= */
    .summary-container {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 0 4px;
    }

    .summary-card {
        background: #f8f9fa;
        border-radius: 10px;
        padding: 16px;
        border: 1px solid #f1f1f1;
    }

    .summary-title {
        margin: 0 0 8px 0;
        font-size: 14px;
        font-weight: 600;
        color: #111;
    }

    .summary-desc {
        margin: 0;
        font-size: 14px;
        color: #555;
        line-height: 1.6;
    }

    .points-title {
        margin: 0 0 10px 4px;
        font-size: 13px;
        font-weight: 600;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .summary-points {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    /* ======= 通用 ======= */
    .empty-state, .placeholder {
        color: #888;
        font-size: 14px;
        text-align: center;
        padding: 40px 0;
    }
`;