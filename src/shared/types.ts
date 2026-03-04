export type TranscriptLine = {
    from: number;
    to: number;
    sid?: number;
    location?: number;
    content: string;
    music?: number;
};

export type TranscriptSource = "human_view" | "ai_wbi" | "none";

export type TabId = "read" | "summary" | "transcript" | "captions";

export type SummaryProvider = "disabled" | "openai" | "chatgpt_web";

export type PanelPlacement = "sidebar" | "reader";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface TranscriptBundle {
    lines: TranscriptLine[];
    source: TranscriptSource;
    subtitleUrl?: string;
    aid?: number;
    cid?: number;
}

export interface TabDefinition {
    id: TabId;
    label: string;
    description: string;
}

export interface SummaryHighlight {
    id: string;
    text: string;
    time: number | null;
    label: string;
}

export interface SummaryResult {
    provider: SummaryProvider;
    model?: string;
    text: string;
    highlights: SummaryHighlight[];
}

export interface SummaryState {
    status: "idle" | "loading" | "ready" | "error";
    data: SummaryResult | null;
    error: string | null;
}

export interface SummarySettings {
    provider: SummaryProvider;
    apiKey: string;
    model: string;
    prompt: string;
}

export interface AppSettings {
    visibleTabs: TabId[];
    defaultTab: TabId;
    summary: SummarySettings;
}

export interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}

export interface Fetcher {
    json<T>(url: string, init?: RequestInit): Promise<T>;
}

export interface SettingsService {
    load(): Promise<AppSettings>;
    save(next: AppSettings): Promise<AppSettings>;
}

export interface Exporter {
    copyTranscript(bundle: TranscriptBundle): Promise<void>;
    downloadTranscript(bundle: TranscriptBundle, filenameBase: string): void;
}

export interface SummaryRequest {
    transcript: TranscriptBundle;
    settings: AppSettings;
    videoTitle: string;
}

export interface Summarizer {
    summarize(request: SummaryRequest): Promise<SummaryResult>;
}

export interface PlatformCapabilities {
    readerMode: boolean;
    pictureInPicture: boolean;
}

export interface PlatformSessionContext {
    url: URL;
    document: Document;
    window: Window;
}

export interface PlatformSession {
    readonly id: string;
    readonly displayName: string;
    readonly capabilities: PlatformCapabilities;
    waitForReady(): Promise<void>;
    mountPanelHost(host: HTMLElement, placement: PanelPlacement): void;
    fetchTranscript(): Promise<TranscriptBundle>;
    getVideoElement(): HTMLVideoElement | null;
    requestPictureInPicture(): Promise<boolean>;
    exitPictureInPicture(): Promise<void>;
    dispose(): void;
}

export interface PlatformAdapter {
    readonly id: string;
    readonly displayName: string;
    matches(url: URL): boolean;
    createSession(context: PlatformSessionContext): PlatformSession;
}
