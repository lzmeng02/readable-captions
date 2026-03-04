export function formatTime(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;

    if (hours > 0) {
        return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
    }

    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatTimeRange(from: number, to: number): string {
    return `${formatTime(from)} - ${formatTime(to)}`;
}
