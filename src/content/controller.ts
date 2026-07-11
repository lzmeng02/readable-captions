import type { PanelCallbacks, PanelData, PanelHandle } from "../panel/types";
import type { PlatformTranscriptResult } from "../platforms/types";

export type ContentController = {
    navigate(url: string): Promise<void>;
    recoverHost(): void;
    dispose(): void;
};

export type ContentControllerDeps = {
    routeKeyForUrl(url: string): string | null;
    waitForAnchor(signal: AbortSignal): Promise<Element>;
    getAnchor(): Element | null;
    ensureHost(anchor: Element): HTMLElement;
    loadTranscript(url: string, signal: AbortSignal): Promise<PlatformTranscriptResult>;
    mountPanel(host: HTMLElement, data: PanelData, callbacks: PanelCallbacks): PanelHandle;
    observeDom(listener: () => void): () => void;
};

type ContentSession = {
    routeKey: string;
    abort: AbortController;
    host: HTMLElement | null;
    panel: PanelHandle | null;
    data: PanelData;
    stopObserving: (() => void) | null;
};

function loadingData(): PanelData {
    return { transcript: null, source: "none", status: "loading" };
}

function errorData(error: unknown): PanelData {
    const errorMessage = error instanceof Error && error.message
        ? error.message
        : typeof error === "string" && error
            ? error
            : "Failed to load transcript.";
    return { transcript: null, source: "none", status: "error", errorMessage };
}

export function createContentController(deps: ContentControllerDeps): ContentController {
    let session: ContentSession | null = null;

    const isActive = (candidate: ContentSession): boolean => (
        session === candidate && !candidate.abort.signal.aborted
    );

    const dispose = (): void => {
        const current = session;
        if (!current) return;

        session = null;
        current.abort.abort();
        current.stopObserving?.();
        current.stopObserving = null;
        current.panel?.dispose();
        current.panel = null;
        current.host?.remove();
        current.host = null;
    };

    const recoverHost = (): void => {
        const current = session;
        if (!current?.host || !current.panel) return;

        const anchor = deps.getAnchor();
        if (!anchor || anchor.contains(current.host)) return;

        anchor.prepend(current.host);
        current.panel.updateData(current.data);
    };

    const navigate = async (url: string): Promise<void> => {
        const routeKey = deps.routeKeyForUrl(url);
        if (routeKey === null) {
            dispose();
            return;
        }
        if (session?.routeKey === routeKey) return;

        dispose();
        const next: ContentSession = {
            routeKey,
            abort: new AbortController(),
            host: null,
            panel: null,
            data: loadingData(),
            stopObserving: null,
        };
        session = next;

        let anchor: Element;
        try {
            anchor = await deps.waitForAnchor(next.abort.signal);
        } catch (error) {
            if (isActive(next)) next.data = errorData(error);
            return;
        }
        if (!isActive(next)) return;

        next.host = deps.ensureHost(anchor);
        next.panel = deps.mountPanel(next.host, next.data, {
            onTranscriptChange(result) {
                if (isActive(next)) next.data = { ...result, status: "ready" };
            },
        });
        next.stopObserving = deps.observeDom(recoverHost);

        try {
            const result = await deps.loadTranscript(url, next.abort.signal);
            if (!isActive(next)) return;
            next.data = { ...result, status: "ready" };
        } catch (error) {
            if (!isActive(next)) return;
            next.data = errorData(error);
        }

        next.panel.updateData(next.data);
    };

    return { navigate, recoverHost, dispose };
}
