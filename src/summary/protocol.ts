import type { SummaryRequest } from "./types";

export const SUMMARY_STREAM_PORT = "readable-captions-summary-stream";

export type SummaryStreamClientMessage =
    | {
        type: "start";
        request: SummaryRequest;
    }
    | {
        type: "cancel";
    };

export type SummaryStreamBackgroundMessage =
    | {
        type: "token";
        text: string;
    }
    | {
        type: "done";
        text: string;
    }
    | {
        type: "error";
        message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function isSummaryStartMessage(message: unknown): message is Extract<SummaryStreamClientMessage, { type: "start" }> {
    if (!isRecord(message) || message.type !== "start" || !isRecord(message.request)) {
        return false;
    }

    return Array.isArray(message.request.transcript);
}

export function isSummaryCancelMessage(message: unknown): message is Extract<SummaryStreamClientMessage, { type: "cancel" }> {
    return isRecord(message) && message.type === "cancel";
}

export function isSummaryBackgroundMessage(message: unknown): message is SummaryStreamBackgroundMessage {
    if (!isRecord(message) || typeof message.type !== "string") {
        return false;
    }

    if (message.type === "token" || message.type === "done") {
        return typeof message.text === "string";
    }

    if (message.type === "error") {
        return typeof message.message === "string";
    }

    return false;
}
