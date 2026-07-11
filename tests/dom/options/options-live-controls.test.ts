// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";

const storageMocks = vi.hoisted(() => ({
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
}));
vi.mock("../../../src/settings/storage", () => storageMocks);
import { ReadableCaptionsOptionsApp } from "../../../src/options/index";

async function mountOptions(): Promise<ReadableCaptionsOptionsApp> {
    const app = new ReadableCaptionsOptionsApp();
    document.body.append(app);
    await app.updateComplete;
    await Promise.resolve();
    await app.updateComplete;
    return app;
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
        .find((candidate) => candidate.textContent?.includes(text));
    if (!element) throw new Error(`Missing control: ${text}`);
    element.click();
}

beforeEach(() => {
    document.body.replaceChildren();
    storageMocks.getSettings.mockReset().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        defaultTab: "intensive",
        generationEnabled: false,
        copyFormat: "timestamped_text",
        downloadFormat: "srt",
    });
    storageMocks.saveSettings.mockReset().mockImplementation(async (settings) => settings);
});
afterEach(() => document.body.replaceChildren());

describe("Options live controls", () => {
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
        }));
    });
});
