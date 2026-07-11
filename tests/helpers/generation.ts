import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import type { ExtensionSettings } from "../../src/settings/types";
import type { GenerationRequest } from "../../src/generation/types";

export type SettingsOverrides = Partial<Omit<
    ExtensionSettings,
    "generationModels" | "generationPromptTemplates"
>> & {
    generationModels?: Partial<ExtensionSettings["generationModels"]>;
    generationPromptTemplates?: Partial<ExtensionSettings["generationPromptTemplates"]>;
};

export function createSettings(overrides: SettingsOverrides = {}): ExtensionSettings {
    return {
        ...DEFAULT_SETTINGS,
        ...overrides,
        generationApiKey: overrides.generationApiKey ?? "test-key",
        generationModels: { ...DEFAULT_SETTINGS.generationModels, ...overrides.generationModels },
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
