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

const RECONNECT_BASE_DELAY_MS = 100;
const RECONNECT_MAX_DELAY_MS = 5000;

export function watchPublicSettings(
    onSettings: (settings: PublicExtensionSettings) => void,
    onError: (error: Error) => void,
): () => void {
    let activePort: RuntimePort | null = null;
    let connectionGeneration = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelayMs = RECONNECT_BASE_DELAY_MS;
    let outageReported = false;
    let stopped = false;

    const reportOutage = (error: Error): void => {
        if (stopped || outageReported) {
            return;
        }

        outageReported = true;
        onError(error);
    };

    const scheduleReconnect = (error: Error): void => {
        if (stopped) {
            return;
        }

        reportOutage(error);
        if (stopped || reconnectTimer !== null) {
            return;
        }

        const delayMs = reconnectDelayMs;
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS);
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, delayMs);
    };

    const connect = (): void => {
        if (stopped) {
            return;
        }

        const generation = ++connectionGeneration;
        let port: RuntimePort | null = null;
        try {
            port = getExtensionChrome()?.runtime?.connect?.({ name: PUBLIC_SETTINGS_PORT }) ?? null;
        } catch (errorValue) {
            scheduleReconnect(toError(errorValue));
            return;
        }

        if (!port) {
            scheduleReconnect(new Error("Public settings port is unavailable; attempting to reconnect."));
            return;
        }

        if (stopped || generation !== connectionGeneration) {
            try {
                port.disconnect();
            } catch {
                // The port may already be closed.
            }
            return;
        }

        activePort = port;
        const isActiveConnection = (): boolean => !stopped
            && generation === connectionGeneration
            && activePort === port;

        port.onMessage.addListener((message) => {
            if (!isActiveConnection() || !isPublicSettingsPortMessage(message)) {
                return;
            }

            if (message.type === "settings") {
                outageReported = false;
                reconnectDelayMs = RECONNECT_BASE_DELAY_MS;
                onSettings(message.settings);
            } else {
                reportOutage(new Error(message.message));
            }
        });

        port.onDisconnect.addListener(() => {
            if (!isActiveConnection()) {
                return;
            }

            activePort = null;
            scheduleReconnect(new Error("Public settings port disconnected; attempting to reconnect."));
        });
    };

    connect();

    return () => {
        if (stopped) {
            return;
        }

        stopped = true;
        connectionGeneration += 1;
        if (reconnectTimer !== null) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        const port = activePort;
        activePort = null;
        try {
            port?.disconnect();
        } catch {
            // The port may already be closed.
        }
    };
}
