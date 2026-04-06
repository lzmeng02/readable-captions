export function watchRouteChange(onChange: (url: string) => void): void {
    let currentUrl = location.href;

    setInterval((): void => {
        if (location.href !== currentUrl) {
            currentUrl = location.href;
            onChange(currentUrl);
        }
    }, 800);
}
