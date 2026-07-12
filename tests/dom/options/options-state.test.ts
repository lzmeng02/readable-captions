// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import type { ExtensionSettings } from "../../../src/settings/types";

const storageMocks = vi.hoisted(() => ({
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
    watchSettings: vi.fn(),
}));
vi.mock("../../../src/settings/storage", () => storageMocks);
import { ReadableCaptionsOptionsApp } from "../../../src/options/index";

type SettingsWatcher = (settings: ExtensionSettings) => void;

let watchedSettings: SettingsWatcher | undefined;
const stopWatching = vi.fn();

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function canonicalFixture(overrides: Record<string, unknown> = {}): ExtensionSettings {
    return {
        ...DEFAULT_SETTINGS,
        generationProvider: "deepseek",
        generationApiKey: "",
        generationModels: { overview: "", intensive: "" },
        generationProviderSettings: {
            openai: { apiKey: "", models: { overview: "", intensive: "" } },
            deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
        },
        ...overrides,
    } as unknown as ExtensionSettings;
}

async function settle(app: ReadableCaptionsOptionsApp): Promise<void> {
    for (let index = 0; index < 4; index += 1) {
        await Promise.resolve();
        await app.updateComplete;
    }
}

async function mountInitialOptions(): Promise<ReadableCaptionsOptionsApp> {
    const app = new ReadableCaptionsOptionsApp();
    document.body.append(app);
    await app.updateComplete;
    return app;
}

async function mountLoadedOptions(settings = canonicalFixture()): Promise<ReadableCaptionsOptionsApp> {
    storageMocks.getSettings.mockResolvedValueOnce(settings);
    const app = await mountInitialOptions();
    await settle(app);
    return app;
}

function findButton(app: ReadableCaptionsOptionsApp, text: string): HTMLButtonElement | undefined {
    return [...app.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ?? []]
        .find((button) => button.textContent?.includes(text));
}

async function changeDefaultTab(app: ReadableCaptionsOptionsApp, value: string): Promise<void> {
    const select = app.shadowRoot?.querySelector<HTMLSelectElement>('select[name="defaultTab"]');
    expect(select, "default tab control").toBeInstanceOf(HTMLSelectElement);
    select!.value = value;
    select!.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await settle(app);
}

function defaultTabValue(app: ReadableCaptionsOptionsApp): string {
    return app.shadowRoot?.querySelector<HTMLSelectElement>('select[name="defaultTab"]')?.value ?? "";
}

async function emitExternal(app: ReadableCaptionsOptionsApp, settings: ExtensionSettings): Promise<void> {
    expect.soft(watchedSettings, "watchSettings subscription").toBeTypeOf("function");
    watchedSettings?.(settings);
    await settle(app);
}

beforeEach(() => {
    document.body.replaceChildren();
    watchedSettings = undefined;
    stopWatching.mockReset();
    storageMocks.getSettings.mockReset();
    storageMocks.saveSettings.mockReset().mockImplementation(async (settings) => settings);
    storageMocks.watchSettings.mockReset().mockImplementation((listener: SettingsWatcher) => {
        watchedSettings = listener;
        return stopWatching;
    });
});

afterEach(() => {
    document.body.replaceChildren();
});

describe("Options settings lifecycle", () => {
    it("keeps the form unavailable while the initial read is pending", async () => {
        const pending = deferred<ExtensionSettings>();
        storageMocks.getSettings.mockReturnValueOnce(pending.promise);
        const app = await mountInitialOptions();
        const root = app.shadowRoot!;

        expect.soft(root.querySelector('[role="status"]')?.textContent ?? "").toContain("加载");
        expect.soft(root.querySelector("fieldset")?.hasAttribute("disabled")).toBe(true);
        expect.soft(root.querySelector<HTMLButtonElement>(".btn-primary")?.disabled).toBe(true);
        expect.soft(root.querySelector<HTMLButtonElement>(".btn-ghost")?.disabled).toBe(true);
        root.querySelector<HTMLButtonElement>(".btn-primary")?.click();
        await settle(app);
        expect(storageMocks.saveSettings).not.toHaveBeenCalled();
    });

    it("shows a load error and retries instead of exposing editable defaults", async () => {
        const retry = deferred<ExtensionSettings>();
        storageMocks.getSettings
            .mockRejectedValueOnce(new Error("storage unavailable"))
            .mockReturnValueOnce(retry.promise);
        const app = await mountInitialOptions();
        await settle(app);

        const alert = app.shadowRoot?.querySelector('[role="alert"]');
        expect.soft(alert).not.toBeNull();
        expect.soft(alert?.textContent?.trim() ?? "").not.toBe("");
        expect.soft(app.shadowRoot?.querySelector<HTMLButtonElement>(".btn-primary")?.disabled).toBe(true);
        const retryButton = findButton(app, "重试");
        expect(retryButton, "retry action").toBeDefined();
        retryButton!.click();
        expect(storageMocks.getSettings).toHaveBeenCalledTimes(2);

        retry.resolve(canonicalFixture({ defaultTab: "intensive" }));
        await settle(app);
        expect(defaultTabValue(app)).toBe("intensive");
    });

    it("locks the complete fieldset and guards programmatic edits while saving", async () => {
        const app = await mountLoadedOptions();
        await changeDefaultTab(app, "overview");
        const pending = deferred<ExtensionSettings>();
        storageMocks.saveSettings.mockReturnValueOnce(pending.promise);
        findButton(app, "保存设置")?.click();
        await settle(app);

        expect.soft(app.shadowRoot?.querySelector("fieldset")?.hasAttribute("disabled")).toBe(true);
        expect.soft(app.shadowRoot?.querySelector<HTMLButtonElement>(".btn-primary")?.disabled).toBe(true);
        expect.soft(app.shadowRoot?.querySelector<HTMLButtonElement>(".btn-ghost")?.disabled).toBe(true);

        const select = app.shadowRoot?.querySelector<HTMLSelectElement>('select[name="defaultTab"]');
        expect(select).toBeInstanceOf(HTMLSelectElement);
        select!.value = "intensive";
        select!.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        app.requestUpdate();
        await settle(app);
        expect.soft(defaultTabValue(app)).toBe("overview");

        findButton(app, "恢复默认")?.click();
        await settle(app);
        expect.soft(defaultTabValue(app)).toBe("overview");

        pending.resolve(canonicalFixture({ defaultTab: "overview" }));
        await settle(app);
    });

    it("applies an external update immediately while the form is clean", async () => {
        const app = await mountLoadedOptions();

        await emitExternal(app, canonicalFixture({ defaultTab: "intensive" }));

        expect(defaultTabValue(app)).toBe("intensive");
        expect(findButton(app, "载入外部设置")).toBeUndefined();
    });

    it("blocks save when an external update conflicts with dirty edits", async () => {
        const app = await mountLoadedOptions();
        await changeDefaultTab(app, "overview");

        await emitExternal(app, canonicalFixture({ defaultTab: "intensive" }));

        expect.soft(defaultTabValue(app)).toBe("overview");
        expect.soft(findButton(app, "载入外部设置"), "load-external conflict action").toBeDefined();
        expect.soft(findButton(app, "保留当前编辑"), "keep-local conflict action").toBeDefined();
        const save = app.shadowRoot?.querySelector<HTMLButtonElement>(".btn-primary");
        expect.soft(save?.disabled).toBe(true);
        save?.click();
        expect(storageMocks.saveSettings).not.toHaveBeenCalled();
    });

    it("can resolve a conflict by loading the external settings", async () => {
        const app = await mountLoadedOptions();
        await changeDefaultTab(app, "overview");
        await emitExternal(app, canonicalFixture({ defaultTab: "intensive" }));
        const loadExternal = findButton(app, "载入外部设置");
        expect(loadExternal, "load-external conflict action").toBeDefined();

        loadExternal!.click();
        await settle(app);

        expect(defaultTabValue(app)).toBe("intensive");
        expect(findButton(app, "载入外部设置")).toBeUndefined();
    });

    it("can acknowledge a conflict while keeping local edits", async () => {
        const app = await mountLoadedOptions();
        await changeDefaultTab(app, "overview");
        await emitExternal(app, canonicalFixture({ defaultTab: "intensive" }));
        const keepLocal = findButton(app, "保留当前编辑");
        expect(keepLocal, "keep-local conflict action").toBeDefined();

        keepLocal!.click();
        await settle(app);
        expect(defaultTabValue(app)).toBe("overview");
        expect(findButton(app, "保留当前编辑")).toBeUndefined();

        findButton(app, "保存设置")?.click();
        await settle(app);
        expect(storageMocks.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
            defaultTab: "overview",
        }));
    });

    it("treats an edit reverted to the baseline as clean", async () => {
        const app = await mountLoadedOptions();
        await changeDefaultTab(app, "overview");
        await changeDefaultTab(app, "original");

        await emitExternal(app, canonicalFixture({ defaultTab: "intensive" }));

        expect(defaultTabValue(app)).toBe("intensive");
        expect(findButton(app, "载入外部设置")).toBeUndefined();
    });

    it("treats its own save watcher event as an acknowledgement", async () => {
        const app = await mountLoadedOptions();
        await changeDefaultTab(app, "overview");
        const pending = deferred<ExtensionSettings>();
        storageMocks.saveSettings.mockReturnValueOnce(pending.promise);
        findButton(app, "保存设置")?.click();
        await settle(app);
        const snapshot = storageMocks.saveSettings.mock.calls[0]?.[0] as ExtensionSettings;
        expect(snapshot).toBeDefined();

        await emitExternal(app, snapshot);
        pending.resolve(snapshot);
        await settle(app);

        expect(findButton(app, "载入外部设置")).toBeUndefined();
        expect(app.shadowRoot?.querySelector<HTMLButtonElement>(".btn-primary")?.disabled).toBe(false);
    });

    it("preserves a newer external event after its own save acknowledgement", async () => {
        const app = await mountLoadedOptions();
        await changeDefaultTab(app, "overview");
        const pending = deferred<ExtensionSettings>();
        storageMocks.saveSettings.mockReturnValueOnce(pending.promise);
        findButton(app, "保存设置")?.click();
        await settle(app);
        const snapshot = storageMocks.saveSettings.mock.calls[0]?.[0] as ExtensionSettings;
        expect(snapshot).toBeDefined();

        await emitExternal(app, snapshot);
        await emitExternal(app, canonicalFixture({ defaultTab: "intensive" }));
        pending.resolve(snapshot);
        await settle(app);

        expect.soft(defaultTabValue(app)).toBe("overview");
        expect(findButton(app, "载入外部设置"), "newer external conflict").toBeDefined();
        expect(app.shadowRoot?.querySelector<HTMLButtonElement>(".btn-primary")?.disabled).toBe(true);
    });

    it("unsubscribes from settings updates when disconnected", async () => {
        const app = await mountLoadedOptions();
        expect.soft(storageMocks.watchSettings).toHaveBeenCalledOnce();

        app.remove();

        expect(stopWatching).toHaveBeenCalledOnce();
    });
});
