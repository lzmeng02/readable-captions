import { afterEach, describe, expect, it, vi } from "vitest";
import { streamGenerationFromApi } from "../../../src/generation/llm-api";
import {
    createSettings,
    createSseResponse,
    generationRequest,
    successfulSse,
} from "../../helpers/generation";

afterEach(() => vi.unstubAllGlobals());

describe("provider request selection", () => {
    it("uses only the selected OpenAI profile", async () => {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
            return createSseResponse(successfulSse);
        });
        vi.stubGlobal("fetch", fetchMock);
        const settings = {
            ...createSettings({ generationProvider: "openai" }),
            generationApiKey: "wrong-deepseek-trap",
            generationModels: { overview: "wrong-deepseek-model", intensive: "wrong-deepseek-model" },
            generationProviderSettings: {
                openai: { apiKey: "oa-test-key", models: { overview: "gpt-test", intensive: "gpt-test" } },
                deepseek: {
                    apiKey: "ds-test-key",
                    models: { overview: "deepseek-test", intensive: "deepseek-test" },
                },
            },
        } as any;

        await streamGenerationFromApi({
            settings,
            request: generationRequest,
            signal: new AbortController().signal,
            onToken: vi.fn(),
        });

        const [url, init] = fetchMock.mock.calls[0]!;
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect({
            url,
            authorization: new Headers(init?.headers).get("Authorization"),
            model: body.model,
        }).toEqual({
            url: "https://api.openai.com/v1/chat/completions",
            authorization: "Bearer oa-test-key",
            model: "gpt-test",
        });
    });

    it("uses the selected DeepSeek profile and its request-time default", async () => {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
            return createSseResponse(successfulSse);
        });
        vi.stubGlobal("fetch", fetchMock);
        const settings = {
            ...createSettings({ generationProvider: "deepseek" }),
            generationApiKey: "wrong-openai-trap",
            generationModels: { overview: "wrong-openai-model", intensive: "wrong-openai-model" },
            generationProviderSettings: {
                openai: { apiKey: "oa-test-key", models: { overview: "gpt-test", intensive: "gpt-test" } },
                deepseek: { apiKey: "ds-test-key", models: { overview: "", intensive: "" } },
            },
        } as any;

        await streamGenerationFromApi({
            settings,
            request: generationRequest,
            signal: new AbortController().signal,
            onToken: vi.fn(),
        });

        const [url, init] = fetchMock.mock.calls[0]!;
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect({
            url,
            authorization: new Headers(init?.headers).get("Authorization"),
            model: body.model,
            thinking: body.thinking,
            reasoningEffort: body.reasoning_effort,
            hasExtraBody: Object.prototype.hasOwnProperty.call(body, "extra_body"),
        }).toEqual({
            url: "https://api.deepseek.com/chat/completions",
            authorization: "Bearer ds-test-key",
            model: "deepseek-v4-flash",
            thinking: { type: "enabled" },
            reasoningEffort: "high",
            hasExtraBody: false,
        });
    });

    it("rejects a missing selected-provider key before fetch", async () => {
        const fetchMock = vi.fn(async () => createSseResponse(successfulSse));
        vi.stubGlobal("fetch", fetchMock);
        const settings = {
            ...createSettings({ generationProvider: "openai" }),
            generationApiKey: "wrong-global-trap",
            generationModels: { overview: "wrong-global-model", intensive: "wrong-global-model" },
            generationProviderSettings: {
                openai: { apiKey: "", models: { overview: "gpt-test", intensive: "gpt-test" } },
                deepseek: { apiKey: "ds-test-key", models: { overview: "", intensive: "" } },
            },
        } as any;

        const outcome = await streamGenerationFromApi({
            settings,
            request: generationRequest,
            signal: new AbortController().signal,
            onToken: vi.fn(),
        }).then(
            () => ({ message: null }),
            (error: unknown) => ({ message: error instanceof Error ? error.message : String(error) }),
        );

        expect({ message: outcome.message, fetchCalls: fetchMock.mock.calls.length }).toEqual({
            message: "API Key is not set. Please configure it in the extension options.",
            fetchCalls: 0,
        });
    });
});
