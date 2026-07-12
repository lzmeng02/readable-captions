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
    setAccessLevel?(
        accessOptions: { accessLevel: "TRUSTED_CONTEXTS" | "TRUSTED_AND_UNTRUSTED_CONTEXTS" },
        callback?: () => void,
    ): void | Promise<void>;
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
const SETTINGS_STORAGE_VERSION = 1;

export type SettingsWriteRevision = string;
export type SettingsWatchMetadata = Readonly<{ revision: SettingsWriteRevision | null }>;

type StoredSettingsEnvelope = {
    storageVersion: typeof SETTINGS_STORAGE_VERSION;
    revision: SettingsWriteRevision;
    settings: ExtensionSettings;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function decodeStoredSettings(value: unknown): {
    settings: ExtensionSettings;
    metadata: SettingsWatchMetadata;
} {
    if (isRecord(value)
        && value.storageVersion === SETTINGS_STORAGE_VERSION
        && Object.hasOwn(value, "settings")) {
        return {
            settings: mergeSettings(value.settings),
            metadata: {
                revision: typeof value.revision === "string" && value.revision.length > 0
                    ? value.revision
                    : null,
            },
        };
    }

    return {
        settings: mergeSettings(value),
        metadata: { revision: null },
    };
}

function getExtensionChrome(): ExtensionChrome | null {
    return (globalThis as typeof globalThis & { chrome?: ExtensionChrome }).chrome ?? null;
}

function getStorageArea(): ExtensionStorageArea | null {
    return getExtensionChrome()?.storage?.local ?? null;
}

function getLastErrorMessage(extensionChrome: ExtensionChrome | null): string | null {
    return extensionChrome?.runtime?.lastError?.message ?? null;
}

export function createSettingsWriteRevision(): SettingsWriteRevision {
    return globalThis.crypto.randomUUID();
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

            resolve(decodeStoredSettings(items[SETTINGS_STORAGE_KEY]).settings);
        });
    });
}

export async function saveSettings(
    settings: ExtensionSettings,
    revision: SettingsWriteRevision,
): Promise<ExtensionSettings> {
    const extensionChrome = getExtensionChrome();
    const storage = getStorageArea();
    if (!storage) {
        throw new Error("Extension storage is unavailable.");
    }

    const nextSettings = mergeSettings(settings);
    const storedSettings: StoredSettingsEnvelope = {
        storageVersion: SETTINGS_STORAGE_VERSION,
        revision,
        settings: nextSettings,
    };

    return new Promise((resolve, reject) => {
        storage.set({ [SETTINGS_STORAGE_KEY]: storedSettings }, () => {
            const errorMessage = getLastErrorMessage(extensionChrome);
            if (errorMessage) {
                reject(new Error(errorMessage));
                return;
            }

            resolve(nextSettings);
        });
    });
}

export async function restrictStorageAccessToTrustedContexts(): Promise<void> {
    const extensionChrome = getExtensionChrome();
    const storage = getStorageArea();
    const setAccessLevel = storage?.setAccessLevel;
    if (!setAccessLevel) {
        return;
    }

    return new Promise((resolve, reject) => {
        const complete = (): void => {
            const errorMessage = getLastErrorMessage(extensionChrome);
            if (errorMessage) {
                reject(new Error(errorMessage));
                return;
            }

            resolve();
        };

        const result = setAccessLevel.call(storage, { accessLevel: "TRUSTED_CONTEXTS" }, complete);
        if (result instanceof Promise) {
            result.then(complete, reject);
        }
    });
}

export function watchSettings(
    listener: (settings: ExtensionSettings, metadata: SettingsWatchMetadata) => void,
): () => void {
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

        const { settings, metadata } = decodeStoredSettings(settingsChange.newValue);
        listener(settings, metadata);
    };

    storageChanges.addListener(handleChange);

    return () => {
        storageChanges.removeListener(handleChange);
    };
}
