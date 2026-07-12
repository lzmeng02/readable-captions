import { DEFAULT_SETTINGS } from "./defaults";
import type { ExtensionSettings, PublicExtensionSettings } from "./types";
import {
    COPY_FORMAT_VALUES,
    DEFAULT_TAB_VALUES,
    DOWNLOAD_FORMAT_VALUES,
} from "./types";

export const PUBLIC_SETTINGS_PORT = "readable-captions-public-settings";

export type PublicSettingsPortMessage =
    | {
        type: "settings";
        settings: PublicExtensionSettings;
    }
    | {
        type: "error";
        message: string;
    };

function digestString(value: string): string {
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= BigInt(value.charCodeAt(i));
        hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }

    return hash.toString(36).padStart(13, "0");
}

function getGenerationSettingsKey(settings: ExtensionSettings): string {
    const selectedProfile = settings.generationProviderSettings[settings.generationProvider];

    return digestString(JSON.stringify({
        provider: settings.generationProvider,
        models: selectedProfile.models,
        prompts: settings.generationPromptTemplates,
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function toPublicSettings(settings: ExtensionSettings): PublicExtensionSettings {
    return {
        defaultTab: settings.defaultTab,
        generationEnabled: settings.generationEnabled,
        copyFormat: settings.copyFormat,
        downloadFormat: settings.downloadFormat,
        generationSettingsKey: getGenerationSettingsKey(settings),
    };
}

export const DEFAULT_PUBLIC_SETTINGS = toPublicSettings(DEFAULT_SETTINGS);

export function isPublicSettingsPortMessage(message: unknown): message is PublicSettingsPortMessage {
    if (!isRecord(message) || typeof message.type !== "string") {
        return false;
    }

    if (message.type === "error") {
        return typeof message.message === "string";
    }

    if (message.type !== "settings" || !isRecord(message.settings)) {
        return false;
    }

    const settings = message.settings;
    return typeof settings.defaultTab === "string"
        && DEFAULT_TAB_VALUES.includes(settings.defaultTab as ExtensionSettings["defaultTab"])
        && typeof settings.generationEnabled === "boolean"
        && typeof settings.copyFormat === "string"
        && COPY_FORMAT_VALUES.includes(settings.copyFormat as ExtensionSettings["copyFormat"])
        && typeof settings.downloadFormat === "string"
        && DOWNLOAD_FORMAT_VALUES.includes(settings.downloadFormat as ExtensionSettings["downloadFormat"])
        && typeof settings.generationSettingsKey === "string";
}
