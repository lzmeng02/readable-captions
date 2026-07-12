import {
    isPublicSettingsPortMessage,
    PUBLIC_SETTINGS_PORT,
} from "./public";
import type { PublicExtensionSettings } from "./types";

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

function toError(errorValue: unknown): Error {
    if (errorValue instanceof Error) {
        return errorValue;
    }

    return new Error(typeof errorValue === "string"
        ? errorValue
        : "Failed to connect public settings port.");
}

export function watchPublicSettings(
    onSettings: (settings: PublicExtensionSettings) => void,
    onError: (error: Error) => void,
): () => void {
    let port: RuntimePort | null = null;
    let stopped = false;
    let connectionClosed = false;
    let hasReceivedSettings = false;
    let errorReported = false;
    let connectionError: Error | null = null;

    const reportError = (error: Error): void => {
        if (stopped || errorReported) {
            return;
        }

        errorReported = true;
        onError(error);
    };

    try {
        port = getExtensionChrome()?.runtime?.connect?.({ name: PUBLIC_SETTINGS_PORT }) ?? null;
    } catch (err) {
        connectionError = toError(err);
    }

    if (!port) {
        queueMicrotask(() => {
            reportError(connectionError ?? new Error("Public settings port is unavailable."));
        });
        return () => {
            stopped = true;
        };
    }

    port.onMessage.addListener((message) => {
        if (!isPublicSettingsPortMessage(message) || stopped || connectionClosed) {
            return;
        }

        if (message.type === "settings") {
            hasReceivedSettings = true;
            onSettings(message.settings);
        } else {
            reportError(new Error(message.message));
        }
    });

    port.onDisconnect.addListener(() => {
        if (stopped || connectionClosed) {
            return;
        }

        connectionClosed = true;
        port = null;
        if (!hasReceivedSettings) {
            reportError(new Error("Public settings port disconnected before settings were received."));
        }
    });

    return () => {
        if (stopped) {
            return;
        }

        stopped = true;
        connectionClosed = true;
        const activePort = port;
        port = null;
        try {
            activePort?.disconnect();
        } catch {
            // The port may already be closed.
        }
    };
}
