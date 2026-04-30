export type BilibiliSubtitleItem = {
    lan_doc: string;
    subtitle_url: string;
};

type BilibiliViewInfo = {
    aid?: number;
    cid?: number;
    subtitleUrl?: string;
    availableSubtitles?: BilibiliSubtitleItem[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
    const value = record[key];
    return typeof value === "number" ? value : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getArray(record: Record<string, unknown>, key: string): unknown[] {
    const value = record[key];
    return Array.isArray(value) ? value : [];
}

function getNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
    return asRecord(record[key]);
}

function getBiliPart(url: string): number {
    const u = new URL(url);
    const pStr = u.searchParams.get("p");
    const p = pStr ? Number(pStr) : 1;
    return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
}

function normalizeUrl(url: string): string {
    if (url.startsWith("//")) return "https:" + url;
    return url.replace(/^http:/, "https:");
}

function shouldIncludeCookies(url: string): boolean {
    return new URL(url).hostname === "api.bilibili.com";
}

async function fetchJson(url: string): Promise<unknown> {
    const includeCookies = shouldIncludeCookies(url);

    const res = await fetch(url, {
        credentials: includeCookies ? "include" : "omit",
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }

    return res.json();
}

function getSubtitleItems(subtitles: unknown[]): BilibiliSubtitleItem[] {
    const results: BilibiliSubtitleItem[] = [];
    for (const item of subtitles) {
        const subtitle = asRecord(item);
        if (subtitle) {
            const subtitle_url = readString(subtitle, "subtitle_url");
            const lan_doc = readString(subtitle, "lan_doc") || "未知语言";
            if (subtitle_url) {
                results.push({ lan_doc, subtitle_url });
            }
        }
    }
    return results;
}

export function getBiliVideoId(url: string): string | null {
    const match = url.match(/bilibili\.com\/video\/(\w+)\//);
    return match ? match[1] : null;
}

export async function fetchBilibiliViewInfo(videoUrl: string): Promise<BilibiliViewInfo | null> {
    const id = getBiliVideoId(videoUrl);
    if (!id) {
        return null;
    }

    const view = new URL("https://api.bilibili.com/x/web-interface/view");
    if (id.startsWith("av")) {
        view.searchParams.set("aid", id.replace(/^av/, ""));
    } else {
        view.searchParams.set("bvid", id);
    }

    const viewJson = await fetchJson(view.toString());
    const root = asRecord(viewJson) ?? {};
    const data = getNestedRecord(root, "data") ?? {};

    const aid = readNumber(data, "aid");
    const pages = getArray(data, "pages");
    const pageIndex = getBiliPart(videoUrl) - 1;
    const page = asRecord(pages[pageIndex]) ?? asRecord(pages[0]) ?? {};
    const cid = readNumber(page, "cid");

    const subtitle = getNestedRecord(data, "subtitle") ?? {};
    const subtitleList = getArray(subtitle, "list");
    const availableSubtitles = getSubtitleItems(subtitleList);
    const subtitleUrl = availableSubtitles.length > 0 ? availableSubtitles[0].subtitle_url : undefined;

    return { aid, cid, subtitleUrl, availableSubtitles };
}

export async function fetchBilibiliAiSubtitleUrl(aid: number, cid: number): Promise<BilibiliSubtitleItem[]> {
    const wbi = new URL("https://api.bilibili.com/x/player/wbi/v2");
    wbi.searchParams.set("aid", String(aid));
    wbi.searchParams.set("cid", String(cid));
    wbi.searchParams.set("_t", String(Date.now()));

    const wbiJson = await fetchJson(wbi.toString());
    const root = asRecord(wbiJson) ?? {};
    const data = getNestedRecord(root, "data") ?? {};
    const subtitle = getNestedRecord(data, "subtitle") ?? {};
    const subtitles = getArray(subtitle, "subtitles");

    return getSubtitleItems(subtitles);
}

export async function fetchBilibiliSubtitleBody(rawSubtitleUrl: string): Promise<{
    subtitleUrl: string;
    body: unknown;
}> {
    const subtitleUrl = normalizeUrl(rawSubtitleUrl);
    const subtitleJson = await fetchJson(subtitleUrl);
    const root = asRecord(subtitleJson) ?? {};

    return {
        subtitleUrl,
        body: root["body"],
    };
}
