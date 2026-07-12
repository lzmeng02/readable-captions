import { describe, expect, it, vi } from "vitest";
import {
    registerBackground,
    type BackgroundDependencies,
    type ExtensionChrome,
} from "../../../src/background-app";
import { GENERATION_STREAM_PORT } from "../../../src/generation/protocol";
import type { KeepAliveRunner, RuntimePort } from "../../../src/generation/background-stream";
import { PUBLIC_SETTINGS_PORT, toPublicSettings } from "../../../src/settings/public";
import type { ExtensionSettings } from "../../../src/settings/types";
import { createSettings, generationRequest } from "../../helpers/generation";
import { createFakeRuntimePort } from "../../helpers/runtime-port";

async function flushPromises(): Promise<void> {
    for (let index = 0; index < 12; index += 1) {
        await Promise.resolve();
    }
}

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createFakeChrome() {
    let connectListener: ((port: RuntimePort) => void) | undefined;
    const chrome: ExtensionChrome = {
        runtime: {
            onConnect: {
                addListener(listener) {
                    connectListener = listener;
                },
            },
        },
    };

    return {
        chrome,
        connect(port: RuntimePort): void {
            if (!connectListener) {
                throw new Error("Background did not register an onConnect listener.");
            }
            connectListener(port);
        },
    };
}

function createHarness(overrides: Partial<BackgroundDependencies> = {}) {
    const settings = createSettings();
    let settingsListener: ((nextSettings: ExtensionSettings) => void) | undefined;
    const getSettingsImplementation: BackgroundDependencies["getSettings"] = async () => settings;
    const restrictImplementation: BackgroundDependencies["restrictStorageAccessToTrustedContexts"] = async () => { };
    const watchImplementation: BackgroundDependencies["watchSettings"] = (listener) => {
        settingsListener = listener;
        return () => { };
    };
    const streamImplementation: BackgroundDependencies["streamGenerationFromApi"] = async () => "complete";
    const getSettings = vi.fn(getSettingsImplementation);
    const restrictStorageAccessToTrustedContexts = vi.fn(restrictImplementation);
    const watchSettings = vi.fn(watchImplementation);
    const streamGenerationFromApi = vi.fn(streamImplementation);
    const keepAliveSignals: AbortSignal[] = [];
    const keepAlive: KeepAliveRunner = (work, signal) => {
        keepAliveSignals.push(signal);
        return work();
    };
    const chrome = createFakeChrome();
    const dependencies: BackgroundDependencies = {
        chrome: chrome.chrome,
        getSettings,
        restrictStorageAccessToTrustedContexts,
        watchSettings,
        streamGenerationFromApi,
        keepAlive,
        ...overrides,
    };

    return {
        chrome,
        dependencies,
        getSettings,
        restrictStorageAccessToTrustedContexts,
        watchSettings,
        streamGenerationFromApi,
        keepAliveSignals,
        emitSettings(nextSettings: ExtensionSettings): void {
            if (!settingsListener) {
                throw new Error("Background did not start watching settings.");
            }
            settingsListener(nextSettings);
        },
    };
}

describe("registerBackground", () => {
    it("restricts storage and broadcasts only public settings to connected settings ports", async () => {
        const harness = createHarness();
        const first = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        const second = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        const initialSettings = await harness.dependencies.getSettings();

        registerBackground(harness.dependencies);
        harness.chrome.connect(first.port);
        harness.chrome.connect(second.port);
        await flushPromises();

        expect(harness.restrictStorageAccessToTrustedContexts).toHaveBeenCalledOnce();
        expect(harness.watchSettings).toHaveBeenCalledOnce();
        expect(first.postedMessages).toEqual([
            { type: "settings", settings: toPublicSettings(initialSettings) },
        ]);
        expect(second.postedMessages).toEqual(first.postedMessages);
        expect(first.postedMessages[0]).not.toHaveProperty("settings.generationApiKey");
        expect(harness.keepAliveSignals).toEqual([]);

        const updatedSettings = createSettings({
            generationEnabled: false,
            generationProviderSettings: {
                deepseek: { apiKey: "ds-test-key" },
            },
        });
        harness.emitSettings(updatedSettings);

        expect(first.postedMessages.at(-1)).toEqual({
            type: "settings",
            settings: toPublicSettings(updatedSettings),
        });
        expect(second.postedMessages.at(-1)).toEqual(first.postedMessages.at(-1));

        first.emitDisconnect();
        harness.emitSettings(createSettings({ defaultTab: "generated" }));

        expect(first.postedMessages).toHaveLength(2);
        expect(second.postedMessages).toHaveLength(3);
        expect(harness.keepAliveSignals).toEqual([]);
    });

    it("reports a settings read failure to only the connecting settings port", async () => {
        const getSettings: BackgroundDependencies["getSettings"] = async () => {
            throw new Error("storage denied");
        };
        const harness = createHarness({ getSettings });
        const settingsPort = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);

        registerBackground(harness.dependencies);
        harness.chrome.connect(settingsPort.port);
        await flushPromises();

        expect(settingsPort.postedMessages).toEqual([
            { type: "error", message: "storage denied" },
        ]);
        expect(harness.keepAliveSignals).toEqual([]);
    });

    it("does not overwrite a newer settings broadcast with a delayed initial read", async () => {
        const initialRead = deferred<ExtensionSettings>();
        const harness = createHarness({ getSettings: () => initialRead.promise });
        const settingsPort = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        const newerSettings = createSettings({ defaultTab: "intensive" });

        registerBackground(harness.dependencies);
        harness.chrome.connect(settingsPort.port);
        harness.emitSettings(newerSettings);
        initialRead.resolve(createSettings({ defaultTab: "original" }));
        await flushPromises();

        expect(settingsPort.postedMessages).toEqual([
            { type: "settings", settings: toPublicSettings(newerSettings) },
        ]);
    });

    it("does not overwrite a newer settings broadcast with a delayed initial read error", async () => {
        const initialRead = deferred<ExtensionSettings>();
        const harness = createHarness({ getSettings: () => initialRead.promise });
        const settingsPort = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        const newerSettings = createSettings({ defaultTab: "intensive" });

        registerBackground(harness.dependencies);
        harness.chrome.connect(settingsPort.port);
        harness.emitSettings(newerSettings);
        initialRead.reject(new Error("stale storage failure"));
        await flushPromises();

        expect(settingsPort.postedMessages).toEqual([
            { type: "settings", settings: toPublicSettings(newerSettings) },
        ]);
    });

    it("does not post a delayed initial result after the settings port disconnects", async () => {
        const initialRead = deferred<ExtensionSettings>();
        const harness = createHarness({ getSettings: () => initialRead.promise });
        const settingsPort = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);

        registerBackground(harness.dependencies);
        harness.chrome.connect(settingsPort.port);
        settingsPort.emitDisconnect();
        initialRead.resolve(createSettings());
        await flushPromises();

        expect(settingsPort.postedMessages).toEqual([]);
    });

    it("ignores unknown port names and wires only the generation port", async () => {
        const harness = createHarness();
        const unknown = createFakeRuntimePort("unknown-port");
        const generation = createFakeRuntimePort(GENERATION_STREAM_PORT);

        registerBackground(harness.dependencies);
        harness.chrome.connect(unknown.port);
        unknown.emitMessage({ type: "start", request: generationRequest });
        await flushPromises();

        expect(unknown.postedMessages).toEqual([]);
        expect(harness.streamGenerationFromApi).not.toHaveBeenCalled();
        expect(harness.keepAliveSignals).toEqual([]);

        harness.chrome.connect(generation.port);
        generation.emitMessage({ type: "unexpected" });
        generation.emitMessage({ type: "start", request: generationRequest });
        await flushPromises();

        expect(generation.postedMessages).toEqual([
            { type: "error", code: "invalid-request" },
            { type: "done", text: "complete" },
        ]);
        expect(harness.streamGenerationFromApi).toHaveBeenCalledOnce();
        expect(harness.keepAliveSignals).toHaveLength(1);
    });

    it("warns when trusted-context storage restriction fails", async () => {
        const restrictionError = new Error("access level unavailable");
        const restrictStorageAccessToTrustedContexts: BackgroundDependencies["restrictStorageAccessToTrustedContexts"] =
            async () => {
                throw restrictionError;
            };
        const warn = vi.spyOn(console, "warn").mockImplementation(() => { });
        const harness = createHarness({ restrictStorageAccessToTrustedContexts });

        registerBackground(harness.dependencies);
        await flushPromises();

        expect(warn).toHaveBeenCalledWith(
            "Failed to restrict extension storage access",
            restrictionError,
        );
    });
});
