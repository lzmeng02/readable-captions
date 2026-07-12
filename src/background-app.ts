import { attachGenerationStreamPort, type KeepAliveRunner, type RuntimePort } from "./generation/background-stream";
import { GENERATION_STREAM_PORT } from "./generation/protocol";
import type { streamGenerationFromApi } from "./generation/llm-api";
import {
    PUBLIC_SETTINGS_PORT,
    toPublicSettings,
    type PublicSettingsPortMessage,
} from "./settings/public";
import type {
    getSettings,
    restrictStorageAccessToTrustedContexts,
    watchSettings,
} from "./settings/storage";

type RuntimeOnConnect = {
    addListener(listener: (port: RuntimePort) => void): void;
};

export type ExtensionChrome = {
    runtime?: {
        onConnect?: RuntimeOnConnect;
        getPlatformInfo?: () => unknown | Promise<unknown>;
    };
};

export type BackgroundDependencies = {
    chrome: ExtensionChrome | null;
    getSettings: typeof getSettings;
    restrictStorageAccessToTrustedContexts: typeof restrictStorageAccessToTrustedContexts;
    watchSettings: typeof watchSettings;
    streamGenerationFromApi: typeof streamGenerationFromApi;
    keepAlive: KeepAliveRunner;
};

function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value));
}

function postPublicSettingsToPort(port: RuntimePort, message: PublicSettingsPortMessage): void {
    try {
        port.postMessage(message);
    } catch {
        // The content script may have navigated away while the stream was active.
    }
}

export function registerBackground(deps: BackgroundDependencies): void {
    void deps.restrictStorageAccessToTrustedContexts().catch((error) => {
        console.warn("Failed to restrict extension storage access", error);
    });

    const publicSettingsPortRevisions = new Map<RuntimePort, number>();
    let publicSettingsRevision = 0;

    const postCurrentPublicSettings = async (port: RuntimePort, revision: number): Promise<void> => {
        try {
            const settings = await deps.getSettings();
            if (publicSettingsPortRevisions.get(port) !== revision) return;
            postPublicSettingsToPort(port, {
                type: "settings",
                settings: toPublicSettings(settings),
            });
        } catch (errorValue) {
            if (publicSettingsPortRevisions.get(port) !== revision) return;
            postPublicSettingsToPort(port, {
                type: "error",
                message: toError(errorValue).message,
            });
        }
    };

    deps.watchSettings((settings) => {
        const revision = ++publicSettingsRevision;
        const publicSettings = toPublicSettings(settings);
        for (const port of publicSettingsPortRevisions.keys()) {
            publicSettingsPortRevisions.set(port, revision);
            postPublicSettingsToPort(port, {
                type: "settings",
                settings: publicSettings,
            });
        }
    });

    deps.chrome?.runtime?.onConnect?.addListener((port) => {
        if (port.name === PUBLIC_SETTINGS_PORT) {
            const revision = publicSettingsRevision;
            publicSettingsPortRevisions.set(port, revision);
            void postCurrentPublicSettings(port, revision);

            port.onDisconnect.addListener(() => {
                publicSettingsPortRevisions.delete(port);
            });
            return;
        }

        if (port.name !== GENERATION_STREAM_PORT) {
            return;
        }

        attachGenerationStreamPort(port, {
            getSettings: deps.getSettings,
            streamGenerationFromApi: deps.streamGenerationFromApi,
            keepAlive: deps.keepAlive,
        });
    });
}
