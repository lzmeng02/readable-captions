import type { GenerationProvider } from "../generation/provider-catalog";

export type { GenerationProvider } from "../generation/provider-catalog";

export const DEFAULT_TAB_VALUES = ["original", "intensive", "overview"] as const;
export const COPY_FORMAT_VALUES = ["readable_text", "timestamped_text"] as const;
export const DOWNLOAD_FORMAT_VALUES = ["txt", "srt"] as const;

export type DefaultTab = (typeof DEFAULT_TAB_VALUES)[number];
export type CopyFormat = (typeof COPY_FORMAT_VALUES)[number];
export type DownloadFormat = (typeof DOWNLOAD_FORMAT_VALUES)[number];

export type GenerationModels = {
    overview: string;
    intensive: string;
};

export type GenerationPromptTemplates = {
    overview: string;
    intensive: string;
};

export type GenerationProviderProfile = {
    apiKey: string;
    models: GenerationModels;
};

export type GenerationProviderSettings = Record<GenerationProvider, GenerationProviderProfile>;

export type ExtensionSettings = {
    defaultTab: DefaultTab;
    generationEnabled: boolean;
    generationProvider: GenerationProvider;
    generationProviderSettings: GenerationProviderSettings;
    generationPromptTemplates: GenerationPromptTemplates;
    copyFormat: CopyFormat;
    downloadFormat: DownloadFormat;
};

export type PublicExtensionSettings = Pick<
    ExtensionSettings,
    "defaultTab" | "generationEnabled" | "copyFormat" | "downloadFormat"
> & {
    generationSettingsKey: string;
};
