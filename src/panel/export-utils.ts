import type { Transcript } from "../transcript/model";
import type { CopyFormat, DownloadFormat } from "../settings/types";

// Helper to format float seconds to HH:MM:SS,mmm (SRT)
function formatSrtTime(seconds: number): string {
    const s = Math.max(0, seconds);
    const ms = Math.floor((s % 1) * 1000);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);

    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

// Helper to format float seconds to [mm:ss] (Timestamped Text)
function formatTimestamp(seconds: number): string {
    const s = Math.max(0, seconds);
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `[${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}]`;
}

export function generateSrtContent(transcript: Transcript): string {
    return transcript
        .map((line, index) => {
            const start = formatSrtTime(line.from);
            // If line.to is not set or less than from, fallback to add 2 seconds gap
            const endSec = line.to > line.from ? line.to : line.from + 2;
            const end = formatSrtTime(endSec);
            return `${index + 1}\n${start} --> ${end}\n${line.content}\n`;
        })
        .join("\n");
}

export function generateTextContent(transcript: Transcript, format: "readable" | "timestamped"): string {
    if (format === "readable") {
        return transcript.map(line => line.content).join("\n");
    }
    return transcript.map(line => `${formatTimestamp(line.from)} ${line.content}`).join("\n");
}

export async function copyTranscript(transcript: Transcript, format: CopyFormat): Promise<void> {
    const textType = format === "timestamped_text" ? "timestamped" : "readable";
    const content = generateTextContent(transcript, textType);
    await navigator.clipboard.writeText(content);
}

export function downloadTranscript(transcript: Transcript, format: DownloadFormat, title: string): void {
    let content = "";
    let extension = "";
    let mimeType = "";

    if (format === "srt") {
        content = generateSrtContent(transcript);
        extension = "srt";
        mimeType = "text/plain";
    } else {
        content = generateTextContent(transcript, "readable");
        extension = "txt";
        mimeType = "text/plain";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    // Sanitize title for valid filename
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_") || "transcript";
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
