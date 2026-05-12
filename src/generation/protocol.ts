import type { GenerationRequest, GenerationTask } from "./types";

export const GENERATION_STREAM_PORT = "readable-captions-generation-stream";

export type GenerationStreamClientMessage =
    | {
        type: "start";
        request: GenerationRequest;
    }
    | {
        type: "cancel";
    };

export type GenerationStreamBackgroundMessage =
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

function isGenerationTask(value: unknown): value is GenerationTask {
    return value === "overview" || value === "intensive" || value === "note";
}

export function isGenerationStartMessage(
    message: unknown,
): message is Extract<GenerationStreamClientMessage, { type: "start" }> {
    if (!isRecord(message) || message.type !== "start" || !isRecord(message.request)) {
        return false;
    }

    return Array.isArray(message.request.transcript) && isGenerationTask(message.request.task);
}

export function isGenerationCancelMessage(
    message: unknown,
): message is Extract<GenerationStreamClientMessage, { type: "cancel" }> {
    return isRecord(message) && message.type === "cancel";
}

export function isGenerationBackgroundMessage(message: unknown): message is GenerationStreamBackgroundMessage {
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
