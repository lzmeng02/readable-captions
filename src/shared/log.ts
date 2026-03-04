import type { Logger } from "./types";

function logWithLevel(level: "debug" | "info" | "warn" | "error", scope: string, message: string, args: unknown[]): void {
    const prefix = `[${scope}] ${message}`;
    const consoleMethod = console[level] ?? console.log;
    consoleMethod(prefix, ...args);
}

export function createLogger(scope: string): Logger {
    return {
        debug(message, ...args) {
            logWithLevel("debug", scope, message, args);
        },
        info(message, ...args) {
            logWithLevel("info", scope, message, args);
        },
        warn(message, ...args) {
            logWithLevel("warn", scope, message, args);
        },
        error(message, ...args) {
            logWithLevel("error", scope, message, args);
        },
    };
}
