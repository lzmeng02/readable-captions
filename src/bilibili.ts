import { fetchBilibiliTranscript } from "./platforms/bilibili/transcript";
import { ExtensionFetcher } from "./services/http/extension_fetcher";
import type { TranscriptBundle, TranscriptLine, TranscriptSource } from "./shared/types";

const fetcher = new ExtensionFetcher();

export type SubtitleLine = TranscriptLine;

export type TranscriptResult = {
    transcript: SubtitleLine[] | null;
    source: TranscriptSource;
    subtitleUrl?: string;
    aid?: number;
    cid?: number;
};

export async function getBiliTranscript(url: string): Promise<TranscriptResult> {
    const bundle = await fetchBilibiliTranscript(url, fetcher);

    return {
        transcript: bundle.lines.length > 0 ? bundle.lines : null,
        source: bundle.source,
        subtitleUrl: bundle.subtitleUrl,
        aid: bundle.aid,
        cid: bundle.cid,
    };
}

export type { TranscriptBundle };
