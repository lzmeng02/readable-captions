import { getSettings } from "../settings/storage";
import type { SummaryRequest } from "./types";

export type StreamingSummarizeOptions = {
    request: SummaryRequest;
    onToken: (partialText: string) => void;
    onDone: (fullText: string) => void;
    onError: (error: Error) => void;
};

/**
 * Streaming LLM summarizer.
 * Calls onToken() with accumulated text as each SSE chunk arrives.
 * Returns an AbortController so the caller can cancel mid-stream.
 */
export function summarizeStreaming(options: StreamingSummarizeOptions): AbortController {
    const controller = new AbortController();

    (async () => {
        try {
            const settings = await getSettings();
            const { summaryProvider, summaryApiKey, summaryModel, summaryPromptTemplate } = settings;

            if (!summaryApiKey) {
                throw new Error("API Key is not set. Please configure it in the extension options.");
            }

            const textContent = options.request.transcript.map(line => line.content).join("\n");
            const systemPrompt = summaryPromptTemplate || "Please summarize the following video transcript. Extract the main points and organize them logically.";

            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: textContent },
            ];

            let endpoint = "https://api.openai.com/v1/chat/completions";
            if (summaryProvider === "deepseek") {
                endpoint = "https://api.deepseek.com/chat/completions";
            }

            let model = summaryModel;
            if (!model) {
                model = summaryProvider === "deepseek" ? "deepseek-chat" : "gpt-3.5-turbo";
            }

            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${summaryApiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    stream: true,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || response.statusText;
                throw new Error(`API error (${response.status}): ${errorMessage}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("Response body is not readable.");
            }

            const decoder = new TextDecoder();
            let accumulated = "";
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // SSE format: each event is separated by double newlines
                const lines = buffer.split("\n");
                // Keep the last potentially incomplete line in the buffer
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === "data: [DONE]") continue;
                    if (!trimmed.startsWith("data: ")) continue;

                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        const delta = json.choices?.[0]?.delta?.content;
                        if (delta) {
                            accumulated += delta;
                            options.onToken(accumulated);
                        }
                    } catch {
                        // Skip malformed JSON chunks
                    }
                }
            }

            options.onDone(accumulated);
        } catch (err: any) {
            if (err.name === "AbortError") return; // Cancelled by user, don't report
            options.onError(err instanceof Error ? err : new Error(String(err)));
        }
    })();

    return controller;
}
