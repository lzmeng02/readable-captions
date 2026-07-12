import { GenerationUserError } from "./errors";

export type ProviderChatMessage = { role: "system" | "user"; content: string };
export type GenerationStreamDecoderId = "chat-completions-sse";

export type ProviderRequest = {
    url: string;
    headers: Readonly<Record<string, string>>;
    body: Record<string, unknown>;
    streamDecoder: GenerationStreamDecoderId;
};

export type GenerationProviderDefinition<Id extends string = string> = {
    id: Id;
    label: string;
    apiKeyHelpUrl: string;
    modelPlaceholder: string;
    defaultModel?: string;
    modelHelpText: string;
    buildRequest(input: {
        apiKey: string;
        model: string;
        messages: readonly ProviderChatMessage[];
    }): ProviderRequest;
};

export const GENERATION_PROVIDERS = [
    {
        id: "openai",
        label: "OpenAI",
        apiKeyHelpUrl: "https://platform.openai.com/api-keys",
        modelPlaceholder: "gpt-4o-mini",
        modelHelpText: "OpenAI requires an explicit model name.",
        buildRequest: ({ apiKey, model, messages }) => ({
            url: "https://api.openai.com/v1/chat/completions",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: { model, messages, stream: true },
            streamDecoder: "chat-completions-sse" as const,
        }),
    },
    {
        id: "deepseek",
        label: "DeepSeek",
        apiKeyHelpUrl: "https://platform.deepseek.com/api_keys",
        modelPlaceholder: "deepseek-v4-flash",
        defaultModel: "deepseek-v4-flash",
        modelHelpText: "Leave blank to use the DeepSeek default model.",
        buildRequest: ({ apiKey, model, messages }) => ({
            url: "https://api.deepseek.com/chat/completions",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: {
                model,
                messages,
                stream: true,
                thinking: { type: "enabled" },
                reasoning_effort: "high",
            },
            streamDecoder: "chat-completions-sse" as const,
        }),
    },
] as const satisfies readonly GenerationProviderDefinition[];

export type GenerationProvider = (typeof GENERATION_PROVIDERS)[number]["id"];

export const GENERATION_PROVIDER_VALUES = GENERATION_PROVIDERS
    .map(({ id }) => id) as readonly GenerationProvider[];

export function isGenerationProvider(value: unknown): value is GenerationProvider {
    return typeof value === "string"
        && GENERATION_PROVIDER_VALUES.includes(value as GenerationProvider);
}

export function getGenerationProvider(
    provider: GenerationProvider,
): GenerationProviderDefinition<GenerationProvider> {
    return GENERATION_PROVIDERS.find(({ id }) => id === provider)!;
}

class MissingProviderModelError extends GenerationUserError {
    constructor(providerLabel: string) {
        super("model-missing");
        this.message = `${providerLabel} model is not set. Please configure a model in the extension options.`;
    }
}

export function resolveGenerationProviderModel(
    provider: GenerationProvider,
    configuredModel: string,
): string {
    const model = configuredModel.trim();
    if (model) return model;

    const definition = getGenerationProvider(provider);
    if (definition.defaultModel) return definition.defaultModel;

    throw new MissingProviderModelError(definition.label);
}
