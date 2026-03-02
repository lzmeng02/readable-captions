// src/panel/panel-view.ts
import { css, html } from "lit";
import type { SubtitleLine } from "../bilibili";

export type Mode = "read" | "timeline" | "summary" | "cc" | "ts";

export function panelTemplate(
    mode: Mode,
    setMode: (m: Mode) => void,
    data: { transcript: SubtitleLine[] | null; source: string },
) {
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

    // 视图 1：时间轴/原字幕 (基础列表视图)
    const renderTranscriptList = () => {
        const t = data.transcript;
        if (!t || t.length === 0) {
            return html`<div class="empty-state">当前视频没有可用字幕</div>`;
        }

        const sourceLabel =
            data.source === "human_view" ? "人工字幕" : data.source === "ai_wbi" ? "AI 字幕" : "未知";

        return html`
            <div class="meta">
                <span class="meta-dot"></span>
                来源：${sourceLabel} · 共 ${t.length} 条
            </div>
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
                    <button class="point-item" @click=${() => jump(0)}>
                        <span class="point-t">00:00</span>
                        <div class="point-c">伊朗革命卫队总司令相关发言与背景介绍</div>
                    </button>
                    <button class="point-item" @click=${() => jump(10)}>
                        <span class="point-t">00:10</span>
                        <div class="point-c">2026年特朗普第二次动用军事手段的深层分析</div>
                    </button>
                    <button class="point-item" @click=${() => jump(18)}>
                        <span class="point-t">00:18</span>
                        <div class="point-c">解读该地区强国及石油生产大国在国际局势中的地位</div>
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
        <div class="panel">
            <header class="header">
                <div class="title">
                    <div class="name">可读字幕</div>
                    <div class="sub">Readable Captions</div>
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

            <nav class="tabs">
                ${tab("read", "可读")}
                ${tab("summary", "摘要")}
                ${tab("ts", "原转写")}
                ${tab("cc", "原字幕")}
            </nav>

            <main class="content">${content()}</main>
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
        height: 100%;
        max-height: 600px;
        display: flex;
        flex-direction: column;
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
        border: 1px solid rgba(0, 0, 0, 0.05);
        overflow: hidden;
        color: #333;
    }

    /* 顶部标题栏 */
    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px 12px;
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

    /* 标签页 */
    .tabs {
        display: flex;
        gap: 20px;
        padding: 0 20px;
        border-bottom: 1px solid #f0f0f0;
        overflow-x: auto;
        scrollbar-width: none;
    }
    .tabs::-webkit-scrollbar {
        display: none;
    }

    .tab {
        border: 0;
        background: transparent;
        cursor: pointer;
        padding: 12px 2px 10px;
        font-size: 14px;
        color: #888;
        border-bottom: 2px solid transparent;
        white-space: nowrap;
        transition: color 0.2s ease;
    }
    .tab:hover {
        color: #444;
    }
    .tab.active {
        color: #111;
        border-bottom-color: #111;
        font-weight: 500;
    }

    /* 内容区域 */
    .content {
        padding: 16px 20px;
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

    /* ======= 视图 1：时间轴/原转写 ======= */
    .meta {
        font-size: 12px;
        color: #888;
        margin-bottom: 14px;
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

    .list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .line {
        text-align: left;
        border: none;
        border-radius: 8px;
        padding: 10px 12px;
        background: transparent;
        cursor: pointer;
        display: flex;
        gap: 16px;
        align-items: flex-start;
        transition: background-color 0.2s ease;
    }
    .line:hover {
        background: #f7f7f9;
    }

    .t {
        display: inline-block;
        font-size: 13px;
        color: #999;
        font-variant-numeric: tabular-nums;
        flex: 0 0 auto;
        margin-top: 2px;
    }

    .c {
        flex: 1 1 auto;
        color: #222;
        font-size: 14px;
        line-height: 1.5;
    }

    /* ======= 视图 2：可读段落 ======= */
    .article {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 4px 0;
    }
    
    .paragraph {
        margin: 0;
        font-size: 15px;      /* 稍大的字号以利于阅读 */
        line-height: 1.75;    /* 宽松的行高 */
        color: #222;
        text-align: justify;
    }

    .inline-t {
        color: #aaa;
        font-size: 12px;
        margin-right: 6px;
        font-variant-numeric: tabular-nums;
        cursor: pointer;
        transition: color 0.2s;
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
        gap: 4px;
    }

    .point-item {
        text-align: left;
        border: none;
        border-radius: 8px;
        padding: 10px 12px;
        background: transparent;
        cursor: pointer;
        display: flex;
        gap: 12px;
        align-items: flex-start;
        transition: background-color 0.2s ease;
    }
    .point-item:hover {
        background: #f7f7f9;
    }

    .point-t {
        display: inline-block;
        font-size: 12px;
        color: #fff;
        background: #ccc;  /* 摘要里的时间戳做成小标签会更好看 */
        padding: 2px 6px;
        border-radius: 4px;
        font-variant-numeric: tabular-nums;
        flex: 0 0 auto;
        margin-top: 1px;
    }
    .point-item:hover .point-t {
        background: #999;
    }

    .point-c {
        flex: 1 1 auto;
        color: #222;
        font-size: 14px;
        line-height: 1.5;
    }

    /* ======= 通用 ======= */
    .empty-state, .placeholder {
        color: #888;
        font-size: 14px;
        text-align: center;
        padding: 40px 0;
    }
`;