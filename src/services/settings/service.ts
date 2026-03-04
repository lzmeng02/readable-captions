import { DEFAULT_SETTINGS, normalizeSettings } from "./schema";
import type { AppSettings, SettingsService } from "../../shared/types";

const STORAGE_KEY = "readable-captions:settings";

type ChromeStorageItems = Record<string, unknown>;

interface ChromeStorageAreaLike {
    get(
        keys: string | string[] | Record<string, unknown> | null,
        callback?: (items: ChromeStorageItems) => void,
    ): Promise<ChromeStorageItems> | void;
    set(items: ChromeStorageItems, callback?: () => void): Promise<void> | void;
}

interface ChromeLike {
    storage?: {
        local?: ChromeStorageAreaLike;
    };
}

function getChromeStorageArea(): ChromeStorageAreaLike | null {
    const chromeLike = (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome;
    return chromeLike?.storage?.local ?? null;
}

function toPromise<T>(
    maybePromise: Promise<T> | void,
    fallback: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> {
    if (maybePromise && typeof (maybePromise as Promise<T>).then === "function") {
        return maybePromise as Promise<T>;
    }

    return new Promise<T>(fallback);
}

async function storageGet(area: ChromeStorageAreaLike, key: string): Promise<ChromeStorageItems> {
    return toPromise(
        area.get(key),
        (resolve, reject) => {
            try {
                area.get(key, (items) => resolve(items));
            } catch (error) {
                reject(error);
            }
        },
    );
}

async function storageSet(area: ChromeStorageAreaLike, items: ChromeStorageItems): Promise<void> {
    return toPromise(
        area.set(items),
        (resolve, reject) => {
            try {
                area.set(items, resolve);
            } catch (error) {
                reject(error);
            }
        },
    );
}

export class BrowserSettingsService implements SettingsService {
    async load(): Promise<AppSettings> {
        const storage = getChromeStorageArea();

        if (storage) {
            const items = await storageGet(storage, STORAGE_KEY);
            const stored = items[STORAGE_KEY] as Partial<AppSettings> | undefined;
            return normalizeSettings(stored ?? DEFAULT_SETTINGS);
        }

        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return DEFAULT_SETTINGS;
        }

        try {
            return normalizeSettings(JSON.parse(raw) as Partial<AppSettings>);
        } catch {
            return DEFAULT_SETTINGS;
        }
    }

    async save(next: AppSettings): Promise<AppSettings> {
        const normalized = normalizeSettings(next);
        const storage = getChromeStorageArea();

        if (storage) {
            await storageSet(storage, { [STORAGE_KEY]: normalized });
            return normalized;
        }

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
    }
}
