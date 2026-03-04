import { buildSummaryPrompt } from "./summarizer";
import type { SummaryRequest, SummaryResult, Summarizer } from "../../shared/types";

export class ChatGPTWebSummarizer implements Summarizer {
    private readonly targetWindow: Window;

    constructor(targetWindow: Window) {
        this.targetWindow = targetWindow;
    }

    async summarize(request: SummaryRequest): Promise<SummaryResult> {
        const prompt = buildSummaryPrompt(request);

        await navigator.clipboard.writeText(prompt);
        this.targetWindow.open("https://chatgpt.com/", "_blank", "noopener");

        return {
            provider: "chatgpt_web",
            text: "已复制摘要提示词并打开 ChatGPT Web。当前版本会把提示词交给你继续粘贴，不会自动回填结果。",
            highlights: [],
        };
    }
}
