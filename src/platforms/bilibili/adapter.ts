import {
    fetchBilibiliAiSubtitleUrl,
    fetchBilibiliSubtitleBody,
    fetchBilibiliViewInfo,
    getBiliVideoId,
} from "./api";
import { normalizeBilibiliTranscript } from "./normalize";
import type { PlatformAdapter, PlatformTranscriptResult } from "../types";

function isPreferredAiSubtitle(subtitle: { subtitle_url: string }): boolean {
    return subtitle.subtitle_url.includes("aisubtitle.hdslb.com")
        || subtitle.subtitle_url.includes("/bfs/ai_subtitle/");
}

export async function getBilibiliTranscript(url: string, signal?: AbortSignal): Promise<PlatformTranscriptResult> {
    const id = getBiliVideoId(url);
    if (!id) {
        return { transcript: null, source: "none" };
    }

    const viewInfo = await fetchBilibiliViewInfo(url, signal);
    if (!viewInfo) {
        return { transcript: null, source: "none" };
    }

    const { aid, bvid, cid, subtitleUrl: viewSubtitleUrl, availableSubtitles: viewAvailableSubtitles } = viewInfo;

    if (viewSubtitleUrl) {
        const { subtitleUrl, body } = await fetchBilibiliSubtitleBody(viewSubtitleUrl, signal);
        const transcript = normalizeBilibiliTranscript(body);
        if (transcript && transcript.length > 0) {
            return {
                transcript,
                source: "human_view",
                subtitleUrl,
                aid,
                cid,
                availableSubtitles: viewAvailableSubtitles,
            };
        }
    }

    const aiSubtitles = await fetchBilibiliAiSubtitleUrl(aid, cid, bvid, signal);
    if (aiSubtitles.length === 0) {
        return { transcript: null, source: "none", aid, cid };
    }

    const selected = aiSubtitles.find(isPreferredAiSubtitle) ?? aiSubtitles[0];
    const { subtitleUrl, body } = await fetchBilibiliSubtitleBody(selected.subtitle_url, signal);
    const transcript = normalizeBilibiliTranscript(body);
    if (!transcript || transcript.length === 0) throw new Error(`Invalid subtitle body from ${subtitleUrl}`);
    return { transcript, source: "ai_wbi", subtitleUrl, aid, cid, availableSubtitles: aiSubtitles };
}

export const bilibiliAdapter: PlatformAdapter = {
    platformId: "bilibili",
    matches(url: string): boolean {
        return getBiliVideoId(url) !== null;
    },
    getTranscript: getBilibiliTranscript,
};
