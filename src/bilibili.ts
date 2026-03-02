// src/bilibili.ts

export type SubtitleLine = {
    from: number;
    to: number;
    sid?: number;
    location?: number;
    content: string;
    music?: number;
};


export type TranscriptResult = {
    transcript: SubtitleLine[] | null;
    source: "human_view" | "ai_wbi" | "none";
    subtitleUrl?: string;
    aid?: number;
    cid?: number;
};


export type SubItem = { subtitle_url?: unknown };

export function getBiliVideoId(url: string): string | null {
    const m = url.match(/bilibili\.com\/video\/(\w+)\//);
    return m ? m[1] : null;
}


function getBiliPart(url: string): number {

    const u = new URL(url);
    const pStr = u.searchParams.get("p");
    const p = pStr ? Number(pStr) : 1;
    return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
}


function normalizeUrl(u: string): string {
    
    if (u.startsWith("//")) return "https:" + u;
    return u.replace(/^http:/, "https:");
}


async function fetchJson(url: string): Promise<any> {
  const includeCookies = shouldIncludeCookies(url);

  const res = await fetch(url, {
    credentials: includeCookies ? "include" : "omit",
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return res.json();
}


function shouldIncludeCookies(url: string): boolean {
  return new URL(url).hostname === "api.bilibili.com";
}


function getAISubtitles(subs: SubItem[]): string | null {
    const urlOf = (s: SubItem): string | null =>
        typeof s.subtitle_url === "string" && s.subtitle_url.length > 0
            ? s.subtitle_url
            : null;

    const isAiUrl = (url: string): boolean =>
        url.includes("aisubtitle.hdslb.com") || url.includes("/bfs/ai_subtitle/");

    for (const s of subs) {
        const url = urlOf(s);
        if (url && isAiUrl(url)) return url;
    }

    for (const s of subs) {
        const url = urlOf(s);
        if (url) return url;
    }

    return null;
}


export async function getBiliTranscript(url: string): Promise<TranscriptResult> {

    const id = getBiliVideoId(url);
    if (!id) return { transcript: null, source: "none" };

    const view = new URL("https://api.bilibili.com/x/web-interface/view");
    if (id.startsWith("av")) view.searchParams.set("aid", id.replace(/^av/, ""));
    else view.searchParams.set("bvid", id);

    const viewJson = await fetchJson(view.toString());
    const data = viewJson?.data ?? {};

    const aid: number | undefined = typeof data?.aid === "number" ? data.aid : undefined;

    const pages: any[] = Array.isArray(data?.pages) ? data.pages : [];
    const p = getBiliPart(url);
    const page = pages[p - 1] ?? pages[0];
    const cid: number | undefined = typeof page?.cid === "number" ? page.cid : undefined;

    // human subtitle
    const viewSubUrl = data?.subtitle?.list?.[0]?.subtitle_url ?? null;
    if (typeof viewSubUrl === "string" && viewSubUrl.length > 0) {
        const subtitleUrl = normalizeUrl(viewSubUrl);
        const subJson = await fetchJson(subtitleUrl);
        const body = subJson?.body;

        return {
            transcript: Array.isArray(body) ? (body as SubtitleLine[]) : null,
            source: "human_view",
            subtitleUrl,
            aid,
            cid,
        };
    }

    // invaild humman sub, try ai sub
    if (aid && cid) {
        const wbi = new URL("https://api.bilibili.com/x/player/wbi/v2");
        wbi.searchParams.set("aid", String(aid));
        wbi.searchParams.set("cid", String(cid));
        wbi.searchParams.set("_t", String(Date.now()));

        const wbiJson = await fetchJson(wbi.toString());
        const subs = wbiJson?.data?.subtitle?.subtitles;

        if (Array.isArray(subs) && subs.length > 0) {
            const rawUrl = getAISubtitles(subs);
            if (rawUrl) {
                const subtitleUrl = normalizeUrl(String(rawUrl));
                const subJson = await fetchJson(subtitleUrl);
                const body = subJson?.body;

                return {
                    transcript: Array.isArray(body) ? (body as SubtitleLine[]) : null,
                    source: "ai_wbi",
                    subtitleUrl,
                    aid,
                    cid,
                };
            }
        }
    }

    return { transcript: null, source: "none", aid, cid };
}