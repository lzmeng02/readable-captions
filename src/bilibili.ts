// src/bilibili.ts 

export function getBiliVideoId(url: string): string | null {
    
    const bv = url.match(/bilibili\.com\/video\/(\w+)/);

    return bv ? bv[1] : null;
}


export async function getBiliTranscript(url: string): Promise<{
    transcript: unknown | null;
    description: string | null;
}> {

    const id = getBiliVideoId(url);
    if (!id) return { transcript: null, description: null };

    const params = id.startsWith("av")
    ? { aid: id.replace(/^av/, ""), bvid: "" }
    : { aid: "", bvid: id };

    const api = new URL("https://api.bilibili.com/x/web-interface/view");
    if (params.aid) api.searchParams.set("aid", params.aid);
    if (params.bvid) api.searchParams.set("bvid", params.bvid);

    const detail = await fetch(api.toString());
    const detailJson = await detail.json();

    const data = detailJson?.data ?? {};
    const descV2 = data?.desc_v2 ?? [];
    const desc =
        Array.isArray(descV2) && descV2.length > 0
        ? descV2.map((v: any) => v?.raw_text).filter(Boolean).join(",")
        : (data?.desc ?? null);

    const subtitleUrl =
        data?.subtitle?.list?.[0]?.subtitle_url ?? null;

    if (!subtitleUrl) {
        return { transcript: null, description: desc };
    }

    const u = subtitleUrl.replace(/^http:/, "https:");
    const subResp = await fetch(u);
    const subJson = await subResp.json();

    return { transcript: subJson?.body ?? null, description: desc };
}

