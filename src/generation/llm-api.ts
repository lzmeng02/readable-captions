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

const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_REASONING_EFFORT = "high";
const DEFAULT_EXTRA_BODY = {
    thinking: {
        type: "enabled",
    },
} as const;

const GENERATOR_PROMPT = `
你是 Readable Captions 的 Overview 生成器。

我会给你视频标题、简介和带时间戳的字幕。

你的任务：提取这个视频中对用户最重要、最有用的信息，帮助用户节省观看时间。目标是：如果用户只想拿结论或操作路径，看完 Overview 就可以不看原视频。
用户的阅读窗口极小，每行最多只能显示 30 个中文字符。为了保证可读性，把信息切成小段落，每段控制在 2-3 行（60-90 字）以内。


输出三部分：

## TL;DR

用 1-3 句话给出这个视频最值得带走的核心信息。

不要写“这个视频讲了什么”，而要写“看完这个视频你应该知道什么 / 能做什么”。

如果视频有反直觉信息、明确结论、风险提示、购买/使用建议、可迁移经验、操作路径或行动含义，优先放在 TL;DR 里。保持简洁短小，减少用户阅读压力。

## 要点 / 步骤

列出 3-5 条用户最该知道的信息。如果是长视频，允许超过5条。

要求：
- 每条必须具体、短小、容易理解。
- 不要按字幕顺序机械总结。
- 不要强行套固定模板，根据视频内容选择最有用的信息。
- 如果视频是教程、实操演示、安装配置、工具使用、代码实现、工作流搭建等流程型内容，优先提取 step-by-step 步骤。步骤要能让用户照着做，格式为：动作 → 目的/注意点。
- 如果步骤很多，只保留完成核心目标所需的主路径；高级功能、补充技巧放在后面。
- 如果视频不是流程型内容，优先提炼结论、原因、证据、限制条件、可迁移经验、关键误解、风险或行动含义。
- 要点应尽量呈现逻辑关系，而不是信息堆叠。优先使用：结论 → 原因 → 证据；问题 → 方案 → 代价；误解 → 澄清 → 依据；现象 → 解释 → 信号；做法 → 问题 → 根因 → 修正。
- 如果视频有明显论证链，可以用“核心主张 → 关键依据 → 结论边界”的方式组织。
- 如果存在明显逻辑跳跃，简短标注“此处缺少从 A 到 B 的中间依据”。

根据视频内容自动侧重：
- 测评/对比：最终建议、适合/不适合人群、关键优缺点、竞品差异。
- 教程/工具使用：核心操作路径、必要配置、常用命令、容易踩坑的地方。
- 工程经验/方案分享：核心经验、方案骨架、踩坑、适用上下文。
- 课程/科普：知识结构、核心概念、前置知识、常见误解。
- 市场/行业分析：机会信号、关键数据、论证逻辑、缺失视角。
- 其他类型：只提炼对用户最有用的信息，不强行分类。

## 时间戳

列出 3-5 个最值得回看的片段。如果是长教程，允许超过5条。

格式：
- [mm:ss] 简短标题：为什么值得看

要求：
- 时间戳必须来自字幕。
- 只选真正有信息量的片段，不要列寒暄、铺垫、重复解释。
- 如果是教程视频，优先选择关键操作演示、配置步骤、错误处理、重要命令解释所在片段。
- 每条说明保持简洁。

通用要求：
- 把最有用的信息放最前面。
- 避免“本视频介绍了……”“UP 主讲到了……”这类元叙述，直接给出信息本身。
- 区分事实与推测：字幕明确说的可以直接陈述；你推断的用“可能”“似乎”；不确定的写“字幕中未提供”。
- 不要编造字幕外事实。
- 不要暴露内部类型判断，例如“这是教程类视频所以……”。
- 不要输出任何开场白、问候语、确认语或过渡文字。
- 输出只用 Markdown，不要包裹代码块。
- 字幕可能来自语音转写，包含同音误识别。请根据上下文修正常见技术名词。
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

function resolveEndpoint(provider: ExtensionSettings["generationProvider"]): string {
    return provider === "deepseek"
        ? "https://api.deepseek.com/chat/completions"
        : "https://api.openai.com/v1/chat/completions";
}

function resolveConfiguredModel(settings: ExtensionSettings, task: GenerationTask): string {
    if (task === "overview") {
        return settings.generationModels.overview;
    }

    return settings.generationModels.intensive;
}

function resolveModel(settings: ExtensionSettings, task: GenerationTask): string {
    const configuredModel = resolveConfiguredModel(settings, task).trim();
    if (configuredModel.length > 0) {
        return configuredModel;
    }

    if (settings.generationProvider === "deepseek") {
        return DEFAULT_DEEPSEEK_MODEL;
    }

    throw new Error("OpenAI model is not set. Please configure a model in the extension options.");
}

function resolvePromptTemplate(settings: ExtensionSettings, task: GenerationTask): string {
    if (task === "overview") {
        return settings.generationPromptTemplates.overview;
    }

    return settings.generationPromptTemplates.intensive;
}

function getBasePrompt(task: GenerationTask): string {
    if (task === "overview") {
        return GENERATOR_PROMPT;
    }
    if (task === "note") {
        return NOTE_PROMPT;
    }
    return INTENSIVE_PROMPT;
}

function buildSystemPrompt(settings: ExtensionSettings, task: GenerationTask): string {
    const customPrompt = resolvePromptTemplate(settings, task).trim();
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
    const apiKey = options.settings.generationApiKey.trim();
    if (!apiKey) {
        throw new Error("API Key is not set. Please configure it in the extension options.");
    }

    const messages = buildMessages(options.settings, options.request);
    const isDeepSeek = options.settings.generationProvider === "deepseek";

    const body: Record<string, unknown> = {
        model: resolveModel(options.settings, options.request.task),
        messages,
        stream: true,
    };

    if (isDeepSeek) {
        body.reasoning_effort = DEFAULT_REASONING_EFFORT;
        body.extra_body = DEFAULT_EXTRA_BODY;
    }

    const response = await fetch(resolveEndpoint(options.settings.generationProvider), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
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
