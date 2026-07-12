import { afterEach, describe, expect, it, vi } from "vitest";
import { createSettings, createSseResponse, generationRequest, successfulSse } from "../../helpers/generation";
import type { GenerationStreamDecoderId } from "../../../src/generation/provider-catalog";

const EXPECTED_DECODER_IDS = {
    "chat-completions-sse": true,
} satisfies Record<GenerationStreamDecoderId, true>;

const decoderState = vi.hoisted(() => ({ id: "unregistered-test-decoder" }));

vi.mock("../../../src/generation/provider-catalog", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../src/generation/provider-catalog")>();

    return {
        ...actual,
        getGenerationProvider(provider: Parameters<typeof actual.getGenerationProvider>[0]) {
            const definition = actual.getGenerationProvider(provider);
            return {
                ...definition,
                buildRequest(input: Parameters<typeof definition.buildRequest>[0]) {
                    return {
                        ...definition.buildRequest(input),
                        streamDecoder: decoderState.id,
                    };
                },
            };
        },
    };
});

import { streamGenerationFromApi } from "../../../src/generation/llm-api";

afterEach(() => vi.unstubAllGlobals());

describe("provider stream decoder dispatch", () => {
    it("keeps the decoder-id test matrix exhaustive", () => {
        expect(Object.keys(EXPECTED_DECODER_IDS)).toEqual(["chat-completions-sse"]);
    });

    it("rejects a provider request whose decoder has no registered adapter", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => createSseResponse(successfulSse)));

        await expect(streamGenerationFromApi({
            settings: createSettings(),
            request: generationRequest,
            signal: new AbortController().signal,
            onToken: vi.fn(),
        })).rejects.toThrow("The generation provider returned an invalid response. Please try again.");
    });
});
