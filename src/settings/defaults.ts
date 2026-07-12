import {
    GENERATION_PROVIDER_VALUES,
    isGenerationProvider,
} from "../generation/provider-catalog";
import type {
    ExtensionSettings,
    GenerationModels,
    GenerationProvider,
    GenerationProviderProfile,
    GenerationProviderSettings,
} from "./types";
import {
    COPY_FORMAT_VALUES,
    DEFAULT_TAB_VALUES,
    DOWNLOAD_FORMAT_VALUES,
} from "./types";

function createEmptyProviderProfile(): GenerationProviderProfile {
    return {
        apiKey: "",
        models: {
            overview: "",
            intensive: "",
        },
    };
}

function createEmptyProviderSettings(): GenerationProviderSettings {
    return Object.fromEntries(
        GENERATION_PROVIDER_VALUES.map((provider) => [provider, createEmptyProviderProfile()]),
    ) as GenerationProviderSettings;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
    defaultTab: "original",
    generationEnabled: true,
    generationProvider: "deepseek",
    generationProviderSettings: createEmptyProviderSettings(),
    generationPromptTemplates: {
        overview: "",
        intensive: "",
    },
    copyFormat: "readable_text",
    downloadFormat: "txt",
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    if (typeof value === "string" && allowed.includes(value as T)) {
        return value as T;
    }

    return fallback;
}

function pickString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function pickTrimmedString(value: unknown, fallback = ""): string {
    return pickString(value, fallback).trim();
}

function pickDefaultTab(value: unknown): ExtensionSettings["defaultTab"] {
    if (value === "summary") {
        return "overview";
    }

    if (value === "read") {
        return "intensive";
    }

    return pickEnum(value, DEFAULT_TAB_VALUES, DEFAULT_SETTINGS.defaultTab);
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function normalizeGenerationModels(value: unknown): GenerationModels {
    const models = isRecord(value) ? value : {};

    return {
        overview: pickTrimmedString(models.overview),
        intensive: pickTrimmedString(models.intensive),
    };
}

function normalizeProviderProfile(value: unknown): GenerationProviderProfile {
    const profile = isRecord(value) ? value : {};

    return {
        apiKey: pickTrimmedString(profile.apiKey),
        models: normalizeGenerationModels(profile.models),
    };
}

function normalizeProviderSettings(value: unknown): GenerationProviderSettings {
    const providerSettings = isRecord(value) ? value : {};

    return Object.fromEntries(
        GENERATION_PROVIDER_VALUES.map((provider) => [
            provider,
            normalizeProviderProfile(providerSettings[provider]),
        ]),
    ) as GenerationProviderSettings;
}

function migrateLegacyGenerationModels(raw: Record<string, unknown>): GenerationModels {
    const models = isRecord(raw.generationModels) ? raw.generationModels : {};
    const legacyModel = pickTrimmedString(raw.summaryModel);

    return {
        overview: pickTrimmedString(models.overview, legacyModel),
        intensive: pickTrimmedString(models.intensive, legacyModel),
    };
}

function migrateLegacyProviderSettings(
    raw: Record<string, unknown>,
    provider: GenerationProvider,
): GenerationProviderSettings {
    const providerSettings = createEmptyProviderSettings();
    providerSettings[provider] = {
        apiKey: pickTrimmedString(raw.generationApiKey, pickString(raw.summaryApiKey)),
        models: migrateLegacyGenerationModels(raw),
    };

    return providerSettings;
}

function pickGenerationPromptTemplates(raw: Record<string, unknown>): ExtensionSettings["generationPromptTemplates"] {
    const templates = isRecord(raw.generationPromptTemplates) ? raw.generationPromptTemplates : {};
    const legacyPrompt = pickString(raw.generationPromptTemplate, pickString(raw.summaryPromptTemplate));

    return {
        overview: pickString(templates.overview, legacyPrompt),
        intensive: pickString(templates.intensive, legacyPrompt),
    };
}

export function mergeSettings(value: unknown): ExtensionSettings {
    const raw = isRecord(value) ? value : {};
    const provider = isGenerationProvider(raw.generationProvider)
        ? raw.generationProvider
        : isGenerationProvider(raw.summaryProvider)
            ? raw.summaryProvider
            : DEFAULT_SETTINGS.generationProvider;
    const hasProviderSettings = Object.hasOwn(raw, "generationProviderSettings");
    const providerSettings = hasProviderSettings
        ? normalizeProviderSettings(raw.generationProviderSettings)
        : migrateLegacyProviderSettings(raw, provider);

    return {
        defaultTab: pickDefaultTab(raw.defaultTab),
        generationEnabled: pickBoolean(
            raw.generationEnabled,
            pickBoolean(raw.summaryEnabled, DEFAULT_SETTINGS.generationEnabled),
        ),
        generationProvider: provider,
        generationProviderSettings: providerSettings,
        generationPromptTemplates: pickGenerationPromptTemplates(raw),
        copyFormat: pickEnum(raw.copyFormat, COPY_FORMAT_VALUES, DEFAULT_SETTINGS.copyFormat),
        downloadFormat: pickEnum(raw.downloadFormat, DOWNLOAD_FORMAT_VALUES, DEFAULT_SETTINGS.downloadFormat),
    };
}
