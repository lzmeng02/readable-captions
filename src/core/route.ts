export function createRouteKey(urlLike: string): string {
    const url = new URL(urlLike, window.location.origin);
    return `${url.origin}${url.pathname}${url.search}`;
}
