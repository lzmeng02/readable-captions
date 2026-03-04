import { html } from "lit";
import { formatTime } from "../../shared/time";
import type { TranscriptLine } from "../../shared/types";

function shouldBreakParagraph(current: TranscriptLine[], next: TranscriptLine | undefined): boolean {
    const last = current[current.length - 1];
    const gap = next ? next.from - last.to : 0;
    const endsSentence = /[。！？!?]$/.test(last.content.trim());

    return current.length >= 4 || endsSentence || gap >= 2.5;
}

function groupParagraphs(lines: readonly TranscriptLine[]): TranscriptLine[][] {
    const paragraphs: TranscriptLine[][] = [];
    let current: TranscriptLine[] = [];

    lines.forEach((line, index) => {
        current.push(line);
        const next = lines[index + 1];

        if (shouldBreakParagraph(current, next)) {
            paragraphs.push(current);
            current = [];
        }
    });

    if (current.length > 0) {
        paragraphs.push(current);
    }

    return paragraphs;
}

function mergeContent(lines: readonly TranscriptLine[]): string {
    return lines.reduce((result, line, index) => {
        const content = line.content.trim();
        if (index === 0) {
            return content;
        }

        const previous = result[result.length - 1] ?? "";
        const needsSpace = /[A-Za-z0-9]$/.test(previous) && /^[A-Za-z0-9]/.test(content);

        return `${result}${needsSpace ? " " : ""}${content}`;
    }, "");
}

export function readViewTemplate(lines: readonly TranscriptLine[], onJump: (seconds: number) => void) {
    if (lines.length === 0) {
        return html`<div class="empty-state">当前视频没有可用字幕</div>`;
    }

    const paragraphs = groupParagraphs(lines);

    return html`
        <div class="article">
            ${paragraphs.map((paragraph) => {
                const firstLine = paragraph[0];
                return html`
                    <p class="paragraph">
                        <span class="inline-t" @click=${() => onJump(firstLine.from)}>
                            [${formatTime(firstLine.from)}]
                        </span>
                        ${mergeContent(paragraph)}
                    </p>
                `;
            })}
        </div>
    `;
}
