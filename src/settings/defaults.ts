import type { ExtensionSettings } from "./types";
import {
    COPY_FORMAT_VALUES,
    DEFAULT_TAB_VALUES,
    DOWNLOAD_FORMAT_VALUES,
    GENERATION_ACCESS_MODE_VALUES,
    GENERATION_PROVIDER_VALUES,
} from "./types";

export const DEFAULT_SETTINGS: ExtensionSettings = {
    defaultTab: "original",
    generationEnabled: true,
    generationProvider: "deepseek",
    generationAccessMode: "api_key",
    generationModels: {
        overview: "",
        intensive: "",
    },
    generationApiKey: "",
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

function pickGenerationModels(raw: Record<string, unknown>): ExtensionSettings["generationModels"] {
    const models = isRecord(raw.generationModels) ? raw.generationModels : {};
    const legacyModel = pickString(raw.summaryModel);

    return {
        overview: pickString(models.overview, legacyModel),
        intensive: pickString(models.intensive, legacyModel),
    };
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

    return {
        defaultTab: pickDefaultTab(raw.defaultTab),
        generationEnabled: pickBoolean(
            raw.generationEnabled,
            pickBoolean(raw.summaryEnabled, DEFAULT_SETTINGS.generationEnabled),
        ),
        generationProvider: pickEnum(
            raw.generationProvider ?? raw.summaryProvider,
            GENERATION_PROVIDER_VALUES,
            DEFAULT_SETTINGS.generationProvider,
        ),
        generationAccessMode: pickEnum(
            raw.generationAccessMode ?? raw.summaryAccessMode,
            GENERATION_ACCESS_MODE_VALUES,
            DEFAULT_SETTINGS.generationAccessMode,
        ),
        generationModels: pickGenerationModels(raw),
        generationApiKey: pickString(raw.generationApiKey, pickString(raw.summaryApiKey)),
        generationPromptTemplates: pickGenerationPromptTemplates(raw),
        copyFormat: pickEnum(raw.copyFormat, COPY_FORMAT_VALUES, DEFAULT_SETTINGS.copyFormat),
        downloadFormat: pickEnum(raw.downloadFormat, DOWNLOAD_FORMAT_VALUES, DEFAULT_SETTINGS.downloadFormat),
    };
}
