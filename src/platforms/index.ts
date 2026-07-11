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

export function getPlatformRouteKey(url: string): string | null {
    return getPlatformAdapter(url)?.getRouteKey(url) ?? null;
}

export async function getTranscriptForUrl(
    url: string,
    signal?: AbortSignal,
): Promise<PlatformTranscriptResult> {
    const adapter = getPlatformAdapter(url);

    if (!adapter) {
        return { transcript: null, source: "none" };
    }

    return adapter.getTranscript(url, signal);
}
