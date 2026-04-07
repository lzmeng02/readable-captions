import { getSettings } from "../settings/storage";
import type { SummaryProvider, SummaryRequest, SummaryResult } from "./types";

export const llmSummaryProvider: SummaryProvider = {
    providerId: "llm",

    async summarize(request: SummaryRequest): Promise<SummaryResult> {
        const settings = await getSettings();
        const { summaryProvider, summaryApiKey, summaryModel, summaryPromptTemplate } = settings;

        if (!summaryApiKey) {
            throw new Error("API Key is not set. Please configure it in the extension options.");
        }

        const textContent = request.transcript.map(line => line.content).join("\n");
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
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || response.statusText;
            throw new Error(`API error (${response.status}): ${errorMessage}`);
        }

        const data = await response.json();
        const aiText = data.choices?.[0]?.message?.content || "";

        return {
            status: "ready",
            text: aiText,
            sections: [],
        };
    },
};
