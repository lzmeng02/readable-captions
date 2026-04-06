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

    const { aid, cid, subtitleUrl: viewSubtitleUrl } = viewInfo;

    if (typeof viewSubtitleUrl === "string" && viewSubtitleUrl.length > 0) {
        const { subtitleUrl, body } = await fetchBilibiliSubtitleBody(viewSubtitleUrl);

        return {
            transcript: normalizeBilibiliTranscript(body),
            source: "human_view",
            subtitleUrl,
            aid,
            cid,
        };
    }

    if (aid && cid) {
        const aiSubtitleUrl = await fetchBilibiliAiSubtitleUrl(aid, cid);

        if (aiSubtitleUrl) {
            const { subtitleUrl, body } = await fetchBilibiliSubtitleBody(aiSubtitleUrl);

            return {
                transcript: normalizeBilibiliTranscript(body),
                source: "ai_wbi",
                subtitleUrl,
                aid,
                cid,
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
