import type { ExtensionSettings } from "../settings/types";
import type { GenerationMetadata, GenerationRequest, GenerationTask } from "./types";

type ChatMessage = {
    role: "system" | "user";
    content: string;
};

type StreamGenerationFromApiOptions = {
    settings: ExtensionSettings;
    request: GenerationRequest;
    signal: AbortSignal;
    onToken: (partialText: string) => void;
};

const OVERVIEW_PROMPT = `
你是 Readable Captions 的信息提取器。你的目标不是复述视频，而是帮助用户节省观看时间。

请基于字幕和视频信息输出 Markdown。必须包含：
1. "TL;DR"：用 1-3 句话给出最短有用结论。
2. "观看建议"：明确告诉用户适合直接读文字、建议只看关键片段，还是必须看原视频，并给出依据。
3. "关键时间戳"：列出值得看、需要查证或可以跳过的片段。时间戳必须来自字幕，格式使用 [mm:ss]。

然后根据视频内容自适应补充 2-4 个最有用模块，例如：适合谁/不适合谁、最大缺点、竞品对比、核心经验、踩坑提醒、知识点地图、行动建议、市场调研洞察。

要求：
- 把最有用的信息放前面。
- 避免"本视频介绍了..."这类泛泛总结。
- 不要暴露内部视频类型或模式判断。
- 不要编造字幕外事实；不确定时说明只能从字幕判断。
- 输出只用 Markdown，不要包裹代码块。
`.trim();

const INTENSIVE_PROMPT = `
请将以下视频字幕整理成高信息密度阅读稿，用来替代观看视频。

要求：
- 保留视频的大致展开顺序，但允许重组局部逻辑。
- 去掉口头禅、重复表达、无意义寒暄、跑题内容和自我纠正。
- 把口播改成清楚的书面表达，按主题自然分段。
- 保留关键例子、判断标准、限制条件和具体信息。
- 不要写成普通摘要，不要大幅压缩到只剩结论。
- 不要添加字幕外事实。
- 可在段落标题或关键段落旁保留少量 [mm:ss] 时间戳，方便回看。
- 输出只用 Markdown，不要包裹代码块。
`.trim();

const NOTE_PROMPT = `
请把这个视频整理成可带走、可复用的 Markdown Note。Note 不是总览，也不是精读稿；它应按知识结构重组，适合保存到 Obsidian、Notion、项目文档或调研材料。

要求：
- 第一行使用一个准确的 H1 标题。
- 必须包含"核心结论"和"值得回看的片段"。
- 根据内容自适应组织模块，例如：可复用经验、作者踩过的坑、判断标准、关键例子、知识点地图、产品/竞品洞察、行动建议。
- "值得回看的片段"必须使用来自字幕的 [mm:ss] 时间戳。
- 不要简单复制精读稿，不要机械按字幕顺序复述。
- 不要添加字幕外事实；不确定时说明只能从字幕判断。
- 输出完整 Markdown，不要包裹代码块。
`.trim();

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

function getBasePrompt(task: GenerationTask): string {
    if (task === "overview") {
        return OVERVIEW_PROMPT;
    }
    if (task === "note") {
        return NOTE_PROMPT;
    }
    return INTENSIVE_PROMPT;
}

function buildSystemPrompt(settings: ExtensionSettings, task: GenerationTask): string {
    const customPrompt = settings.summaryPromptTemplate.trim();
    const basePrompt = getBasePrompt(task);
    if (!customPrompt) {
        return basePrompt;
    }

    return `${basePrompt}\n\n用户自定义补充指令：\n${customPrompt}`;
}

function formatTimestamp(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `[${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}]`;
}

function formatMetadata(metadata: GenerationMetadata | undefined): string {
    if (!metadata) {
        return "无";
    }

    const lines = [
        `标题：${metadata.title || "未知"}`,
        `URL：${metadata.url || "未知"}`,
    ];

    if (metadata.source) {
        lines.push(`字幕来源：${metadata.source}`);
    }
    if (typeof metadata.aid === "number") {
        lines.push(`aid：${metadata.aid}`);
    }
    if (typeof metadata.cid === "number") {
        lines.push(`cid：${metadata.cid}`);
    }

    return lines.join("\n");
}

function buildMessages(settings: ExtensionSettings, request: GenerationRequest): ChatMessage[] {
    const transcriptText = request.transcript
        .map((line) => `${formatTimestamp(line.from)} ${line.content}`)
        .join("\n");

    return [
        { role: "system", content: buildSystemPrompt(settings, request.task) },
        {
            role: "user",
            content: `视频信息：\n${formatMetadata(request.metadata)}\n\n字幕：\n${transcriptText}`,
        },
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

export async function streamGenerationFromApi(options: StreamGenerationFromApiOptions): Promise<string> {
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
