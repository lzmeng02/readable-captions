// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountPanel } from "../../../src/panel/mount";
import type { PanelHandle } from "../../../src/panel/types";
import { DEFAULT_PUBLIC_SETTINGS } from "../../../src/settings/public";
import type { PublicExtensionSettings } from "../../../src/settings/types";

type SettingsCallbacks = {
    onSettings(settings: PublicExtensionSettings): void;
    onError?: (error: Error) => void;
};

const mocks = vi.hoisted(() => ({
    settingsCallbacks: [] as SettingsCallbacks[],
    stopSettings: vi.fn(),
    streamGeneration: vi.fn(() => new AbortController()),
    copyTranscript: vi.fn(async () => undefined),
    copyMarkdownText: vi.fn(async () => undefined),
    copyMarkdownNote: vi.fn(async () => undefined),
    downloadTranscript: vi.fn(),
    downloadMarkdownText: vi.fn(),
    downloadMarkdownNote: vi.fn(),
}));

vi.mock("../../../src/settings/public-client", () => ({
    watchPublicSettings(
        onSettings: SettingsCallbacks["onSettings"],
        onError?: SettingsCallbacks["onError"],
    ) {
        mocks.settingsCallbacks.push({ onSettings, onError });
        return mocks.stopSettings;
    },
}));

vi.mock("../../../src/generation/llm-provider", () => ({
    streamGeneration: mocks.streamGeneration,
}));

vi.mock("../../../src/panel/export-utils", () => ({
    copyTranscript: mocks.copyTranscript,
    copyMarkdownText: mocks.copyMarkdownText,
    copyMarkdownNote: mocks.copyMarkdownNote,
    downloadTranscript: mocks.downloadTranscript,
    downloadMarkdownText: mocks.downloadMarkdownText,
    downloadMarkdownNote: mocks.downloadMarkdownNote,
}));

const handles: PanelHandle[] = [];

function mountReadyPanel(): HTMLElement {
    const host = document.createElement("section");
    document.body.append(host);
    handles.push(mountPanel(host, {
        transcript: [{ from: 0, to: 1, content: "ready transcript" }],
        source: "human_view",
        status: "ready",
    }));
    return host;
}

function action(host: HTMLElement, title: string): HTMLButtonElement | undefined {
    return host.shadowRoot?.querySelector<HTMLButtonElement>(`button[title="${title}"]`) ?? undefined;
}

function tab(host: HTMLElement, label: string): HTMLButtonElement | undefined {
    return [...host.shadowRoot?.querySelectorAll<HTMLButtonElement>("button.tab") ?? []]
        .find((button) => button.textContent?.trim() === label);
}

function activeTab(host: HTMLElement): string {
    return host.shadowRoot?.querySelector("button.tab.active")?.textContent?.trim() ?? "";
}

function noteAction(host: HTMLElement): HTMLButtonElement | undefined {
    const more = action(host, "更多");
    expect(more, "more-actions control").toBeDefined();
    more!.click();
    return [...host.shadowRoot?.querySelectorAll<HTMLButtonElement>("button.overflow-item") ?? []]
        .find((button) => button.textContent?.includes("导出 Markdown Note"));
}

async function flushPromises(): Promise<void> {
    for (let index = 0; index < 4; index += 1) {
        await Promise.resolve();
    }
}

function expectNoSettingsDependentWork(): void {
    expect.soft(mocks.streamGeneration).not.toHaveBeenCalled();
    expect.soft(mocks.copyTranscript).not.toHaveBeenCalled();
    expect.soft(mocks.copyMarkdownText).not.toHaveBeenCalled();
    expect.soft(mocks.copyMarkdownNote).not.toHaveBeenCalled();
    expect.soft(mocks.downloadTranscript).not.toHaveBeenCalled();
    expect.soft(mocks.downloadMarkdownText).not.toHaveBeenCalled();
    expect(mocks.downloadMarkdownNote).not.toHaveBeenCalled();
}

beforeEach(() => {
    document.body.replaceChildren();
    mocks.settingsCallbacks.length = 0;
    vi.clearAllMocks();
});

afterEach(() => {
    for (const handle of handles.splice(0)) {
        handle.dispose();
    }
    document.body.replaceChildren();
});

describe("Panel settings readiness", () => {
    it("blocks generated, copy, download, and Note actions until settings arrive", async () => {
        const host = mountReadyPanel();
        expect(mocks.settingsCallbacks).toHaveLength(1);
        const copy = action(host, "复制当前内容");
        const download = action(host, "下载当前内容");
        const overview = tab(host, "总览");

        expect.soft(host.shadowRoot?.querySelector('[role="status"]')).not.toBeNull();
        expect.soft(copy?.disabled).toBe(true);
        expect.soft(download?.disabled).toBe(true);
        expect.soft(overview?.disabled).toBe(true);
        copy?.click();
        download?.click();
        overview?.click();
        const note = noteAction(host);
        expect(note, "Note action").toBeDefined();
        expect.soft(note?.disabled).toBe(true);
        note?.click();
        await flushPromises();

        expectNoSettingsDependentWork();
    });

    it("applies the configured default tab only after real settings arrive", () => {
        const host = mountReadyPanel();
        expect(activeTab(host)).toBe("原文");

        mocks.settingsCallbacks[0]?.onSettings({
            ...DEFAULT_PUBLIC_SETTINGS,
            defaultTab: "intensive",
            generationEnabled: false,
        });

        expect(activeTab(host)).toBe("精读");
        expect(mocks.streamGeneration).not.toHaveBeenCalled();
    });

    it("shows a settings error and keeps actions closed", async () => {
        const host = mountReadyPanel();
        mocks.settingsCallbacks[0]?.onError?.(new Error("settings unavailable"));
        await flushPromises();

        const alert = host.shadowRoot?.querySelector('[role="alert"]');
        expect.soft(alert).not.toBeNull();
        expect.soft(alert?.textContent?.trim() ?? "").not.toBe("");
        const copy = action(host, "复制当前内容");
        const download = action(host, "下载当前内容");
        const overview = tab(host, "总览");
        expect.soft(copy?.disabled).toBe(true);
        expect.soft(download?.disabled).toBe(true);
        expect.soft(overview?.disabled).toBe(true);
        copy?.click();
        download?.click();
        overview?.click();
        const note = noteAction(host);
        expect(note, "Note action").toBeDefined();
        expect.soft(note?.disabled).toBe(true);
        note?.click();
        await flushPromises();

        expectNoSettingsDependentWork();
    });
});
