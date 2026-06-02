import type { ExtensionSettings, PublicExtensionSettings } from "./types";

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

function hashString(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36);
}

export const DEFAULT_PUBLIC_SETTINGS: PublicExtensionSettings = {
    defaultTab: "original",
    generationEnabled: true,
    copyFormat: "readable_text",
    downloadFormat: "txt",
    generationSettingsKey: hashString(JSON.stringify({
        provider: "deepseek",
        accessMode: "api_key",
        models: {
            overview: "",
            intensive: "",
        },
        prompts: {
            overview: "",
            intensive: "",
        },
    })),
};

function getGenerationSettingsKey(settings: ExtensionSettings): string {
    return hashString(JSON.stringify({
        provider: settings.generationProvider,
        accessMode: settings.generationAccessMode,
        models: settings.generationModels,
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
        && typeof settings.generationEnabled === "boolean"
        && typeof settings.copyFormat === "string"
        && typeof settings.downloadFormat === "string"
        && typeof settings.generationSettingsKey === "string";
}
