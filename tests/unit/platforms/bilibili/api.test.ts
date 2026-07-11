import { afterEach, describe, expect, it, vi } from "vitest";
import {
    BilibiliApiError,
    fetchBilibiliAiSubtitleUrl,
    fetchBilibiliSubtitleBody,
    fetchBilibiliViewInfo,
} from "../../../../src/platforms/bilibili/api";

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

async function expectApiError(
    promise: Promise<unknown>,
    endpointPath: string,
    code?: number,
): Promise<void> {
    const error = await promise.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(BilibiliApiError);
    expect(error).toMatchObject({
        endpoint: expect.stringContaining(endpointPath),
        code,
    });
}

describe("fetchBilibiliViewInfo", () => {
    it("rejects a non-zero Bilibili business code", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            code: -412,
            message: "request blocked",
            data: null,
        }), { status: 200, headers: { "Content-Type": "application/json" } })));

        await expectApiError(
            fetchBilibiliViewInfo("https://www.bilibili.com/video/BV1abc"),
            "/x/web-interface/view",
            -412,
        );
    });

    it("rejects a malformed Bilibili envelope with endpoint context", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("invalid")));

        await expectApiError(
            fetchBilibiliViewInfo("https://www.bilibili.com/video/BV1abc"),
            "/x/web-interface/view",
        );
    });

    it("rejects a Bilibili envelope with no business code", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data: {} })));

        await expectApiError(
            fetchBilibiliViewInfo("https://www.bilibili.com/video/BV1abc"),
            "/x/web-interface/view",
        );
    });

    it("does not expose default-part subtitles for p=2", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            code: 0,
            data: {
                aid: 7,
                bvid: "BV1abc",
                cid: 11,
                pages: [{ cid: 11 }, { cid: 22 }],
                subtitle: { list: [{ lan_doc: "涓枃", subtitle_url: "//p1.example/sub.json" }] },
            },
        }))));

        const result = await fetchBilibiliViewInfo("https://www.bilibili.com/video/BV1abc?p=2");
        expect(result).toMatchObject({ cid: 22, defaultCid: 11, availableSubtitles: [] });
        expect(result?.subtitleUrl).toBeUndefined();
    });

    it("does not expose default-part subtitles for p=2 when both parts share a cid", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
            code: 0,
            data: {
                aid: 7,
                bvid: "BV1abc",
                cid: 11,
                pages: [{ cid: 11 }, { cid: 11 }],
                subtitle: { list: [{ lan_doc: "Chinese", subtitle_url: "//p1.example/sub.json" }] },
            },
        })));

        const result = await fetchBilibiliViewInfo("https://www.bilibili.com/video/BV1abc?p=2");
        expect(result).toMatchObject({ cid: 11, defaultCid: 11, availableSubtitles: [] });
        expect(result?.subtitleUrl).toBeUndefined();
    });

    it("rejects an out-of-range selected part instead of falling back to p=1", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
            code: 0,
            data: {
                aid: 7,
                bvid: "BV1abc",
                cid: 11,
                pages: [{ cid: 11 }],
                subtitle: { list: [] },
            },
        })));

        await expectApiError(
            fetchBilibiliViewInfo("https://www.bilibili.com/video/BV1abc?p=2"),
            "/x/web-interface/view",
        );
    });

    it("uses the top-level cid for p=1 when pages are missing", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
            code: 0,
            data: {
                aid: 7,
                bvid: "BV1abc",
                cid: 11,
                pages: [],
                subtitle: { list: [{ lan_doc: "Chinese", subtitle_url: "//p1.example/sub.json" }] },
            },
        })));

        await expect(fetchBilibiliViewInfo("https://www.bilibili.com/video/BV1abc"))
            .resolves.toMatchObject({
                cid: 11,
                defaultCid: 11,
                subtitleUrl: "//p1.example/sub.json",
            });
    });
});

describe("Bilibili API envelopes", () => {
    it("rejects a non-zero WBI business code with endpoint context", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
            code: -400,
            message: "invalid request",
            data: null,
        })));

        await expectApiError(
            fetchBilibiliAiSubtitleUrl(7, 11, "BV1abc"),
            "/x/player/wbi/v2",
            -400,
        );
    });
});

describe("Bilibili fetch policy", () => {
    it("includes credentials and forwards the signal for view API requests", async () => {
        const signal = new AbortController().signal;
        let capturedInit: RequestInit | undefined;
        vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            capturedInit = init;
            return jsonResponse({
                code: 0,
                data: {
                    aid: 7,
                    bvid: "BV1abc",
                    cid: 11,
                    pages: [{ cid: 11 }],
                    subtitle: { list: [] },
                },
            });
        }));

        await fetchBilibiliViewInfo("https://www.bilibili.com/video/BV1abc", signal);
        expect(capturedInit?.credentials).toBe("include");
        expect(capturedInit?.signal).toBe(signal);
    });

    it("includes credentials and forwards the signal for WBI API requests", async () => {
        const signal = new AbortController().signal;
        let capturedInit: RequestInit | undefined;
        vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            capturedInit = init;
            return jsonResponse({
                code: 0,
                data: { subtitle: { subtitles: [] } },
            });
        }));

        await fetchBilibiliAiSubtitleUrl(7, 11, "BV1abc", signal);
        expect(capturedInit?.credentials).toBe("include");
        expect(capturedInit?.signal).toBe(signal);
    });

    it("omits credentials and forwards the signal for subtitle bodies on the API host", async () => {
        const signal = new AbortController().signal;
        let capturedInit: RequestInit | undefined;
        vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            capturedInit = init;
            return jsonResponse({ body: [] });
        }));

        await fetchBilibiliSubtitleBody("https://api.bilibili.com/subtitle.json", signal);
        expect(capturedInit?.credentials).toBe("omit");
        expect(capturedInit?.signal).toBe(signal);
    });
});
