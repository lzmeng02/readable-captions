import { html } from "lit";
import { formatTime, formatTimeRange } from "../../shared/time";
import type { TranscriptLine } from "../../shared/types";

export function transcriptListTemplate(
    lines: readonly TranscriptLine[],
    variant: "transcript" | "captions",
    onJump: (seconds: number) => void,
) {
    if (lines.length === 0) {
        return html`<div class="empty-state">当前视频没有可用字幕</div>`;
    }

    return html`
        <div class="list">
            ${lines.map((line) => html`
                <button class="line" @click=${() => onJump(line.from)}>
                    <span class="t">
                        ${variant === "captions" ? formatTimeRange(line.from, line.to) : formatTime(line.from)}
                    </span>
                    <span class="c">${line.content}</span>
                </button>
            `)}
        </div>
    `;
}
