import { getSettings } from "./settings/storage";
import { streamGenerationFromApi } from "./generation/llm-api";
import {
    GENERATION_STREAM_PORT,
    isGenerationCancelMessage,
    isGenerationStartMessage,
    type GenerationStreamBackgroundMessage,
} from "./generation/protocol";
import type { GenerationRequest } from "./generation/types";

type RuntimePort = {
    name: string;
    postMessage(message: unknown): void;
    onMessage: {
        addListener(listener: (message: unknown) => void): void;
    };
    onDisconnect: {
        addListener(listener: () => void): void;
    };
};

type RuntimeOnConnect = {
    addListener(listener: (port: RuntimePort) => void): void;
};

type ExtensionChrome = {
    runtime?: {
        onConnect?: RuntimeOnConnect;
    };
};

function getExtensionChrome(): ExtensionChrome | null {
    return (globalThis as typeof globalThis & { chrome?: ExtensionChrome }).chrome ?? null;
}

function postToPort(port: RuntimePort, message: GenerationStreamBackgroundMessage): void {
    try {
        port.postMessage(message);
    } catch {
        // The content script may have navigated away while the stream was active.
    }
}

function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value));
}

async function runGenerationStream(
    port: RuntimePort,
    request: GenerationRequest,
    controller: AbortController,
): Promise<void> {
    try {
        const settings = await getSettings();
        const fullText = await streamGenerationFromApi({
            settings,
            request,
            signal: controller.signal,
            onToken: (partialText) => {
                if (!controller.signal.aborted) {
                    postToPort(port, { type: "token", text: partialText });
                }
            },
        });

        if (!controller.signal.aborted) {
            postToPort(port, { type: "done", text: fullText });
        }
    } catch (errorValue) {
        if (controller.signal.aborted) {
            return;
        }

        postToPort(port, {
            type: "error",
            message: toError(errorValue).message,
        });
    }
}

getExtensionChrome()?.runtime?.onConnect?.addListener((port) => {
    if (port.name !== GENERATION_STREAM_PORT) {
        return;
    }

    let activeController: AbortController | null = null;

    port.onMessage.addListener((message) => {
        if (isGenerationCancelMessage(message)) {
            activeController?.abort();
            activeController = null;
            return;
        }

        if (!isGenerationStartMessage(message)) {
            postToPort(port, { type: "error", message: "Invalid generation request." });
            return;
        }

        activeController?.abort();
        const controller = new AbortController();
        activeController = controller;

        void runGenerationStream(port, message.request, controller).finally(() => {
            if (activeController === controller) {
                activeController = null;
            }
        });
    });

    port.onDisconnect.addListener(() => {
        activeController?.abort();
        activeController = null;
    });
});
