import { registerBackground, type ExtensionChrome } from "./background-app";
import { streamGenerationFromApi } from "./generation/llm-api";
import { withKeepAlive } from "./generation/keepalive";
import type { KeepAliveRunner } from "./generation/background-stream";
import {
    getSettings,
    restrictStorageAccessToTrustedContexts,
    watchSettings,
} from "./settings/storage";

function getExtensionChrome(): ExtensionChrome | null {
    return (globalThis as typeof globalThis & { chrome?: ExtensionChrome }).chrome ?? null;
}

const chromeApi = getExtensionChrome();
const keepAlive: KeepAliveRunner = (work, signal) => withKeepAlive(work, signal, {
    pulse: () => chromeApi?.runtime?.getPlatformInfo?.(),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
});

registerBackground({
    chrome: chromeApi,
    getSettings,
    restrictStorageAccessToTrustedContexts,
    watchSettings,
    streamGenerationFromApi,
    keepAlive,
});
