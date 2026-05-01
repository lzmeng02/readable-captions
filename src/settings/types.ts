export const DEFAULT_TAB_VALUES = ["original", "read", "intensive", "summary"] as const;
export const SUMMARY_PROVIDER_VALUES = ["openai", "deepseek"] as const;
export const SUMMARY_ACCESS_MODE_VALUES = ["api_key", "webapp"] as const;
export const COPY_FORMAT_VALUES = ["readable_text", "timestamped_text"] as const;
export const DOWNLOAD_FORMAT_VALUES = ["txt", "srt"] as const;

export type DefaultTab = (typeof DEFAULT_TAB_VALUES)[number];
export type SummaryProvider = (typeof SUMMARY_PROVIDER_VALUES)[number];
export type SummaryAccessMode = (typeof SUMMARY_ACCESS_MODE_VALUES)[number];
export type CopyFormat = (typeof COPY_FORMAT_VALUES)[number];
export type DownloadFormat = (typeof DOWNLOAD_FORMAT_VALUES)[number];

export type ExtensionSettings = {
    defaultTab: DefaultTab;
    summaryEnabled: boolean;
    summaryProvider: SummaryProvider;
    summaryAccessMode: SummaryAccessMode;
    summaryModel: string;
    summaryApiKey: string;
    summaryPromptTemplate: string;
    copyFormat: CopyFormat;
    downloadFormat: DownloadFormat;
};
