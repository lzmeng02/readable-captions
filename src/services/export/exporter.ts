import { formatTime } from "../../shared/time";
import type { Exporter, TranscriptBundle } from "../../shared/types";

function formatTranscript(bundle: TranscriptBundle): string {
    return bundle.lines
        .map((line) => `[${formatTime(line.from)}] ${line.content}`)
        .join("\n");
}

function sanitizeFileName(input: string): string {
    return input
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
}

export class TranscriptExporter implements Exporter {
    async copyTranscript(bundle: TranscriptBundle): Promise<void> {
        await navigator.clipboard.writeText(formatTranscript(bundle));
    }

    downloadTranscript(bundle: TranscriptBundle, filenameBase: string): void {
        const text = formatTranscript(bundle);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `${sanitizeFileName(filenameBase || "readable-captions")}.txt`;
        link.click();

        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}
