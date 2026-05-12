import {
    fetchBilibiliAiSubtitleUrl,
    fetchBilibiliSubtitleBody,
    fetchBilibiliViewInfo,
    getBiliVideoId,
} from "./api";
import { normalizeBilibiliTranscript } from "./normalize";
import type { PlatformAdapter, PlatformTranscriptResult } from "../types";

export async function getBilibiliTranscript(url: string): Promise<PlatformTranscriptResult> {
    const id = getBiliVideoId(url);
    if (!id) {
        return { transcript: null, source: "none" };
    }

    const viewInfo = await fetchBilibiliViewInfo(url);
    if (!viewInfo) {
        return { transcript: null, source: "none" };
    }

    const { aid, cid, subtitleUrl: viewSubtitleUrl, availableSubtitles: viewAvailableSubtitles } = viewInfo;

    if (typeof viewSubtitleUrl === "string" && viewSubtitleUrl.length > 0) {
        const { subtitleUrl, body } = await fetchBilibiliSubtitleBody(viewSubtitleUrl);

        return {
            transcript: normalizeBilibiliTranscript(body),
            source: "human_view",
            subtitleUrl,
            aid,
            cid,
            availableSubtitles: viewAvailableSubtitles || [],
        };
    }

    if (aid && cid) {
        const aiSubtitles = await fetchBilibiliAiSubtitleUrl(aid, cid);

        if (aiSubtitles && aiSubtitles.length > 0) {
            const mainSub = aiSubtitles.find(s => s.subtitle_url.includes("aisubtitle.hdslb.com") || s.subtitle_url.includes("/bfs/ai_subtitle/")) || aiSubtitles[0];
            const { subtitleUrl, body } = await fetchBilibiliSubtitleBody(mainSub.subtitle_url);

            return {
                transcript: normalizeBilibiliTranscript(body),
                source: "ai_wbi",
                subtitleUrl,
                aid,
                cid,
                availableSubtitles: aiSubtitles,
            };
        }
    }

    return { transcript: null, source: "none", aid, cid };
}

export const bilibiliAdapter: PlatformAdapter = {
    platformId: "bilibili",
    matches(url: string): boolean {
        return /bilibili\.com\/video\//.test(url);
    },
    getTranscript: getBilibiliTranscript,
};
