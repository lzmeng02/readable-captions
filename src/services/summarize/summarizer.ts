import { formatTime } from "../../shared/time";
import { DEFAULT_SUMMARY_PROMPT } from "../settings/schema";
import type {
    SummaryHighlight,
    SummaryRequest,
    SummaryResult,
    Summarizer,
} from "../../shared/types";

function createTranscriptBlock(request: SummaryRequest): string {
    return request.transcript.lines
        .map((line) => `[${formatTime(line.from)}] ${line.content}`)
        .join("\n");
}

export function buildSummaryPrompt(request: SummaryRequest): string {
    const customPrompt = request.settings.summary.prompt.trim() || DEFAULT_SUMMARY_PROMPT;
    const transcriptText = createTranscriptBlock(request);

    return [
        `视频标题：${request.videoTitle || "未知标题"}`,
        `字幕来源：${request.transcript.source}`,
        "",
        customPrompt,
        "",
        "字幕内容：",
        transcriptText,
    ].join("\n");
}

export function extractHighlights(summaryText: string): SummaryHighlight[] {
    const highlightLines = summaryText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- ["));

    return highlightLines.map((line, index) => {
        const match = line.match(/^\-\s*\[(\d{2}:\d{2}(?::\d{2})?)\]\s*(.+)$/);

        if (!match) {
            return {
                id: `highlight-${index}`,
                label: `片段 ${index + 1}`,
                time: null,
                text: line.replace(/^\-\s*/, ""),
            };
        }

        const [, label, text] = match;
        const parts = label.split(":").map(Number);
        const seconds = parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts[0] * 60 + parts[1];

        return {
            id: `highlight-${index}`,
            label,
            time: seconds,
            text,
        };
    });
}

export class DelegatingSummarizer implements Summarizer {
    private readonly providers: Record<string, Summarizer>;

    constructor(providers: Record<string, Summarizer>) {
        this.providers = providers;
    }

    async summarize(request: SummaryRequest): Promise<SummaryResult> {
        const provider = request.settings.summary.provider;

        if (provider === "disabled") {
            throw new Error("请先在设置里启用摘要提供方。");
        }

        const summarizer = this.providers[provider];
        if (!summarizer) {
            throw new Error(`暂不支持摘要提供方: ${provider}`);
        }

        return summarizer.summarize(request);
    }
}
