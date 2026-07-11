import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBilibiliViewInfo } from "../../../../src/platforms/bilibili/api";

afterEach(() => vi.unstubAllGlobals());

describe("fetchBilibiliViewInfo", () => {
    it("rejects a non-zero Bilibili business code", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            code: -412,
            message: "request blocked",
            data: null,
        }), { status: 200, headers: { "Content-Type": "application/json" } })));

        await expect(fetchBilibiliViewInfo("https://www.bilibili.com/video/BV1abc"))
            .rejects.toMatchObject({ code: -412 });
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
});
