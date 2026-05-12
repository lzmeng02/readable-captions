import type { Transcript } from "../transcript/model";

export type TranscriptSource = "human_view" | "ai_wbi" | "none";

export type PlatformTranscriptResult = {
    transcript: Transcript | null;
    source: TranscriptSource;
    subtitleUrl?: string;
    aid?: number;
    cid?: number;
    availableSubtitles?: { lan_doc: string; subtitle_url: string }[];
};

export interface PlatformAdapter {
    platformId: string;
    matches(url: string): boolean;
    getTranscript(url: string): Promise<PlatformTranscriptResult>;
}
