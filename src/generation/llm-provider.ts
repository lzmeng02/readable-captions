import type { GenerationRequest } from "./types";
import { GenerationUserError } from "./errors";
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

function toRuntimeError(value: unknown): GenerationUserError {
    const message = value instanceof Error ? value.message : String(value);
    if (message.includes("Extension context invalidated")) {
        return new GenerationUserError("runtime-invalidated");
    }

    return new GenerationUserError("runtime-unavailable");
}

function connectGenerationPort(): RuntimePort | GenerationUserError | null {
    try {
        return getExtensionChrome()?.runtime?.connect?.({ name: GENERATION_STREAM_PORT }) ?? null;
    } catch (errorValue) {
        return toRuntimeError(errorValue);
    }
}

export function streamGeneration(options: StreamingGenerationOptions): AbortController {
    const controller = new AbortController();
    const portOrError = connectGenerationPort();

    if (!portOrError) {
        queueMicrotask(() => {
            options.onError(new GenerationUserError("runtime-unavailable"));
        });
        return controller;
    }

    if (portOrError instanceof GenerationUserError) {
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
            options.onError(new GenerationUserError(message.code));
        }
        disconnectPort();
    });

    port.onDisconnect.addListener(() => {
        if (!finished && !controller.signal.aborted) {
            finished = true;
            options.onError(new GenerationUserError("service-disconnected"));
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
        options.onError(toRuntimeError(errorValue));
    }

    return controller;
}
