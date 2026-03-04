import type { Fetcher } from "../../services/http/fetcher";
import type { TranscriptBundle, TranscriptLine } from "../../shared/types";

type ViewResponse = {
    data?: {
        aid?: number;
        pages?: Array<{
            cid?: number;
        }>;
        subtitle?: {
            list?: Array<{
                subtitle_url?: string;
            }>;
        };
    };
};

type SubtitleResponse = {
    body?: TranscriptLine[];
};

type PlayerSubtitleItem = {
    subtitle_url?: unknown;
};

type PlayerResponse = {
    data?: {
        subtitle?: {
            subtitles?: PlayerSubtitleItem[];
        };
    };
};

export function getBiliVideoId(url: string): string | null {
    const match = url.match(/bilibili\.com\/video\/(\w+)\//);
    return match ? match[1] : null;
}

function getBiliPart(url: string): number {
    const parsedUrl = new URL(url);
    const raw = parsedUrl.searchParams.get("p");
    const parsed = raw ? Number(raw) : 1;

    return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

function normalizeUrl(url: string): string {
    if (url.startsWith("//")) {
        return `https:${url}`;
    }

    return url.replace(/^http:/, "https:");
}

function shouldIncludeCookies(url: string): boolean {
    return new URL(url).hostname === "api.bilibili.com";
}

function getAISubtitleUrl(subtitles: PlayerSubtitleItem[]): string | null {
    const readUrl = (item: PlayerSubtitleItem): string | null =>
        typeof item.subtitle_url === "string" && item.subtitle_url.length > 0 ? item.subtitle_url : null;

    const aiUrl = subtitles
        .map(readUrl)
        .find((subtitleUrl): subtitleUrl is string =>
            typeof subtitleUrl === "string" &&
            (subtitleUrl.includes("aisubtitle.hdslb.com") || subtitleUrl.includes("/bfs/ai_subtitle/")),
        );

    if (aiUrl) {
        return aiUrl;
    }

    return subtitles.map(readUrl).find((url): url is string => Boolean(url)) ?? null;
}

async function fetchJson<T>(fetcher: Fetcher, url: string): Promise<T> {
    return fetcher.json<T>(url, {
        credentials: shouldIncludeCookies(url) ? "include" : "omit",
    });
}

export async function fetchBilibiliTranscript(url: string, fetcher: Fetcher): Promise<TranscriptBundle> {
    const id = getBiliVideoId(url);
    if (!id) {
        return {
            lines: [],
            source: "none",
        };
    }

    const viewUrl = new URL("https://api.bilibili.com/x/web-interface/view");
    if (id.startsWith("av")) {
        viewUrl.searchParams.set("aid", id.replace(/^av/, ""));
    } else {
        viewUrl.searchParams.set("bvid", id);
    }

    const viewJson = await fetchJson<ViewResponse>(fetcher, viewUrl.toString());
    const aid = typeof viewJson.data?.aid === "number" ? viewJson.data.aid : undefined;
    const pages = Array.isArray(viewJson.data?.pages) ? viewJson.data.pages : [];
    const part = getBiliPart(url);
    const page = pages[part - 1] ?? pages[0];
    const cid = typeof page?.cid === "number" ? page.cid : undefined;

    const humanSubtitleUrl = viewJson.data?.subtitle?.list?.[0]?.subtitle_url;
    if (typeof humanSubtitleUrl === "string" && humanSubtitleUrl.length > 0) {
        const subtitleUrl = normalizeUrl(humanSubtitleUrl);
        const subtitleJson = await fetchJson<SubtitleResponse>(fetcher, subtitleUrl);

        return {
            lines: Array.isArray(subtitleJson.body) ? subtitleJson.body : [],
            source: "human_view",
            subtitleUrl,
            aid,
            cid,
        };
    }

    if (aid && cid) {
        const playerUrl = new URL("https://api.bilibili.com/x/player/wbi/v2");
        playerUrl.searchParams.set("aid", String(aid));
        playerUrl.searchParams.set("cid", String(cid));
        playerUrl.searchParams.set("_t", String(Date.now()));

        const playerJson = await fetchJson<PlayerResponse>(fetcher, playerUrl.toString());
        const subtitles = playerJson.data?.subtitle?.subtitles;

        if (Array.isArray(subtitles) && subtitles.length > 0) {
            const rawUrl = getAISubtitleUrl(subtitles);

            if (rawUrl) {
                const subtitleUrl = normalizeUrl(rawUrl);
                const subtitleJson = await fetchJson<SubtitleResponse>(fetcher, subtitleUrl);

                return {
                    lines: Array.isArray(subtitleJson.body) ? subtitleJson.body : [],
                    source: "ai_wbi",
                    subtitleUrl,
                    aid,
                    cid,
                };
            }
        }
    }

    return {
        lines: [],
        source: "none",
        aid,
        cid,
    };
}
