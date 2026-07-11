export type BilibiliSubtitleItem = {
    lan_doc: string;
    subtitle_url: string;
};

export class BilibiliApiError extends Error {
    readonly endpoint: string;
    readonly code?: number;

    constructor(
        message: string,
        endpoint: string,
        code?: number,
    ) {
        super(message);
        this.name = "BilibiliApiError";
        this.endpoint = endpoint;
        this.code = code;
    }
}

export type BilibiliViewInfo = {
    aid: number;
    bvid?: string;
    cid: number;
    defaultCid: number;
    subtitleUrl?: string;
    availableSubtitles: BilibiliSubtitleItem[];
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

function requireBilibiliEnvelope(value: unknown, endpoint: string): Record<string, unknown> {
    const root = asRecord(value);
    if (!root) throw new BilibiliApiError("Invalid Bilibili API response.", endpoint);
    const code = readNumber(root, "code");
    if (code !== 0) {
        const serviceMessage = readString(root, "message") ?? readString(root, "msg") ?? "Unknown error";
        throw new BilibiliApiError(`Bilibili API error (${code ?? "invalid"}): ${serviceMessage}`, endpoint, code);
    }
    return root;
}

export function getBiliPart(url: string): number {
    const u = new URL(url);
    const pStr = u.searchParams.get("p");
    const p = pStr ? Number(pStr) : 1;
    return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
}

function normalizeUrl(url: string): string {
    if (url.startsWith("//")) return "https:" + url;
    return url.replace(/^http:/, "https:");
}

function isBilibiliHost(hostname: string): boolean {
    return hostname === "bilibili.com" || hostname.endsWith(".bilibili.com");
}

function normalizePathVideoId(id: string | undefined): string | null {
    if (!id) return null;
    if (/^BV[0-9A-Za-z]+$/.test(id)) return id;
    if (/^av\d+$/i.test(id)) return `av${id.slice(2)}`;
    return null;
}

function normalizeAidVideoId(id: string | null): string | null {
    if (!id || !/^\d+$/.test(id)) return null;
    return `av${id}`;
}

async function fetchJson(
    url: string,
    credentials: RequestCredentials,
    signal?: AbortSignal,
): Promise<unknown> {
    const res = await fetch(url, {
        credentials,
        signal,
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }

    try {
        return await res.json();
    } catch {
        throw new BilibiliApiError(`Invalid JSON response from ${url}.`, url);
    }
}

function getSubtitleItems(subtitles: unknown[]): BilibiliSubtitleItem[] {
    const results: BilibiliSubtitleItem[] = [];
    for (const item of subtitles) {
        const subtitle = asRecord(item);
        if (subtitle) {
            const subtitle_url = readString(subtitle, "subtitle_url");
            const lan_doc = readString(subtitle, "lan_doc") || "未知语言";
            if (subtitle_url) {
                results.push({ lan_doc, subtitle_url: normalizeUrl(subtitle_url) });
            }
        }
    }
    return results;
}

function requireSubtitleItems(subtitles: unknown[], endpoint: string): BilibiliSubtitleItem[] {
    return subtitles.map((item) => {
        const subtitle = asRecord(item);
        const subtitleUrl = subtitle ? readString(subtitle, "subtitle_url") : undefined;
        if (!subtitle || !subtitleUrl?.trim()) {
            throw new BilibiliApiError("Bilibili WBI response contains an invalid subtitle item.", endpoint);
        }

        return {
            lan_doc: readString(subtitle, "lan_doc") || "未知语言",
            subtitle_url: normalizeUrl(subtitleUrl),
        };
    });
}

export function getBiliVideoId(url: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }

    if (!isBilibiliHost(parsed.hostname)) {
        return null;
    }

    const videoPathMatch = parsed.pathname.match(/^\/video\/([^/]+)/);
    const pathId = normalizePathVideoId(videoPathMatch?.[1]);
    if (pathId) return pathId;

    const queryBvid = normalizePathVideoId(parsed.searchParams.get("bvid") ?? undefined);
    if (queryBvid?.startsWith("BV")) return queryBvid;

    const queryAid = normalizeAidVideoId(parsed.searchParams.get("aid") ?? parsed.searchParams.get("avid"));
    if (queryAid) return queryAid;

    if (parsed.pathname === "/list/watchlater") {
        return normalizeAidVideoId(parsed.searchParams.get("oid"));
    }

    return null;
}

export function getBilibiliRouteKey(url: string): string | null {
    const id = getBiliVideoId(url);
    return id ? `bilibili:${id}:p=${getBiliPart(url)}` : null;
}

export async function fetchBilibiliViewInfo(videoUrl: string, signal?: AbortSignal): Promise<BilibiliViewInfo | null> {
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

    const root = requireBilibiliEnvelope(await fetchJson(view.toString(), "include", signal), view.toString());
    const data = getNestedRecord(root, "data");
    if (!data) throw new BilibiliApiError("Bilibili view response has no data.", view.toString());

    const aid = readNumber(data, "aid");
    const bvid = readString(data, "bvid");
    const pages = getArray(data, "pages");
    const part = getBiliPart(videoUrl);
    const firstPage = asRecord(pages[0]);
    const selectedPage = asRecord(pages[part - 1]);
    const defaultCid = readNumber(data, "cid") ?? (firstPage ? readNumber(firstPage, "cid") : undefined);
    if (part > 1 && !selectedPage) {
        throw new BilibiliApiError(`Bilibili view response has no part ${part}.`, view.toString());
    }
    const cid = selectedPage
        ? readNumber(selectedPage, "cid")
        : defaultCid;
    if (aid === undefined || cid === undefined || defaultCid === undefined) {
        throw new BilibiliApiError("Bilibili view response is missing aid/cid.", view.toString());
    }

    const availableSubtitles = part === 1 && cid === defaultCid
        ? getSubtitleItems(getArray(getNestedRecord(data, "subtitle") ?? {}, "list"))
        : [];
    const subtitleUrl = availableSubtitles.length > 0 ? availableSubtitles[0].subtitle_url : undefined;

    return { aid, bvid, cid, defaultCid, subtitleUrl, availableSubtitles };
}

export async function fetchBilibiliAiSubtitleUrl(
    aid: number,
    cid: number,
    bvid?: string,
    signal?: AbortSignal,
): Promise<BilibiliSubtitleItem[]> {
    const wbi = new URL("https://api.bilibili.com/x/player/wbi/v2");
    if (bvid) {
        wbi.searchParams.set("bvid", bvid);
    } else {
        wbi.searchParams.set("aid", String(aid));
    }
    wbi.searchParams.set("cid", String(cid));
    wbi.searchParams.set("_t", String(Date.now()));

    const endpoint = wbi.toString();
    const root = requireBilibiliEnvelope(await fetchJson(endpoint, "include", signal), endpoint);
    const data = getNestedRecord(root, "data");
    if (!data) throw new BilibiliApiError("Bilibili WBI response has no data.", endpoint);
    const subtitle = getNestedRecord(data, "subtitle");
    if (!subtitle) throw new BilibiliApiError("Bilibili WBI response has no subtitle metadata.", endpoint);
    const subtitles = subtitle["subtitles"];
    if (!Array.isArray(subtitles)) {
        throw new BilibiliApiError("Bilibili WBI response has no subtitles array.", endpoint);
    }

    return requireSubtitleItems(subtitles, endpoint);
}

export async function fetchBilibiliSubtitleBody(rawSubtitleUrl: string, signal?: AbortSignal): Promise<{
    subtitleUrl: string;
    body: unknown;
}> {
    const subtitleUrl = normalizeUrl(rawSubtitleUrl);
    const subtitleJson = await fetchJson(subtitleUrl, "omit", signal);
    const root = asRecord(subtitleJson) ?? {};

    return {
        subtitleUrl,
        body: root["body"],
    };
}
