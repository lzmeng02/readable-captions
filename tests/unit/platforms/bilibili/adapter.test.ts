import { afterEach, describe, expect, it, vi } from "vitest";
import { getBilibiliTranscript } from "../../../../src/platforms/bilibili/adapter";

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

function viewFixture(options: {
    defaultCid?: number;
    selectedCid?: number;
    subtitleUrl?: string;
} = {}): unknown {
    const defaultCid = options.defaultCid ?? 11;
    const selectedCid = options.selectedCid ?? defaultCid;
    return {
        code: 0,
        data: {
            aid: 7,
            bvid: "BV1abc",
            cid: defaultCid,
            pages: [{ cid: defaultCid }, { cid: selectedCid }],
            subtitle: {
                list: options.subtitleUrl
                    ? [{ lan_doc: "涓枃", subtitle_url: options.subtitleUrl }]
                    : [],
            },
        },
    };
}

function wbiFixture(subtitleUrl?: string): unknown {
    return {
        code: 0,
        data: {
            subtitle: {
                subtitles: subtitleUrl
                    ? [{ lan_doc: "涓枃 AI", subtitle_url: subtitleUrl }]
                    : [],
            },
        },
    };
}

describe("getBilibiliTranscript", () => {
    it("loads the selected part through WBI instead of using p=1 view subtitles", async () => {
        const calls: URL[] = [];
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            calls.push(url);
            if (url.pathname === "/x/web-interface/view") return jsonResponse(viewFixture({
                defaultCid: 11,
                selectedCid: 22,
                subtitleUrl: "//p1.example/sub.json",
            }));
            if (url.pathname === "/x/player/wbi/v2") return jsonResponse(wbiFixture("//p2.example/sub.json"));
            if (url.hostname === "p2.example") return jsonResponse({ body: [{ from: 2, to: 3, content: "P2" }] });
            throw new Error(`Unexpected URL ${url}`);
        }));

        const result = await getBilibiliTranscript("https://www.bilibili.com/video/BV1abc?p=2");
        expect(result).toMatchObject({ cid: 22, source: "ai_wbi", transcript: [{ from: 2, to: 3, content: "P2" }] });
        expect(calls.find((url) => url.pathname === "/x/player/wbi/v2")?.searchParams.get("cid")).toBe("22");
        expect(calls.some((url) => url.hostname === "p1.example")).toBe(false);
    });

    it("falls back to WBI when a view subtitle body is malformed", async () => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            if (url.pathname === "/x/web-interface/view") return jsonResponse(viewFixture({ subtitleUrl: "//view.example/sub.json" }));
            if (url.hostname === "view.example") return jsonResponse({ body: [{ from: "bad", to: 1, content: "bad" }] });
            if (url.pathname === "/x/player/wbi/v2") return jsonResponse(wbiFixture("//wbi.example/sub.json"));
            if (url.hostname === "wbi.example") return jsonResponse({ body: [{ from: 1, to: 2, content: "fallback" }] });
            throw new Error(`Unexpected URL ${url}`);
        }));

        await expect(getBilibiliTranscript("https://www.bilibili.com/video/BV1abc"))
            .resolves.toMatchObject({
                source: "ai_wbi",
                transcript: [{ from: 1, to: 2, content: "fallback" }],
            });
    });

    it("falls back to WBI when a view subtitle body is empty", async () => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            if (url.pathname === "/x/web-interface/view") return jsonResponse(viewFixture({ subtitleUrl: "//view.example/sub.json" }));
            if (url.hostname === "view.example") return jsonResponse({ body: [] });
            if (url.pathname === "/x/player/wbi/v2") return jsonResponse(wbiFixture("//wbi.example/sub.json"));
            if (url.hostname === "wbi.example") return jsonResponse({ body: [{ from: 1, to: 2, content: "fallback" }] });
            throw new Error(`Unexpected URL ${url}`);
        }));

        await expect(getBilibiliTranscript("https://www.bilibili.com/video/BV1abc"))
            .resolves.toMatchObject({ source: "ai_wbi", transcript: [{ from: 1, to: 2, content: "fallback" }] });
    });

    it("returns none only after a valid empty WBI subtitle list", async () => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            if (url.pathname === "/x/web-interface/view") return jsonResponse(viewFixture());
            if (url.pathname === "/x/player/wbi/v2") return jsonResponse(wbiFixture());
            throw new Error(`Unexpected URL ${url}`);
        }));

        await expect(getBilibiliTranscript("https://www.bilibili.com/video/BV1abc"))
            .resolves.toMatchObject({ transcript: null, source: "none", aid: 7, cid: 11 });
    });

    it("rejects when the final selected subtitle body is malformed", async () => {
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            if (url.pathname === "/x/web-interface/view") return jsonResponse(viewFixture());
            if (url.pathname === "/x/player/wbi/v2") return jsonResponse(wbiFixture("//wbi.example/sub.json"));
            if (url.hostname === "wbi.example") return jsonResponse({ body: [{ from: 0, to: null, content: "bad" }] });
            throw new Error(`Unexpected URL ${url}`);
        }));

        await expect(getBilibiliTranscript("https://www.bilibili.com/video/BV1abc"))
            .rejects.toThrow("Invalid subtitle body");
    });
});
