import { DEFAULT_SETTINGS, mergeSettings } from "./defaults";
import type { ExtensionSettings } from "./types";

type ExtensionRuntime = {
    lastError?: {
        message?: string;
    };
};

type StorageItems = Record<string, unknown>;
type StorageChange = {
    oldValue?: unknown;
    newValue?: unknown;
};

type ExtensionStorageArea = {
    get(keys: string | string[], callback: (items: StorageItems) => void): void;
    set(items: StorageItems, callback: () => void): void;
};

type ExtensionStorageOnChanged = {
    addListener(listener: (changes: Record<string, StorageChange>, areaName: string) => void): void;
    removeListener(listener: (changes: Record<string, StorageChange>, areaName: string) => void): void;
};

type ExtensionChrome = {
    runtime?: ExtensionRuntime;
    storage?: {
        local?: ExtensionStorageArea;
        onChanged?: ExtensionStorageOnChanged;
    };
};

const SETTINGS_STORAGE_KEY = "extensionSettings";

function getExtensionChrome(): ExtensionChrome | null {
    return (globalThis as typeof globalThis & { chrome?: ExtensionChrome }).chrome ?? null;
}

function getStorageArea(): ExtensionStorageArea | null {
    return getExtensionChrome()?.storage?.local ?? null;
}

function getLastErrorMessage(extensionChrome: ExtensionChrome | null): string | null {
    return extensionChrome?.runtime?.lastError?.message ?? null;
}

export async function getSettings(): Promise<ExtensionSettings> {
    const extensionChrome = getExtensionChrome();
    const storage = getStorageArea();
    if (!storage) {
        return DEFAULT_SETTINGS;
    }

    return new Promise((resolve, reject) => {
        storage.get(SETTINGS_STORAGE_KEY, (items) => {
            const errorMessage = getLastErrorMessage(extensionChrome);
            if (errorMessage) {
                reject(new Error(errorMessage));
                return;
            }

            resolve(mergeSettings(items[SETTINGS_STORAGE_KEY]));
        });
    });
}

export async function saveSettings(settings: ExtensionSettings): Promise<ExtensionSettings> {
    const extensionChrome = getExtensionChrome();
    const storage = getStorageArea();
    if (!storage) {
        throw new Error("Extension storage is unavailable.");
    }

    const nextSettings = mergeSettings(settings);

    return new Promise((resolve, reject) => {
        storage.set({ [SETTINGS_STORAGE_KEY]: nextSettings }, () => {
            const errorMessage = getLastErrorMessage(extensionChrome);
            if (errorMessage) {
                reject(new Error(errorMessage));
                return;
            }

            resolve(nextSettings);
        });
    });
}

export function watchSettings(listener: (settings: ExtensionSettings) => void): () => void {
    const storageChanges = getExtensionChrome()?.storage?.onChanged;
    if (!storageChanges) {
        return () => { };
    }

    const handleChange = (changes: Record<string, StorageChange>, areaName: string): void => {
        if (areaName !== "local") {
            return;
        }

        const settingsChange = changes[SETTINGS_STORAGE_KEY];
        if (!settingsChange) {
            return;
        }

        listener(mergeSettings(settingsChange.newValue));
    };

    storageChanges.addListener(handleChange);

    return () => {
        storageChanges.removeListener(handleChange);
    };
}
