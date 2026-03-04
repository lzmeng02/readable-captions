import { buildSummaryPrompt, extractHighlights } from "./summarizer";
import type { Fetcher } from "../http/fetcher";
import type { SummaryRequest, SummaryResult, Summarizer } from "../../shared/types";

type OpenAIResponse = {
    output_text?: string;
    output?: Array<{
        content?: Array<{
            type?: string;
            text?: string;
        }>;
    }>;
    error?: {
        message?: string;
    };
};

function extractOutputText(response: OpenAIResponse): string {
    if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
        return response.output_text.trim();
    }

    const parts = response.output ?? [];
    const text = parts
        .flatMap((item) => item.content ?? [])
        .filter((content) => content.type === "output_text" && typeof content.text === "string")
        .map((content) => content.text?.trim() ?? "")
        .join("\n")
        .trim();

    if (text.length > 0) {
        return text;
    }

    throw new Error(response.error?.message ?? "OpenAI 未返回可用摘要。");
}

export class OpenAISummarizer implements Summarizer {
    private readonly fetcher: Fetcher;

    constructor(fetcher: Fetcher) {
        this.fetcher = fetcher;
    }

    async summarize(request: SummaryRequest): Promise<SummaryResult> {
        const apiKey = request.settings.summary.apiKey.trim();
        if (!apiKey) {
            throw new Error("请先在设置中填写 OpenAI API Key。");
        }

        const prompt = buildSummaryPrompt(request);
        const model = request.settings.summary.model.trim() || "gpt-4.1-mini";

        const response = await this.fetcher.json<OpenAIResponse>("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                instructions: "You turn video transcripts into concise Chinese summaries with timestamped highlights.",
                input: prompt,
                text: {
                    format: {
                        type: "text",
                    },
                },
            }),
        });

        const text = extractOutputText(response);

        return {
            provider: "openai",
            model,
            text,
            highlights: extractHighlights(text),
        };
    }
}
