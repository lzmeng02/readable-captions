import { html } from "lit";
import type { AppSettings, SummaryState, TranscriptBundle } from "../../shared/types";

interface SummaryViewHandlers {
    onGenerateSummary: () => void;
    onJumpTo: (seconds: number) => void;
    onOpenSettings: () => void;
}

function providerLabel(settings: AppSettings): string {
    switch (settings.summary.provider) {
        case "openai":
            return "OpenAI API";
        case "chatgpt_web":
            return "ChatGPT Web";
        default:
            return "未启用";
    }
}

export function summaryViewTemplate(
    transcript: TranscriptBundle | null,
    summary: SummaryState,
    settings: AppSettings,
    handlers: SummaryViewHandlers,
) {
    if (!transcript || transcript.lines.length === 0) {
        return html`<div class="empty-state">没有字幕时无法生成摘要</div>`;
    }

    if (summary.status === "loading") {
        return html`
            <div class="summary-container">
                <div class="summary-card">
                    <h3 class="summary-title">正在生成摘要</h3>
                    <p class="summary-desc">会按照你的设置调用摘要提供方，这一步可能持续几秒到几十秒。</p>
                </div>
            </div>
        `;
    }

    if (summary.status === "error") {
        return html`
            <div class="summary-container">
                <div class="summary-card summary-card-error">
                    <h3 class="summary-title">摘要生成失败</h3>
                    <p class="summary-desc">${summary.error ?? "未知错误"}</p>
                    <div class="summary-actions">
                        <button class="primary-btn" @click=${handlers.onGenerateSummary}>重试</button>
                        <button class="secondary-btn" @click=${handlers.onOpenSettings}>打开设置</button>
                    </div>
                </div>
            </div>
        `;
    }

    if (summary.status === "ready" && summary.data) {
        const paragraphs = summary.data.text
            .split(/\n{2,}/)
            .map((paragraph) => paragraph.trim())
            .filter((paragraph) => paragraph.length > 0 && paragraph !== "Summary:" && paragraph !== "Highlights:");

        return html`
            <div class="summary-container">
                <div class="summary-card">
                    <h3 class="summary-title">摘要结果</h3>
                    <div class="summary-model">
                        ${providerLabel(settings)}${summary.data.model ? ` · ${summary.data.model}` : ""}
                    </div>
                    ${paragraphs.map((paragraph) => html`<p class="summary-desc">${paragraph}</p>`)}
                </div>

                <div class="summary-points">
                    <div class="points-header">
                        <h4 class="points-title">章节看点</h4>
                        <button class="ghost-btn" @click=${handlers.onGenerateSummary}>重新生成</button>
                    </div>
                    ${summary.data.highlights.length > 0
                        ? summary.data.highlights.map((highlight) => html`
                            <button
                                class="point-item"
                                ?disabled=${highlight.time === null}
                                @click=${() => highlight.time !== null && handlers.onJumpTo(highlight.time)}
                            >
                                <span class="point-t">${highlight.label}</span>
                                <div class="point-c">${highlight.text}</div>
                            </button>
                        `)
                        : html`<div class="empty-inline">当前结果没有可解析的时间点高亮</div>`}
                </div>
            </div>
        `;
    }

    return html`
        <div class="summary-container">
            <div class="summary-card">
                <h3 class="summary-title">AI 摘要</h3>
                <p class="summary-desc">
                    当前提供方：${providerLabel(settings)}。
                    ${settings.summary.provider === "disabled"
                        ? "先在设置里选择摘要提供方，再回来生成摘要。"
                        : "你可以手动生成摘要，也可以继续微调 prompt、模型和标签配置。"}
                </p>
                <div class="summary-actions">
                    <button class="primary-btn" @click=${handlers.onGenerateSummary}>生成摘要</button>
                    <button class="secondary-btn" @click=${handlers.onOpenSettings}>打开设置</button>
                </div>
            </div>
        </div>
    `;
}
