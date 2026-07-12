import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import { GENERATION_PROVIDER_VALUES } from "../../src/generation/provider-catalog";
import type {
    ExtensionSettings,
    GenerationPromptTemplates,
    GenerationProvider,
    GenerationProviderProfile,
    GenerationProviderSettings,
} from "../../src/settings/types";
import type { GenerationRequest } from "../../src/generation/types";

export type SettingsOverrides = Partial<Omit<
    ExtensionSettings,
    "generationProviderSettings" | "generationPromptTemplates"
>> & {
    generationProviderSettings?: Partial<Record<GenerationProvider, Partial<GenerationProviderProfile>>>;
    generationPromptTemplates?: Partial<GenerationPromptTemplates>;
};

export function createSettings(overrides: SettingsOverrides = {}): ExtensionSettings {
    const generationProvider = overrides.generationProvider ?? DEFAULT_SETTINGS.generationProvider;
    const generationProviderSettings = Object.fromEntries(
        GENERATION_PROVIDER_VALUES.map((provider) => {
            const defaultProfile = DEFAULT_SETTINGS.generationProviderSettings[provider];
            const profileOverride = overrides.generationProviderSettings?.[provider];
            const apiKey = profileOverride?.apiKey
                ?? (provider === generationProvider
                    ? provider === "openai" ? "oa-test-key" : "ds-test-key"
                    : defaultProfile.apiKey);

            return [provider, {
                ...defaultProfile,
                ...profileOverride,
                apiKey,
                models: {
                    ...defaultProfile.models,
                    ...profileOverride?.models,
                },
            }];
        }),
    ) as GenerationProviderSettings;

    return {
        ...DEFAULT_SETTINGS,
        ...overrides,
        generationProvider,
        generationProviderSettings,
        generationPromptTemplates: {
            ...DEFAULT_SETTINGS.generationPromptTemplates,
            ...overrides.generationPromptTemplates,
        },
    };
}

export const generationRequest: GenerationRequest = {
    task: "overview",
    transcript: [{ from: 0, to: 1, content: "hello" }],
    metadata: { title: "Video", url: "https://www.bilibili.com/video/BV1abc" },
};

export function createSseResponse(chunks: readonly string[], init: ResponseInit = {}): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
    return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        ...init,
    });
}

export const successfulSse = [
    'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
    "data: [DONE]\n\n",
];
