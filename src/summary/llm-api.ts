import type { ExtensionSettings } from "../settings/types";
import type { SummaryRequest } from "./types";

type ChatMessage = {
    role: "system" | "user";
    content: string;
};

type StreamSummaryFromApiOptions = {
    settings: ExtensionSettings;
    request: SummaryRequest;
    signal: AbortSignal;
    onToken: (partialText: string) => void;
};

const DEFAULT_SUMMARY_PROMPT =
    "Please summarize the following video transcript. Extract the main points and organize them logically.";
const DEFAULT_INTENSIVE_PROMPT =
    "请将以下视频字幕整理成适合阅读的文章稿。要求：去除明显口头语和重复表达，补全必要标点，合并被字幕切碎的句子，按主题自然分段，保持原内容顺序和细节，不做大幅总结，不添加字幕外事实。";

function resolveEndpoint(provider: ExtensionSettings["summaryProvider"]): string {
    return provider === "deepseek"
        ? "https://api.deepseek.com/chat/completions"
        : "https://api.openai.com/v1/chat/completions";
}

function resolveModel(settings: ExtensionSettings): string {
    const configuredModel = settings.summaryModel.trim();
    if (configuredModel.length > 0) {
        return configuredModel;
    }

    return settings.summaryProvider === "deepseek" ? "deepseek-chat" : "gpt-3.5-turbo";
}

function buildMessages(settings: ExtensionSettings, request: SummaryRequest): ChatMessage[] {
    const systemPrompt = request.task === "intensive"
        ? DEFAULT_INTENSIVE_PROMPT
        : settings.summaryPromptTemplate.trim() || DEFAULT_SUMMARY_PROMPT;
    const transcriptText = request.transcript.map((line) => line.content).join("\n");

    return [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcriptText },
    ];
}

function getApiErrorMessage(value: unknown): string | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const record = value as Record<string, unknown>;
    const error = record.error;
    if (typeof error !== "object" || error === null) {
        return null;
    }

    const message = (error as Record<string, unknown>).message;
    return typeof message === "string" && message.length > 0 ? message : null;
}

function getChunkDelta(value: unknown): string | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const choices = (value as Record<string, unknown>).choices;
    if (!Array.isArray(choices)) {
        return null;
    }

    const firstChoice = choices[0];
    if (typeof firstChoice !== "object" || firstChoice === null) {
        return null;
    }

    const delta = (firstChoice as Record<string, unknown>).delta;
    if (typeof delta !== "object" || delta === null) {
        return null;
    }

    const content = (delta as Record<string, unknown>).content;
    return typeof content === "string" ? content : null;
}

function parseSseEvent(eventText: string): unknown[] {
    const payloads: unknown[] = [];
    const lines = eventText.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
            continue;
        }

        const data = trimmed.slice(5).trimStart();
        if (!data || data === "[DONE]") {
            continue;
        }

        try {
            payloads.push(JSON.parse(data));
        } catch {
            // Ignore malformed SSE chunks. The stream can continue with later chunks.
        }
    }

    return payloads;
}

function processSseBuffer(buffer: string, onPayload: (payload: unknown) => void): string {
    const events = buffer.split(/\r?\n\r?\n/);
    const pending = events.pop() ?? "";

    for (const eventText of events) {
        for (const payload of parseSseEvent(eventText)) {
            onPayload(payload);
        }
    }

    return pending;
}

export async function streamSummaryFromApi(options: StreamSummaryFromApiOptions): Promise<string> {
    const apiKey = options.settings.summaryApiKey.trim();
    if (!apiKey) {
        throw new Error("API Key is not set. Please configure it in the extension options.");
    }

    const response = await fetch(resolveEndpoint(options.settings.summaryProvider), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: resolveModel(options.settings),
            messages: buildMessages(options.settings, options.request),
            stream: true,
        }),
        signal: options.signal,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = getApiErrorMessage(errorData) ?? response.statusText;
        throw new Error(`API error (${response.status}): ${errorMessage}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Response body is not readable.");
    }

    const decoder = new TextDecoder();
    let accumulated = "";
    let buffer = "";

    const handlePayload = (payload: unknown): void => {
        const delta = getChunkDelta(payload);
        if (!delta) {
            return;
        }

        accumulated += delta;
        options.onToken(accumulated);
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        buffer = processSseBuffer(buffer, handlePayload);
    }

    buffer += decoder.decode();
    for (const payload of parseSseEvent(buffer)) {
        handlePayload(payload);
    }

    return accumulated;
}
