import { bilibiliAdapter } from "./bilibili/adapter";
import type { PlatformAdapter, PlatformTranscriptResult } from "./types";

const platformAdapters: PlatformAdapter[] = [bilibiliAdapter];

export function getPlatformAdapter(url: string): PlatformAdapter | null {
    for (const adapter of platformAdapters) {
        if (adapter.matches(url)) {
            return adapter;
        }
    }

    return null;
}

export async function getTranscriptForUrl(url: string): Promise<PlatformTranscriptResult> {
    const adapter = getPlatformAdapter(url);

    if (!adapter) {
        return { transcript: null, source: "none" };
    }

    return adapter.getTranscript(url);
}
