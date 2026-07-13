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

function canonicalFixture(): ExtensionSettings {
    return {
        ...DEFAULT_SETTINGS,
        generationProvider: "deepseek",
        generationProviderSettings: {
            openai: { apiKey: "", models: { overview: "", intensive: "" } },
            deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
        },
    };
}

async function settle(app: ReadableCaptionsOptionsApp): Promise<void> {
    for (let index = 0; index < 4; index += 1) {
        await Promise.resolve();
        await app.updateComplete;
    }
}

async function mountLoadedOptions(settings = canonicalFixture()): Promise<ReadableCaptionsOptionsApp> {
    storageMocks.getSettings.mockResolvedValueOnce(settings);
    const app = new ReadableCaptionsOptionsApp();
    document.body.append(app);
    await settle(app);
    return app;
}

async function openGenerationTab(app: ReadableCaptionsOptionsApp): Promise<void> {
    const tab = [...app.shadowRoot?.querySelectorAll<HTMLElement>(".nav-item") ?? []]
        .find((candidate) => candidate.textContent?.includes("AI 生成"));
    expect(tab, "generation navigation tab").toBeDefined();
    tab!.click();
    await settle(app);
}

function apiKeyInput(app: ReadableCaptionsOptionsApp): HTMLInputElement {
    const input = app.shadowRoot!.querySelector<HTMLInputElement>(
        'input[data-setting="generationApiKey"], input[name="generationApiKey"]',
    );
    expect(input, "provider API key input").toBeInstanceOf(HTMLInputElement);
    return input!;
}

function providerButton(
    app: ReadableCaptionsOptionsApp,
    provider: "openai" | "deepseek",
): HTMLButtonElement | undefined {
    const stable = app.shadowRoot?.querySelector<HTMLButtonElement>(`button[data-provider="${provider}"]`);
    if (stable) return stable;
    const label = provider === "openai" ? "OpenAI" : "DeepSeek";
    return [...app.shadowRoot?.querySelectorAll<HTMLButtonElement>("button.provider-badge") ?? []]
        .find((button) => button.textContent?.includes(label));
}

async function selectProvider(
    app: ReadableCaptionsOptionsApp,
    provider: "openai" | "deepseek",
): Promise<void> {
    const button = providerButton(app, provider);
    expect(button, `${provider} provider control`).toBeDefined();
    button!.click();
    await settle(app);
}

function modelInput(
    app: ReadableCaptionsOptionsApp,
    task: "overview" | "intensive",
): HTMLInputElement | undefined {
    const stable = app.shadowRoot?.querySelector<HTMLInputElement>(`input[data-task="${task}"]`);
    if (stable) return stable;
    const legacyModels = [...app.shadowRoot?.querySelectorAll<HTMLInputElement>(
        'input.form-control[type="text"]:not([name])',
    ) ?? []];
    return legacyModels[task === "overview" ? 0 : 1];
}

function inputControl(app: ReadableCaptionsOptionsApp, selector: string): HTMLInputElement | undefined {
    if (selector === 'input[data-setting="generationApiKey"]') return apiKeyInput(app);
    if (selector === 'input[data-task="overview"]') return modelInput(app, "overview");
    if (selector === 'input[data-task="intensive"]') return modelInput(app, "intensive");
    return app.shadowRoot?.querySelector<HTMLInputElement>(selector) ?? undefined;
}

async function inputValue(
    app: ReadableCaptionsOptionsApp,
    selector: string,
    value: string,
): Promise<void> {
    const input = inputControl(app, selector);
    expect(input, `input ${selector}`).toBeInstanceOf(HTMLInputElement);
    input!.value = value;
    input!.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await settle(app);
}

function valueOf(app: ReadableCaptionsOptionsApp, selector: string): string {
    return inputControl(app, selector)?.value ?? "";
}

function findButton(app: ReadableCaptionsOptionsApp, text: string): HTMLButtonElement | undefined {
    return [...app.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ?? []]
        .find((button) => button.textContent?.includes(text) || button.title.includes(text));
}

beforeEach(() => {
    document.body.replaceChildren();
    storageMocks.createSettingsWriteRevision.mockReset().mockReturnValue("profiles-write-revision-001");
    storageMocks.getSettings.mockReset();
    storageMocks.saveSettings.mockReset().mockImplementation(async (settings) => settings);
    storageMocks.watchSettings.mockReset().mockReturnValue(vi.fn());
});

afterEach(() => {
    document.body.replaceChildren();
});

describe("Options provider profiles", () => {
    it("replaces provider-specific controls and never exposes a password field", async () => {
        const app = await mountLoadedOptions({
            ...canonicalFixture(),
            generationProviderSettings: {
                openai: { apiKey: "", models: { overview: "", intensive: "" } },
                deepseek: {
                    apiKey: "ds-test-key",
                    models: { overview: "ds-overview", intensive: "ds-intensive" },
                },
            },
        });
        await openGenerationTab(app);

        const deepseekInput = apiKeyInput(app);
        expect.soft(deepseekInput.dataset.setting).toBe("generationApiKey");
        expect.soft(deepseekInput.type).toBe("text");
        expect.soft(deepseekInput.name).toBe("generationApiKey-deepseek");
        expect.soft(deepseekInput.autocomplete).toBe("off");
        expect.soft(deepseekInput.classList).toContain("masked");

        await selectProvider(app, "openai");
        const openaiInput = apiKeyInput(app);
        expect.soft(openaiInput.dataset.setting).toBe("generationApiKey");
        expect.soft(openaiInput).not.toBe(deepseekInput);
        expect.soft(openaiInput.name).toBe("generationApiKey-openai");
        expect.soft(openaiInput.value).toBe("");
        expect(app.shadowRoot!.querySelector(".form-label-row")!.textContent).toContain("未配置");
    });

    it("hides a configured key again after changing providers", async () => {
        const app = await mountLoadedOptions({
            ...canonicalFixture(),
            generationProviderSettings: {
                openai: {
                    apiKey: "oa-test-key",
                    models: { overview: "gpt-test", intensive: "gpt-test" },
                },
                deepseek: {
                    apiKey: "ds-test-key",
                    models: { overview: "deepseek-test", intensive: "deepseek-test" },
                },
            },
        });
        await openGenerationTab(app);
        findButton(app, "显示")!.click();
        await settle(app);
        expect(apiKeyInput(app).classList).not.toContain("masked");

        await selectProvider(app, "openai");
        expect(apiKeyInput(app).classList).toContain("masked");
    });

    it("isolates API keys and models across repeated provider switches", async () => {
        const app = await mountLoadedOptions();
        await openGenerationTab(app);
        await selectProvider(app, "deepseek");
        await inputValue(app, 'input[data-setting="generationApiKey"]', "ds-test-key");
        await inputValue(app, 'input[data-task="overview"]', "deepseek-overview");
        await inputValue(app, 'input[data-task="intensive"]', "deepseek-intensive");

        await selectProvider(app, "openai");
        expect.soft(valueOf(app, 'input[data-setting="generationApiKey"]')).toBe("");
        expect.soft(valueOf(app, 'input[data-task="overview"]')).toBe("");
        expect.soft(valueOf(app, 'input[data-task="intensive"]')).toBe("");
        await inputValue(app, 'input[data-setting="generationApiKey"]', "oa-test-key");
        await inputValue(app, 'input[data-task="overview"]', "gpt-overview");
        await inputValue(app, 'input[data-task="intensive"]', "gpt-intensive");

        await selectProvider(app, "deepseek");
        expect.soft(valueOf(app, 'input[data-setting="generationApiKey"]')).toBe("ds-test-key");
        expect.soft(valueOf(app, 'input[data-task="overview"]')).toBe("deepseek-overview");
        expect.soft(valueOf(app, 'input[data-task="intensive"]')).toBe("deepseek-intensive");

        await selectProvider(app, "openai");
        expect.soft(valueOf(app, 'input[data-setting="generationApiKey"]')).toBe("oa-test-key");
        expect.soft(valueOf(app, 'input[data-task="overview"]')).toBe("gpt-overview");
        expect.soft(valueOf(app, 'input[data-task="intensive"]')).toBe("gpt-intensive");

        findButton(app, "保存设置")?.click();
        await settle(app);
        const saved = storageMocks.saveSettings.mock.calls[0]?.[0];
        expect.soft(saved).toBeDefined();
        expect.soft((saved as any)?.generationProviderSettings).toEqual({
            openai: {
                apiKey: "oa-test-key",
                models: { overview: "gpt-overview", intensive: "gpt-intensive" },
            },
            deepseek: {
                apiKey: "ds-test-key",
                models: { overview: "deepseek-overview", intensive: "deepseek-intensive" },
            },
        });
        expect.soft(saved).not.toHaveProperty("generationApiKey");
        expect.soft(saved).not.toHaveProperty("generationModels");
        expect(saved).not.toHaveProperty("generationAccessMode");
    });

    it("treats a whitespace-only selected key as unconfigured", async () => {
        const app = await mountLoadedOptions();
        await openGenerationTab(app);

        await inputValue(app, 'input[data-setting="generationApiKey"]', "   ");

        const status = app.shadowRoot?.querySelector(".form-label-row")?.textContent ?? "";
        expect(status).toContain("未配置");
        expect(status).not.toContain("已配置");
    });

    it("reset and save include every canonical provider profile", async () => {
        const app = await mountLoadedOptions();
        const reset = findButton(app, "恢复默认");
        expect(reset).toBeDefined();
        reset!.click();
        await settle(app);

        findButton(app, "保存设置")?.click();
        await settle(app);
        const saved = storageMocks.saveSettings.mock.calls[0]?.[0];

        expect.soft(saved).toMatchObject({
            generationProvider: "deepseek",
            generationProviderSettings: {
                openai: { apiKey: "", models: { overview: "", intensive: "" } },
                deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
            },
        });
        expect.soft(saved).not.toHaveProperty("generationApiKey");
        expect.soft(saved).not.toHaveProperty("generationModels");
        expect(saved).not.toHaveProperty("generationAccessMode");
    });
});
