import type { AppSettings, TabDefinition, TabId } from "../../shared/types";

export const BUILTIN_TABS: readonly TabDefinition[] = [
    {
        id: "read",
        label: "可读",
        description: "把字幕整理成连续段落，适合长文阅读。",
    },
    {
        id: "summary",
        label: "摘要",
        description: "生成 AI 摘要和时间点看点。",
    },
    {
        id: "transcript",
        label: "原转写",
        description: "保留逐行时间轴，适合精确定位内容。",
    },
    {
        id: "captions",
        label: "原字幕",
        description: "展示字幕时间范围，便于对照原字幕块。",
    },
];

const BUILTIN_TAB_SET = new Set<TabId>(BUILTIN_TABS.map((tab) => tab.id));

export const DEFAULT_SUMMARY_PROMPT = [
    "请基于视频字幕生成中文摘要。",
    "输出格式必须严格如下：",
    "Summary:",
    "一到两段摘要。",
    "",
    "Highlights:",
    "- [mm:ss] 看点 1",
    "- [mm:ss] 看点 2",
    "- [mm:ss] 看点 3",
].join("\n");

export const DEFAULT_SETTINGS: AppSettings = {
    visibleTabs: ["read", "summary", "transcript", "captions"],
    defaultTab: "read",
    summary: {
        provider: "disabled",
        apiKey: "",
        model: "gpt-4.1-mini",
        prompt: DEFAULT_SUMMARY_PROMPT,
    },
};

export function isTabId(value: string): value is TabId {
    return BUILTIN_TAB_SET.has(value as TabId);
}

function normalizeVisibleTabs(visibleTabs: unknown): TabId[] {
    const rawTabs = Array.isArray(visibleTabs) ? visibleTabs.filter((value): value is string => typeof value === "string") : [];
    const deduped = rawTabs.filter((value, index) => rawTabs.indexOf(value) === index);
    const validTabs = deduped.filter(isTabId);

    return validTabs.length > 0 ? validTabs : [...DEFAULT_SETTINGS.visibleTabs];
}

export function normalizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
    const visibleTabs = normalizeVisibleTabs(input?.visibleTabs);
    const defaultTab = input?.defaultTab && visibleTabs.includes(input.defaultTab) ? input.defaultTab : visibleTabs[0];
    const summaryInput: Partial<AppSettings["summary"]> = input?.summary ?? {};

    return {
        visibleTabs,
        defaultTab,
        summary: {
            provider:
                summaryInput.provider === "openai" || summaryInput.provider === "chatgpt_web"
                    ? summaryInput.provider
                    : "disabled",
            apiKey: typeof summaryInput.apiKey === "string" ? summaryInput.apiKey : DEFAULT_SETTINGS.summary.apiKey,
            model: typeof summaryInput.model === "string" && summaryInput.model.trim().length > 0
                ? summaryInput.model.trim()
                : DEFAULT_SETTINGS.summary.model,
            prompt: typeof summaryInput.prompt === "string" && summaryInput.prompt.trim().length > 0
                ? summaryInput.prompt
                : DEFAULT_SETTINGS.summary.prompt,
        },
    };
}
