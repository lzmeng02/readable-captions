export type ChatStreamState = {
    pending: string;
    text: string;
    finishReason: string | null;
    sawDone: boolean;
    errorMessage: string | null;
};

export type ChatStreamDelta = {
    delta: string;
    snapshot: string;
};

export function createChatStreamState(): ChatStreamState {
    return {
        pending: "",
        text: "",
        finishReason: null,
        sawDone: false,
        errorMessage: null,
    };
}

function getApiErrorMessage(value: unknown): string | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const error = (value as Record<string, unknown>).error;
    if (typeof error !== "object" || error === null) {
        return null;
    }

    const message = (error as Record<string, unknown>).message;
    return typeof message === "string" && message.length > 0 ? message : null;
}

function getFirstChoice(value: unknown): Record<string, unknown> | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }

    const choices = (value as Record<string, unknown>).choices;
    if (!Array.isArray(choices)) {
        return null;
    }

    const firstChoice = choices[0];
    return typeof firstChoice === "object" && firstChoice !== null
        ? firstChoice as Record<string, unknown>
        : null;
}

function getContentDelta(choice: Record<string, unknown>): string | null {
    const delta = choice.delta;
    if (typeof delta !== "object" || delta === null) {
        return null;
    }

    const content = (delta as Record<string, unknown>).content;
    return typeof content === "string" && content.length > 0 ? content : null;
}

function getEventData(eventText: string): string | null {
    const dataLines: string[] = [];

    for (const line of eventText.split(/\r?\n/)) {
        if (!line.startsWith("data:")) {
            continue;
        }

        const value = line.slice(5);
        dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
    }

    return dataLines.length > 0 ? dataLines.join("\n") : null;
}

export function consumeChatSse(state: ChatStreamState, input: string): ChatStreamDelta[] {
    const updates: ChatStreamDelta[] = [];
    state.pending += input;

    while (true) {
        const boundary = /\r?\n\r?\n/.exec(state.pending);
        if (!boundary || boundary.index === undefined) {
            break;
        }

        const eventText = state.pending.slice(0, boundary.index);
        state.pending = state.pending.slice(boundary.index + boundary[0].length);
        const data = getEventData(eventText);
        if (data === null) {
            continue;
        }

        if (data === "[DONE]") {
            state.sawDone = true;
            continue;
        }

        let payload: unknown;
        try {
            payload = JSON.parse(data);
        } catch {
            throw new Error("Malformed SSE JSON from generation provider.");
        }

        const apiError = getApiErrorMessage(payload);
        if (apiError) {
            state.errorMessage = apiError;
            throw new Error(apiError);
        }

        const choice = getFirstChoice(payload);
        if (!choice) {
            continue;
        }

        const finishReason = choice.finish_reason;
        if (typeof finishReason === "string") {
            state.finishReason = finishReason;
        }

        const delta = getContentDelta(choice);
        if (delta === null) {
            continue;
        }

        state.text += delta;
        updates.push({ delta, snapshot: state.text });
    }

    return updates;
}

export function finalizeChatSse(state: ChatStreamState): string {
    if (state.errorMessage) {
        throw new Error(state.errorMessage);
    }
    if (!state.sawDone) {
        throw new Error("Generation stream ended before [DONE].");
    }
    if (state.finishReason !== "stop") {
        throw new Error(`Generation stopped with finish_reason: ${state.finishReason ?? "missing"}.`);
    }
    if (!state.text.trim()) {
        throw new Error("Generation completed with empty output.");
    }
    return state.text;
}
