import type { SummaryRequest } from "./types";
import {
    SUMMARY_STREAM_PORT,
    isSummaryBackgroundMessage,
    type SummaryStreamClientMessage,
} from "./protocol";

export type StreamingSummarizeOptions = {
    request: SummaryRequest;
    onToken: (partialText: string) => void;
    onDone: (fullText: string) => void;
    onError: (error: Error) => void;
};

type RuntimePort = {
    postMessage(message: unknown): void;
    disconnect(): void;
    onMessage: {
        addListener(listener: (message: unknown) => void): void;
    };
    onDisconnect: {
        addListener(listener: () => void): void;
    };
};

type ExtensionChrome = {
    runtime?: {
        connect?(connectInfo: { name: string }): RuntimePort;
    };
};

function getExtensionChrome(): ExtensionChrome | null {
    return (globalThis as typeof globalThis & { chrome?: ExtensionChrome }).chrome ?? null;
}

function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value));
}

/**
 * Content-side summary client.
 * The network request runs in the MV3 background service worker so provider
 * host permissions and streaming lifetime are handled by extension context.
 */
export function summarizeStreaming(options: StreamingSummarizeOptions): AbortController {
    const controller = new AbortController();
    const port = getExtensionChrome()?.runtime?.connect?.({ name: SUMMARY_STREAM_PORT });

    if (!port) {
        queueMicrotask(() => {
            options.onError(new Error("Extension runtime is unavailable. Reload the extension and try again."));
        });
        return controller;
    }

    let finished = false;

    const disconnectPort = (): void => {
        try {
            port.disconnect();
        } catch {
            // The port may already be closed.
        }
    };

    controller.signal.addEventListener(
        "abort",
        () => {
            if (finished) {
                return;
            }

            const cancelMessage: SummaryStreamClientMessage = { type: "cancel" };
            try {
                port.postMessage(cancelMessage);
            } catch {
                // The background worker may have already closed the port.
            }
            disconnectPort();
        },
        { once: true },
    );

    port.onMessage.addListener((message) => {
        if (!isSummaryBackgroundMessage(message) || finished) {
            return;
        }

        if (message.type === "token") {
            options.onToken(message.text);
            return;
        }

        finished = true;
        if (message.type === "done") {
            options.onDone(message.text);
        } else {
            options.onError(new Error(message.message));
        }
        disconnectPort();
    });

    port.onDisconnect.addListener(() => {
        if (!finished && !controller.signal.aborted) {
            finished = true;
            options.onError(new Error("Summary service disconnected before completion."));
        }
    });

    const startMessage: SummaryStreamClientMessage = {
        type: "start",
        request: options.request,
    };

    try {
        port.postMessage(startMessage);
    } catch (errorValue) {
        finished = true;
        options.onError(toError(errorValue));
    }

    return controller;
}
