export function createFakeRuntimePort(name = "readable-captions-generation-stream") {
    const messageListeners: Array<(message: unknown) => void> = [];
    const disconnectListeners: Array<() => void> = [];
    const postedMessages: unknown[] = [];
    let disconnected = false;

    const emitDisconnect = (): void => {
        if (disconnected) {
            return;
        }

        disconnected = true;
        for (const listener of disconnectListeners) {
            listener();
        }
    };

    const port = {
        name,
        postMessage(message: unknown): void {
            postedMessages.push(message);
        },
        disconnect: emitDisconnect,
        onMessage: {
            addListener(listener: (message: unknown) => void): void {
                messageListeners.push(listener);
            },
        },
        onDisconnect: {
            addListener(listener: () => void): void {
                disconnectListeners.push(listener);
            },
        },
    };

    return {
        port,
        postedMessages,
        emitMessage(message: unknown): void {
            for (const listener of messageListeners) {
                listener(message);
            }
        },
        emitDisconnect,
    };
}
