import { afterEach, describe, expect, it, vi } from "vitest";
import { streamGenerationFromApi } from "../../../src/generation/llm-api";
import { createSettings, createSseResponse, generationRequest } from "../../helpers/generation";

afterEach(() => vi.unstubAllGlobals());

async function run(chunks: readonly string[]): Promise<string> {
    vi.stubGlobal("fetch", vi.fn(async () => createSseResponse(chunks)));
    return streamGenerationFromApi({
        settings: createSettings({
            generationProvider: "openai",
            generationModels: { overview: "gpt-4o-mini" },
        }),
        request: generationRequest,
        signal: new AbortController().signal,
        onToken: vi.fn(),
    });
}

describe("chat completion streams", () => {
    it("rejects EOF before DONE", async () => {
        await expect(run([
            'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
        ])).rejects.toThrow("before [DONE]");
    });

    it.each(["length", "content_filter", "insufficient_system_resource"])(
        "rejects finish reason %s",
        async (reason) => {
            await expect(run([
                'data: {"choices":[{"delta":{"content":"cut"},"finish_reason":null}]}\n\n',
                `data: {"choices":[{"delta":{},"finish_reason":"${reason}"}]}\n\n`,
                "data: [DONE]\n\n",
            ])).rejects.toThrow(reason);
        },
    );

    it("rejects empty stop plus DONE", async () => {
        await expect(run([
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
            "data: [DONE]\n\n",
        ])).rejects.toThrow("empty");
    });

    it("surfaces streamed provider errors", async () => {
        await expect(run([
            'data: {"error":{"message":"quota exceeded"}}\n\n',
        ])).rejects.toThrow("quota exceeded");
    });

    it("rejects malformed JSON instead of discarding it", async () => {
        await expect(run(["data: {not-json}\n\n"])).rejects.toThrow("Malformed SSE JSON");
    });

    it("joins multiple data lines in one event", async () => {
        await expect(run([
            'data: {"choices":\n',
            'data: [{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
            "data: [DONE]\n\n",
        ])).resolves.toBe("ok");
    });

    it("accepts CRLF event boundaries", async () => {
        await expect(run([
            'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\r\n\r\n',
            "data: [DONE]\r\n\r\n",
        ])).resolves.toBe("ok");
    });

    it("accepts reasoning progress before final content", async () => {
        await expect(run([
            'data: {"choices":[{"delta":{"reasoning_content":"thinking"},"finish_reason":null}]}\n\n',
            'data: {"choices":[{"delta":{"content":"answer"},"finish_reason":"stop"}]}\n\n',
            "data: [DONE]\n\n",
        ])).resolves.toBe("answer");
    });

    it("rejects reasoning-only output", async () => {
        await expect(run([
            'data: {"choices":[{"delta":{"reasoning_content":"thinking"},"finish_reason":"stop"}]}\n\n',
            "data: [DONE]\n\n",
        ])).rejects.toThrow("empty");
    });

    it("emits the delta from a content-bearing stop event", async () => {
        const onToken = vi.fn();
        vi.stubGlobal("fetch", vi.fn(async () => createSseResponse([
            'data: {"choices":[{"delta":{"content":"a"},"finish_reason":null}]}\n\n',
            'data: {"choices":[{"delta":{"content":"b"},"finish_reason":"stop"}]}\n\n',
            "data: [DONE]\n\n",
        ])));

        await expect(streamGenerationFromApi({
            settings: createSettings({
                generationProvider: "openai",
                generationModels: { overview: "gpt-4o-mini" },
            }),
            request: generationRequest,
            signal: new AbortController().signal,
            onToken,
        })).resolves.toBe("ab");
        expect(onToken.mock.calls).toEqual([["a"], ["b"]]);
    });

    it("decodes a multibyte content delta split across byte chunks", async () => {
        const encoder = new TextEncoder();
        const bytes = encoder.encode([
            'data: {"choices":[{"delta":{"content":"回答"},"finish_reason":"stop"}]}',
            "",
            "data: [DONE]",
            "",
            "",
        ].join("\n"));
        const marker = encoder.encode("回");
        const markerStart = bytes.findIndex((_value, index) =>
            marker.every((value, offset) => bytes[index + offset] === value));
        if (markerStart < 0) throw new Error("UTF-8 marker was not found");
        const splitAt = markerStart + 1;
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(bytes.slice(0, splitAt));
                controller.enqueue(bytes.slice(splitAt));
                controller.close();
            },
        });
        vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
        })));

        await expect(streamGenerationFromApi({
            settings: createSettings({
                generationProvider: "openai",
                generationModels: { overview: "gpt-4o-mini" },
            }),
            request: generationRequest,
            signal: new AbortController().signal,
            onToken: vi.fn(),
        })).resolves.toBe("回答");
    });
});
