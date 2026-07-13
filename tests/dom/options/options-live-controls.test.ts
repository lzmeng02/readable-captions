// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import type { ExtensionSettings } from "../../../src/settings/types";

const storageMocks = vi.hoisted(() => ({
    createSettingsWriteRevision: vi.fn(),
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
    watchSettings: vi.fn(),
}));
vi.mock("../../../src/settings/storage", () => storageMocks);
import { ReadableCaptionsOptionsApp } from "../../../src/options/index";

type SettingsWatcher = (
    settings: ExtensionSettings,
    metadata: { revision: string | null },
) => void;

let watchedSettings: SettingsWatcher | undefined;

async function settle(app: ReadableCaptionsOptionsApp): Promise<void> {
    for (let index = 0; index < 4; index += 1) {
        await Promise.resolve();
        await app.updateComplete;
    }
}

async function mountOptions(): Promise<ReadableCaptionsOptionsApp> {
    const app = new ReadableCaptionsOptionsApp();
    document.body.append(app);
    await settle(app);
    return app;
}

function apiKeyInput(app: ReadableCaptionsOptionsApp): HTMLInputElement {
    const input = app.shadowRoot!.querySelector<HTMLInputElement>(
        'input[data-setting="generationApiKey"], input[name="generationApiKey"]',
    );
    expect(input, "provider API key input").toBeInstanceOf(HTMLInputElement);
    return input!;
}

function modelInput(
    app: ReadableCaptionsOptionsApp,
    task: "overview" | "intensive",
): HTMLInputElement {
    const input = app.shadowRoot!.querySelector<HTMLInputElement>(`input[data-task="${task}"]`);
    expect(input, `${task} model input`).toBeInstanceOf(HTMLInputElement);
    return input!;
}

function change(control: HTMLInputElement | HTMLSelectElement, value: string | boolean): void {
    if (control instanceof HTMLInputElement) {
        control.checked = Boolean(value);
    } else {
        for (const option of control.options) {
            option.selected = option.value === String(value);
        }
    }
    control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function clickByText(root: ShadowRoot, text: string): void {
    const element = [...root.querySelectorAll<HTMLElement>("button, .nav-item")]
        .find((candidate) => candidate.textContent?.includes(text) || candidate.title.includes(text));
    if (!element) throw new Error(`Missing control: ${text}`);
    element.click();
}

beforeEach(() => {
    document.body.replaceChildren();
    watchedSettings = undefined;
    storageMocks.createSettingsWriteRevision.mockReset().mockReturnValue("live-controls-write-revision-001");
    storageMocks.getSettings.mockReset().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        defaultTab: "intensive",
        generationEnabled: false,
        copyFormat: "timestamped_text",
        downloadFormat: "srt",
    });
    storageMocks.saveSettings.mockReset().mockImplementation(async (settings) => settings);
    storageMocks.watchSettings.mockReset().mockImplementation((listener: SettingsWatcher) => {
        watchedSettings = listener;
        return vi.fn();
    });
});
afterEach(() => document.body.replaceChildren());

describe("Options live controls", () => {
    it("masks the selected API key after reset", async () => {
        storageMocks.getSettings.mockResolvedValueOnce({
            ...DEFAULT_SETTINGS,
            generationProviderSettings: {
                ...DEFAULT_SETTINGS.generationProviderSettings,
                deepseek: {
                    apiKey: "ds-test-key",
                    models: { overview: "deepseek-test", intensive: "deepseek-test" },
                },
            },
        });
        const app = await mountOptions();
        const root = app.shadowRoot!;
        clickByText(root, "AI 生成");
        await settle(app);
        clickByText(root, "显示");
        await settle(app);
        expect(apiKeyInput(app).classList).not.toContain("masked");

        clickByText(root, "恢复默认");
        await settle(app);

        expect(apiKeyInput(app).classList).toContain("masked");
    });

    it("masks the selected API key after loading external settings", async () => {
        storageMocks.getSettings.mockResolvedValueOnce({
            ...DEFAULT_SETTINGS,
            generationProviderSettings: {
                ...DEFAULT_SETTINGS.generationProviderSettings,
                deepseek: {
                    apiKey: "ds-test-key",
                    models: { overview: "deepseek-test", intensive: "deepseek-test" },
                },
            },
        });
        const app = await mountOptions();
        const root = app.shadowRoot!;
        clickByText(root, "AI 生成");
        await settle(app);
        clickByText(root, "显示");
        await settle(app);
        expect(apiKeyInput(app).classList).not.toContain("masked");

        const input = apiKeyInput(app);
        input.value = "local-test-key";
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        await settle(app);
        expect(watchedSettings, "watchSettings subscription").toBeTypeOf("function");
        watchedSettings!({
            ...DEFAULT_SETTINGS,
            generationProviderSettings: {
                ...DEFAULT_SETTINGS.generationProviderSettings,
                deepseek: {
                    apiKey: "external-test-key",
                    models: { overview: "external-test", intensive: "external-test" },
                },
            },
        }, { revision: "external-test-revision" });
        await settle(app);

        clickByText(root, "载入外部设置");
        await settle(app);

        expect.soft(apiKeyInput(app).value).toBe("external-test-key");
        expect(apiKeyInput(app).classList).toContain("masked");
    });

    it("restores provider values after an unrelated rerender without input events", async () => {
        storageMocks.getSettings.mockResolvedValueOnce({
            ...DEFAULT_SETTINGS,
            generationProvider: "deepseek",
            generationProviderSettings: {
                ...DEFAULT_SETTINGS.generationProviderSettings,
                deepseek: {
                    apiKey: "ds-live-test-key",
                    models: {
                        overview: "deepseek-live-overview",
                        intensive: "deepseek-live-intensive",
                    },
                },
            },
        });
        const app = await mountOptions();
        const root = app.shadowRoot!;
        clickByText(root, "AI");
        await settle(app);
        const apiKey = apiKeyInput(app);
        const overviewModel = modelInput(app, "overview");
        const intensiveModel = modelInput(app, "intensive");

        apiKey.value = "browser-filled-fake-key";
        overviewModel.value = "browser-filled-overview";
        intensiveModel.value = "browser-filled-intensive";

        const prompt = root.querySelector<HTMLTextAreaElement>("textarea.form-control");
        expect(prompt, "unrelated prompt control").toBeInstanceOf(HTMLTextAreaElement);
        prompt!.value = "unrelated prompt rerender";
        prompt!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        await settle(app);

        expect.soft(apiKeyInput(app)).toBe(apiKey);
        expect.soft(modelInput(app, "overview")).toBe(overviewModel);
        expect.soft(modelInput(app, "intensive")).toBe(intensiveModel);
        expect.soft(apiKey.value).toBe("ds-live-test-key");
        expect.soft(overviewModel.value).toBe("deepseek-live-overview");
        expect(intensiveModel.value).toBe("deepseek-live-intensive");
    });

    it("reset updates the default-tab select and generation checkbox", async () => {
        const app = await mountOptions();
        const root = app.shadowRoot!;
        const tab = root.querySelector<HTMLSelectElement>('select[name="defaultTab"]')!;
        const enabled = root.querySelector<HTMLInputElement>('input[name="generationEnabled"]')!;
        expect(tab.value).toBe("intensive");
        expect(enabled.checked).toBe(false);
        change(tab, "overview");
        change(enabled, true);
        change(enabled, false);
        await app.updateComplete;
        clickByText(root, "恢复默认");
        await app.updateComplete;
        expect.soft(tab.value).toBe("original");
        expect.soft(enabled.checked).toBe(true);
    });

    it("reset updates both export format selects", async () => {
        const app = await mountOptions();
        const root = app.shadowRoot!;
        clickByText(root, "导出偏好");
        await app.updateComplete;
        const copy = root.querySelector<HTMLSelectElement>('select[name="copyFormat"]')!;
        const download = root.querySelector<HTMLSelectElement>('select[name="downloadFormat"]')!;
        expect(copy.value).toBe("timestamped_text");
        expect(download.value).toBe("srt");
        change(copy, "readable_text");
        change(copy, "timestamped_text");
        change(download, "txt");
        change(download, "srt");
        await app.updateComplete;
        clickByText(root, "恢复默认");
        await app.updateComplete;
        expect.soft(copy.value).toBe("readable_text");
        expect.soft(download.value).toBe("txt");
    });

    it("save receives the values displayed after reset", async () => {
        const app = await mountOptions();
        const root = app.shadowRoot!;
        const tab = root.querySelector<HTMLSelectElement>('select[name="defaultTab"]')!;
        change(tab, "overview");
        await app.updateComplete;
        clickByText(root, "恢复默认");
        await app.updateComplete;
        expect(tab.value).toBe("original");
        expect(storageMocks.saveSettings).not.toHaveBeenCalled();
        clickByText(root, "保存设置");
        await app.updateComplete;
        expect(storageMocks.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
            defaultTab: "original",
            generationEnabled: true,
            copyFormat: "readable_text",
            downloadFormat: "txt",
        }), "live-controls-write-revision-001");
    });
});
