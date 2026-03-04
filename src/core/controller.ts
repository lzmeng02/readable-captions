import { render } from "lit";
import { createStore } from "./store";
import { createRouteKey } from "./route";
import { watchLocationChange } from "./lifecycle";
import { normalizeSettings } from "../services/settings/schema";
import { parseSettingsForm } from "../ui/components/rc-settings-modal";
import { panelTemplate } from "../ui/components/rc-panel";
import { panelStyles } from "../ui/styles/panel.css";
import type { PlatformRegistry } from "../platforms";
import type {
    AppSettings,
    Exporter,
    LoadStatus,
    Logger,
    PanelPlacement,
    PlatformCapabilities,
    PlatformSession,
    SettingsService,
    SummaryState,
    Summarizer,
    TabId,
    TranscriptBundle,
} from "../shared/types";

type AppState = {
    collapsed: boolean;
    status: LoadStatus;
    errorMessage: string | null;
    currentTab: TabId;
    settings: AppSettings;
    settingsOpen: boolean;
    placement: PanelPlacement;
    transcript: TranscriptBundle | null;
    summary: SummaryState;
    capabilities: PlatformCapabilities;
};

interface ControllerDeps {
    window: Window;
    document: Document;
    logger: Logger;
    platformRegistry: PlatformRegistry;
    settingsService: SettingsService;
    summarizer: Summarizer;
    exporter: Exporter;
}

const ROOT_ID = "readable-captions-root";

const defaultSummaryState: SummaryState = {
    status: "idle",
    data: null,
    error: null,
};

function defaultCapabilities(): PlatformCapabilities {
    return {
        readerMode: false,
        pictureInPicture: false,
    };
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "未知错误";
}

export class ReadableCaptionsController {
    private readonly deps: ControllerDeps;
    private readonly store = createStore<AppState>({
        collapsed: false,
        status: "idle",
        errorMessage: null,
        currentTab: "read",
        settings: normalizeSettings(null),
        settingsOpen: false,
        placement: "sidebar",
        transcript: null,
        summary: defaultSummaryState,
        capabilities: defaultCapabilities(),
    });

    private host: HTMLElement | null = null;
    private currentSession: PlatformSession | null = null;
    private loadSequence = 0;
    private routeKey = "";

    constructor(deps: ControllerDeps) {
        this.deps = deps;
        this.store.subscribe(() => this.render());
    }

    async start(): Promise<void> {
        const settings = await this.deps.settingsService.load();
        this.store.setState({
            settings,
            currentTab: this.resolveCurrentTab(this.store.getState().currentTab, settings),
        });

        await this.loadCurrentPage();
        watchLocationChange(this.deps.window, () => {
            const nextRouteKey = createRouteKey(this.deps.window.location.href);
            if (nextRouteKey === this.routeKey) {
                return;
            }

            void this.loadCurrentPage();
        });
    }

    private async loadCurrentPage(): Promise<void> {
        const routeKey = createRouteKey(this.deps.window.location.href);
        const url = new URL(this.deps.window.location.href);
        const adapter = this.deps.platformRegistry.resolve(url);
        const loadId = ++this.loadSequence;

        this.routeKey = routeKey;
        this.disposeSession();

        this.store.setState({
            status: "loading",
            errorMessage: null,
            transcript: null,
            summary: defaultSummaryState,
            placement: "sidebar",
            settingsOpen: false,
            capabilities: defaultCapabilities(),
        });

        if (!adapter) {
            this.unmountHost();
            this.store.setState({
                status: "error",
                errorMessage: "当前页面还没有适配这个平台。",
            });
            return;
        }

        const session = adapter.createSession({
            url,
            document: this.deps.document,
            window: this.deps.window,
        });

        this.currentSession = session;

        try {
            await session.waitForReady();

            if (loadId !== this.loadSequence) {
                session.dispose();
                return;
            }

            const host = this.ensureHost();
            session.mountPanelHost(host, "sidebar");
            this.render();

            const transcript = await session.fetchTranscript();
            if (loadId !== this.loadSequence) {
                session.dispose();
                return;
            }

            this.store.setState({
                status: "ready",
                transcript,
                capabilities: session.capabilities,
            });
        } catch (error) {
            this.deps.logger.error("Failed to load current page", error);

            if (loadId !== this.loadSequence) {
                return;
            }

            const host = this.ensureHost();
            session.mountPanelHost(host, "sidebar");
            this.render();

            this.store.setState({
                status: "error",
                errorMessage: getErrorMessage(error),
                capabilities: session.capabilities,
            });
        }
    }

    private ensureHost(): HTMLElement {
        if (this.host) {
            return this.host;
        }

        const host = this.deps.document.createElement("section");
        host.id = ROOT_ID;

        const shadow = host.attachShadow({ mode: "open" });
        const styleTag = this.deps.document.createElement("style");
        styleTag.setAttribute("data-rc", "1");
        styleTag.textContent = String(panelStyles);
        shadow.appendChild(styleTag);

        this.host = host;
        return host;
    }

    private render(): void {
        if (!this.host?.shadowRoot) {
            return;
        }

        const state = this.store.getState();
        render(panelTemplate(
            {
                collapsed: state.collapsed,
                status: state.status,
                errorMessage: state.errorMessage,
                currentTab: state.currentTab,
                availableTabs: [],
                transcript: state.transcript,
                summary: state.summary,
                settings: state.settings,
                settingsOpen: state.settingsOpen,
                placement: state.placement,
                capabilities: state.capabilities,
            },
            {
                onToggleCollapse: () => {
                    this.store.setState({ collapsed: !this.store.getState().collapsed });
                },
                onSelectTab: (tab) => {
                    this.store.setState({ currentTab: tab });
                },
                onToggleSettings: () => {
                    this.store.setState({ settingsOpen: !this.store.getState().settingsOpen });
                },
                onCloseSettings: () => {
                    this.store.setState({ settingsOpen: false });
                },
                onSaveSettings: (event) => {
                    void this.saveSettings(event);
                },
                onCopyTranscript: () => {
                    void this.copyTranscript();
                },
                onDownloadTranscript: () => {
                    this.downloadTranscript();
                },
                onGenerateSummary: () => {
                    void this.generateSummary();
                },
                onJumpTo: (seconds) => {
                    this.jumpTo(seconds);
                },
                onToggleReaderMode: () => {
                    void this.toggleReaderMode();
                },
            },
        ), this.host.shadowRoot);
    }

    private async saveSettings(event: Event): Promise<void> {
        event.preventDefault();

        const form = event.currentTarget;
        if (!(form instanceof HTMLFormElement)) {
            return;
        }

        const next = normalizeSettings(parseSettingsForm(form, this.store.getState().settings));
        const saved = await this.deps.settingsService.save(next);
        const currentTab = this.resolveCurrentTab(this.store.getState().currentTab, saved);

        this.store.setState({
            settings: saved,
            currentTab,
            settingsOpen: false,
            summary: defaultSummaryState,
        });
    }

    private async copyTranscript(): Promise<void> {
        const transcript = this.store.getState().transcript;
        if (!transcript || transcript.lines.length === 0) {
            return;
        }

        try {
            await this.deps.exporter.copyTranscript(transcript);
        } catch (error) {
            this.deps.logger.warn("Failed to copy transcript", error);
        }
    }

    private downloadTranscript(): void {
        const transcript = this.store.getState().transcript;
        if (!transcript || transcript.lines.length === 0) {
            return;
        }

        this.deps.exporter.downloadTranscript(transcript, this.deps.document.title || "readable-captions");
    }

    private async generateSummary(): Promise<void> {
        const state = this.store.getState();
        if (!state.transcript || state.transcript.lines.length === 0) {
            return;
        }

        this.store.setState({
            summary: {
                status: "loading",
                data: null,
                error: null,
            },
        });

        try {
            const result = await this.deps.summarizer.summarize({
                transcript: state.transcript,
                settings: state.settings,
                videoTitle: this.deps.document.title,
            });

            this.store.setState({
                summary: {
                    status: "ready",
                    data: result,
                    error: null,
                },
            });
        } catch (error) {
            this.store.setState({
                summary: {
                    status: "error",
                    data: null,
                    error: getErrorMessage(error),
                },
            });
        }
    }

    private jumpTo(seconds: number): void {
        const video = this.currentSession?.getVideoElement();
        if (!video) {
            return;
        }

        video.currentTime = seconds;
        void video.play().catch(() => undefined);
    }

    private async toggleReaderMode(): Promise<void> {
        const host = this.host;
        const session = this.currentSession;

        if (!host || !session || !session.capabilities.readerMode) {
            return;
        }

        const placement = this.store.getState().placement === "sidebar" ? "reader" : "sidebar";
        session.mountPanelHost(host, placement);
        this.store.setState({ placement });

        if (placement === "reader" && session.capabilities.pictureInPicture) {
            await session.requestPictureInPicture();
            return;
        }

        if (placement === "sidebar") {
            await session.exitPictureInPicture();
        }
    }

    private resolveCurrentTab(currentTab: TabId, settings: AppSettings): TabId {
        if (settings.visibleTabs.includes(currentTab)) {
            return currentTab;
        }

        if (settings.visibleTabs.includes(settings.defaultTab)) {
            return settings.defaultTab;
        }

        return settings.visibleTabs[0] ?? "read";
    }

    private unmountHost(): void {
        if (this.host?.isConnected) {
            this.host.remove();
        }

        this.host = null;
    }

    private disposeSession(): void {
        if (this.currentSession) {
            this.currentSession.dispose();
            this.currentSession = null;
        }
    }
}
