import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import {
    createSettingsWriteRevision,
    getSettings,
    saveSettings,
    watchSettings,
} from "../../../src/settings/storage";

type StorageChange = { oldValue?: unknown; newValue?: unknown };
type StorageListener = (changes: Record<string, StorageChange>, areaName: string) => void;

afterEach(() => vi.unstubAllGlobals());

describe("settings storage", () => {
    it("creates a caller-known revision for every write", () => {
        const randomUUID = vi.fn()
            .mockReturnValueOnce("generated-revision-001")
            .mockReturnValueOnce("generated-revision-002");
        vi.stubGlobal("crypto", { randomUUID });

        expect([createSettingsWriteRevision(), createSettingsWriteRevision()]).toEqual([
            "generated-revision-001",
            "generated-revision-002",
        ]);
        expect(randomUUID).toHaveBeenCalledTimes(2);
    });

    it("returns canonical defaults when storage is missing", async () => {
        vi.stubGlobal("chrome", { runtime: {} });

        await expect(getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    });

    it("returns canonical defaults when the settings key is missing", async () => {
        const get = vi.fn((_key: string | string[], callback: (items: Record<string, unknown>) => void) => {
            callback({ unrelated: true });
        });
        vi.stubGlobal("chrome", {
            runtime: {},
            storage: {
                local: { get, set: vi.fn() },
                onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
            },
        });

        await expect(getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
        expect(get).toHaveBeenCalledWith("extensionSettings", expect.any(Function));
    });

    it("reads the private storage envelope without exposing its revision", async () => {
        const get = vi.fn((_key: string | string[], callback: (items: Record<string, unknown>) => void) => {
            callback({
                extensionSettings: {
                    storageVersion: 1,
                    revision: "read-revision-001",
                    settings: { defaultTab: "overview" },
                },
            });
        });
        vi.stubGlobal("chrome", {
            runtime: {},
            storage: {
                local: { get, set: vi.fn() },
                onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
            },
        });

        const settings = await getSettings();

        expect(settings.defaultTab).toBe("overview");
        expect(settings).not.toHaveProperty("revision");
        expect(settings).not.toHaveProperty("storageVersion");
        expect(settings).not.toHaveProperty("settings");
    });

    it("continues to read legacy raw settings objects", async () => {
        const get = vi.fn((_key: string | string[], callback: (items: Record<string, unknown>) => void) => {
            callback({
                extensionSettings: {
                    generationProvider: "openai",
                    generationApiKey: " legacy-test-key ",
                    generationModels: { overview: " legacy-model ", intensive: "" },
                },
            });
        });
        vi.stubGlobal("chrome", {
            runtime: {},
            storage: {
                local: { get, set: vi.fn() },
                onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
            },
        });

        await expect(getSettings()).resolves.toMatchObject({
            generationProvider: "openai",
            generationProviderSettings: {
                openai: {
                    apiKey: "legacy-test-key",
                    models: { overview: "legacy-model", intensive: "" },
                },
            },
        });
    });

    it("rejects runtime storage errors", async () => {
        const get = vi.fn((_key: string | string[], callback: (items: Record<string, unknown>) => void) => {
            callback({});
        });
        vi.stubGlobal("chrome", {
            runtime: { lastError: { message: "storage read failed" } },
            storage: {
                local: { get, set: vi.fn() },
                onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
            },
        });

        await expect(getSettings()).rejects.toThrow("storage read failed");
    });

    it("save writes only canonical provider profiles", async () => {
        const set = vi.fn((items: Record<string, unknown>, callback: () => void) => callback());
        vi.stubGlobal("chrome", {
            runtime: {},
            storage: {
                local: { get: vi.fn(), set },
                onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
            },
        });

        const saved = await saveSettings({
            ...DEFAULT_SETTINGS,
            generationProvider: "openai",
            generationApiKey: " legacy-trap ",
            generationModels: { overview: "legacy-model", intensive: "legacy-model" },
            generationProviderSettings: {
                openai: { apiKey: " oa-test-key ", models: { overview: " gpt-test ", intensive: "" } },
                deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
            },
        } as any, "write-revision-001");

        expect(saved).not.toHaveProperty("generationApiKey");
        expect(saved).not.toHaveProperty("generationModels");
        expect(saved).toMatchObject({
            generationProviderSettings: {
                openai: { apiKey: "oa-test-key", models: { overview: "gpt-test", intensive: "" } },
                deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
            },
        });
        expect(set).toHaveBeenCalledWith({
            extensionSettings: {
                storageVersion: 1,
                revision: "write-revision-001",
                settings: saved,
            },
        }, expect.any(Function));
    });

    it("gives same-value saves distinct stored provenance", async () => {
        const set = vi.fn((_items: Record<string, unknown>, callback: () => void) => callback());
        vi.stubGlobal("chrome", {
            runtime: {},
            storage: {
                local: { get: vi.fn(), set },
                onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
            },
        });

        await saveSettings(DEFAULT_SETTINGS, "same-value-revision-001");
        await saveSettings(DEFAULT_SETTINGS, "same-value-revision-002");

        expect(set.mock.calls.map(([items]) =>
            (items.extensionSettings as { revision?: string }).revision)).toEqual([
            "same-value-revision-001",
            "same-value-revision-002",
        ]);
        expect(set.mock.calls[0]?.[0]).not.toEqual(set.mock.calls[1]?.[0]);
    });

    it("filters watcher events by local area and settings key", () => {
        let watcher: StorageListener | undefined;
        const listener = vi.fn();
        vi.stubGlobal("chrome", {
            runtime: {},
            storage: {
                local: { get: vi.fn(), set: vi.fn() },
                onChanged: {
                    addListener: vi.fn((candidate: StorageListener) => { watcher = candidate; }),
                    removeListener: vi.fn(),
                },
            },
        });

        watchSettings(listener);
        expect(watcher).toBeTypeOf("function");
        watcher?.({ extensionSettings: { newValue: { defaultTab: "overview" } } }, "sync");
        watcher?.({ unrelated: { newValue: true } }, "local");

        expect(listener).not.toHaveBeenCalled();
    });

    it("normalizes relevant watcher values before publishing them", () => {
        let watcher: StorageListener | undefined;
        const listener = vi.fn();
        vi.stubGlobal("chrome", {
            runtime: {},
            storage: {
                local: { get: vi.fn(), set: vi.fn() },
                onChanged: {
                    addListener: vi.fn((candidate: StorageListener) => { watcher = candidate; }),
                    removeListener: vi.fn(),
                },
            },
        });

        watchSettings(listener);
        expect(watcher).toBeTypeOf("function");
        watcher?.({
            extensionSettings: {
                newValue: {
                    generationProvider: "openai",
                    generationApiKey: "  oa-test-key  ",
                    generationModels: { overview: "  gpt-test  ", intensive: "" },
                    generationAccessMode: "webapp",
                },
            },
        }, "local");

        expect(listener).toHaveBeenCalledOnce();
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            generationProvider: "openai",
            generationProviderSettings: {
                openai: { apiKey: "oa-test-key", models: { overview: "gpt-test", intensive: "" } },
                deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
            },
        }), { revision: null });
        expect(listener.mock.calls[0]?.[0]).not.toHaveProperty("generationAccessMode");
    });

    it("unwraps watcher envelopes and surfaces only private provenance metadata separately", () => {
        let watcher: StorageListener | undefined;
        const listener = vi.fn();
        vi.stubGlobal("chrome", {
            runtime: {},
            storage: {
                local: { get: vi.fn(), set: vi.fn() },
                onChanged: {
                    addListener: vi.fn((candidate: StorageListener) => { watcher = candidate; }),
                    removeListener: vi.fn(),
                },
            },
        });

        watchSettings(listener);
        watcher?.({
            extensionSettings: {
                newValue: {
                    storageVersion: 1,
                    revision: "watch-revision-001",
                    settings: { defaultTab: "intensive" },
                },
            },
        }, "local");

        expect(listener).toHaveBeenCalledOnce();
        const [settings, metadata] = listener.mock.calls[0] ?? [];
        expect(settings).toMatchObject({ defaultTab: "intensive" });
        expect(settings).not.toHaveProperty("revision");
        expect(settings).not.toHaveProperty("storageVersion");
        expect(metadata).toEqual({ revision: "watch-revision-001" });
    });

    it("removes the same watcher when disposed", () => {
        let watcher: StorageListener | undefined;
        const removeListener = vi.fn();
        vi.stubGlobal("chrome", {
            runtime: {},
            storage: {
                local: { get: vi.fn(), set: vi.fn() },
                onChanged: {
                    addListener: vi.fn((candidate: StorageListener) => { watcher = candidate; }),
                    removeListener,
                },
            },
        });

        const dispose = watchSettings(vi.fn());
        dispose();

        expect(watcher).toBeTypeOf("function");
        expect(removeListener).toHaveBeenCalledOnce();
        expect(removeListener).toHaveBeenCalledWith(watcher);
    });
});
