import {
    DEFAULT_PUBLIC_SETTINGS,
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

export function watchPublicSettings(listener: (settings: PublicExtensionSettings) => void): () => void {
    let port: RuntimePort | null = null;
    let disconnected = false;

    try {
        port = getExtensionChrome()?.runtime?.connect?.({ name: PUBLIC_SETTINGS_PORT }) ?? null;
    } catch (err) {
        console.warn("Failed to connect public settings port", err);
    }

    if (!port) {
        queueMicrotask(() => {
            if (!disconnected) {
                listener(DEFAULT_PUBLIC_SETTINGS);
            }
        });
        return () => {
            disconnected = true;
        };
    }

    port.onMessage.addListener((message) => {
        if (!isPublicSettingsPortMessage(message) || disconnected) {
            return;
        }

        if (message.type === "settings") {
            listener(message.settings);
        } else {
            console.error("Readable Captions settings error", message.message);
        }
    });

    port.onDisconnect.addListener(() => {
        disconnected = true;
        port = null;
    });

    return () => {
        disconnected = true;
        try {
            port?.disconnect();
        } catch {
            // The port may already be closed.
        }
        port = null;
    };
}
