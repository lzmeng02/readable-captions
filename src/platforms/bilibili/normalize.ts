import type { Transcript } from "../../transcript/model";

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === "string" ? value : null;
}

export function normalizeBilibiliTranscript(body: unknown): Transcript | null {
    if (!Array.isArray(body)) {
        return null;
    }

    const transcript: Transcript = [];

    for (const item of body) {
        const line = asRecord(item);
        if (!line) {
            return body as Transcript;
        }

        const from = readNumber(line, "from");
        const to = readNumber(line, "to");
        const content = readString(line, "content");

        if (from === null || to === null || content === null) {
            return body as Transcript;
        }

        transcript.push({ from, to, content });
    }

    return transcript;
}
