import type { ExtensionSettings } from "./types";
import {
    COPY_FORMAT_VALUES,
    DEFAULT_TAB_VALUES,
    DOWNLOAD_FORMAT_VALUES,
    SUMMARY_ACCESS_MODE_VALUES,
    SUMMARY_PROVIDER_VALUES,
} from "./types";

export const DEFAULT_SETTINGS: ExtensionSettings = {
    defaultTab: "ts",
    summaryEnabled: true,
    summaryProvider: "openai",
    summaryAccessMode: "api_key",
    summaryModel: "",
    summaryApiKey: "",
    summaryPromptTemplate: "",
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

export function mergeSettings(value: unknown): ExtensionSettings {
    const raw = isRecord(value) ? value : {};

    return {
        defaultTab: pickEnum(raw.defaultTab, DEFAULT_TAB_VALUES, DEFAULT_SETTINGS.defaultTab),
        summaryEnabled:
            typeof raw.summaryEnabled === "boolean" ? raw.summaryEnabled : DEFAULT_SETTINGS.summaryEnabled,
        summaryProvider: pickEnum(
            raw.summaryProvider,
            SUMMARY_PROVIDER_VALUES,
            DEFAULT_SETTINGS.summaryProvider,
        ),
        summaryAccessMode: pickEnum(
            raw.summaryAccessMode,
            SUMMARY_ACCESS_MODE_VALUES,
            DEFAULT_SETTINGS.summaryAccessMode,
        ),
        summaryModel: pickString(raw.summaryModel),
        summaryApiKey: pickString(raw.summaryApiKey),
        summaryPromptTemplate: pickString(raw.summaryPromptTemplate),
        copyFormat: pickEnum(raw.copyFormat, COPY_FORMAT_VALUES, DEFAULT_SETTINGS.copyFormat),
        downloadFormat: pickEnum(raw.downloadFormat, DOWNLOAD_FORMAT_VALUES, DEFAULT_SETTINGS.downloadFormat),
    };
}
