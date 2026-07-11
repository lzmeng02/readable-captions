const BILIBILI_TITLE_SUFFIX = /(?:_|\s*-\s*)哔哩哔哩(?:_bilibili)?$/u;

export function extractVideoTitle(documentTitle: string): string {
    const title = documentTitle.replace(BILIBILI_TITLE_SUFFIX, "").trim();
    return title || "bilibili_video";
}
