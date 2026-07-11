import { afterEach, describe, expect, it, vi } from "vitest";
import { streamGenerationFromApi } from "../../../src/generation/llm-api";
import { createSettings, generationRequest, createSseResponse, successfulSse } from "../../helpers/generation";

afterEach(() => vi.unstubAllGlobals());

async function captureBody(provider: "openai" | "deepseek"): Promise<Record<string, unknown>> {
    let body: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return createSseResponse(successfulSse);
    }));
    await streamGenerationFromApi({
        settings: createSettings({
            generationProvider: provider,
            generationModels: { overview: provider === "openai" ? "gpt-4o-mini" : "" },
        }),
        request: generationRequest,
        signal: new AbortController().signal,
        onToken: vi.fn(),
    });
    if (!body) throw new Error("fetch body was not captured");
    return body;
}

describe("chat completion request bodies", () => {
    it("sends only common fields to OpenAI", async () => {
        const body = await captureBody("openai");
        expect(Object.keys(body).sort()).toEqual(["messages", "model", "stream"]);
    });

    it("sends top-level thinking and high effort to DeepSeek", async () => {
        const body = await captureBody("deepseek");
        expect(body.thinking).toEqual({ type: "enabled" });
        expect(body.reasoning_effort).toBe("high");
        expect(body).not.toHaveProperty("extra_body");
    });
});
