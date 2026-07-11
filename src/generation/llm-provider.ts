import type { GenerationRequest } from "./types";
import {
    GENERATION_STREAM_PORT,
    isGenerationBackgroundMessage,
    type GenerationStreamClientMessage,
} from "./protocol";

export type StreamingGenerationOptions = {
    request: GenerationRequest;
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
    const message = value instanceof Error ? value.message : String(value);
    if (message.includes("Extension context invalidated")) {
        return new Error("Extension context was invalidated. Reload this page and try again.");
    }

    return value instanceof Error ? value : new Error(message);
}

function connectGenerationPort(): RuntimePort | Error | null {
    try {
        return getExtensionChrome()?.runtime?.connect?.({ name: GENERATION_STREAM_PORT }) ?? null;
    } catch (errorValue) {
        return toError(errorValue);
    }
}

export function streamGeneration(options: StreamingGenerationOptions): AbortController {
    const controller = new AbortController();
    const portOrError = connectGenerationPort();

    if (!portOrError) {
        queueMicrotask(() => {
            options.onError(new Error("Extension runtime is unavailable. Reload the extension and try again."));
        });
        return controller;
    }

    if (portOrError instanceof Error) {
        queueMicrotask(() => {
            options.onError(portOrError);
        });
        return controller;
    }

    const port = portOrError;
    let finished = false;
    let accumulatedText = "";

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

            finished = true;
            const cancelMessage: GenerationStreamClientMessage = { type: "cancel" };
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
        if (!isGenerationBackgroundMessage(message) || finished) {
            return;
        }

        if (message.type === "token") {
            accumulatedText += message.text;
            options.onToken(accumulatedText);
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
            options.onError(new Error("Generation service disconnected before completion."));
        }
    });

    const startMessage: GenerationStreamClientMessage = {
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
