import { afterEach, describe, expect, it, vi } from "vitest";
import { streamGenerationFromApi } from "../../../src/generation/llm-api";
import { createSettings, createSseResponse, generationRequest } from "../../helpers/generation";

afterEach(() => vi.unstubAllGlobals());

async function runSuccessfulStream(
    deltas: readonly string[],
    onToken: (text: string) => void,
): Promise<string> {
    const events = deltas.map((content) =>
        `data: ${JSON.stringify({
            choices: [{ delta: { content }, finish_reason: null }],
        })}\n\n`);
    events.push(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
    );
    vi.stubGlobal("fetch", vi.fn(async () => createSseResponse(events)));

    return streamGenerationFromApi({
        settings: createSettings({
            generationProvider: "openai",
            generationProviderSettings: {
                openai: { models: { overview: "gpt-4o-mini", intensive: "" } },
            },
        }),
        request: generationRequest,
        signal: new AbortController().signal,
        onToken,
    });
}

describe("chat completion callback payloads", () => {
    it("emits raw API deltas instead of snapshots", async () => {
        const onToken = vi.fn();

        await expect(runSuccessfulStream(["a", "b"], onToken)).resolves.toBe("ab");

        expect(onToken.mock.calls.map(([text]) => text)).toEqual(["a", "b"]);
    });

    it("keeps callback payload linear", async () => {
        const onToken = vi.fn();

        await expect(runSuccessfulStream(Array.from({ length: 1000 }, () => "x"), onToken))
            .resolves.toBe("x".repeat(1000));

        expect(onToken.mock.calls.reduce(
            (sum, [text]) => sum + String(text).length,
            0,
        )).toBe(1000);
    });
});
