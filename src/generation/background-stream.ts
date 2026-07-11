import type { getSettings } from "../settings/storage";
import {
    isGenerationCancelMessage,
    isGenerationStartMessage,
    type GenerationStreamBackgroundMessage,
} from "./protocol";
import type { streamGenerationFromApi } from "./llm-api";
import type { GenerationRequest } from "./types";

export type RuntimePort = {
    name: string;
    postMessage(message: unknown): void;
    onMessage: {
        addListener(listener: (message: unknown) => void): void;
    };
    onDisconnect: {
        addListener(listener: () => void): void;
    };
};

export type KeepAliveRunner = <T>(
    work: () => Promise<T>,
    signal: AbortSignal,
) => Promise<T>;

export type GenerationPortDependencies = {
    getSettings: typeof getSettings;
    streamGenerationFromApi: typeof streamGenerationFromApi;
    keepAlive: KeepAliveRunner;
};

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
    deps: GenerationPortDependencies,
): Promise<void> {
    try {
        const fullText = await deps.keepAlive(async () => {
            const settings = await deps.getSettings();
            return deps.streamGenerationFromApi({
                settings,
                request,
                signal: controller.signal,
                onToken: (deltaText) => {
                    if (!controller.signal.aborted) {
                        postToPort(port, { type: "token", text: deltaText });
                    }
                },
            });
        }, controller.signal);

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

export function attachGenerationStreamPort(
    port: RuntimePort,
    deps: GenerationPortDependencies,
): void {
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

        void runGenerationStream(port, message.request, controller, deps).finally(() => {
            if (activeController === controller) {
                activeController = null;
            }
        });
    });

    port.onDisconnect.addListener(() => {
        activeController?.abort();
        activeController = null;
    });
}
