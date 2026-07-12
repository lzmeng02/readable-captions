import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../../../src/settings/defaults";
import {
    DEFAULT_PUBLIC_SETTINGS,
    isPublicSettingsPortMessage,
    toPublicSettings,
} from "../../../src/settings/public";

it("never exposes private generation settings to content", () => {
    const value = toPublicSettings({
        ...DEFAULT_SETTINGS,
        generationProviderSettings: {
            ...DEFAULT_SETTINGS.generationProviderSettings,
            deepseek: {
                ...DEFAULT_SETTINGS.generationProviderSettings.deepseek,
                apiKey: "ds-test-key",
            },
        },
    });
    expect(value).not.toHaveProperty("generationApiKey");
    expect(value).not.toHaveProperty("generationProvider");
    expect(value).not.toHaveProperty("generationModels");
    expect(value).not.toHaveProperty("generationPromptTemplates");
});

it("derives public defaults from canonical defaults", () => {
    expect(DEFAULT_PUBLIC_SETTINGS).toEqual(toPublicSettings(DEFAULT_SETTINGS));
});

it("never exposes provider profiles or credentials", () => {
    expect(toPublicSettings(DEFAULT_SETTINGS)).not.toHaveProperty("generationProviderSettings");
});

it("rejects invalid public enum values", () => {
    expect(isPublicSettingsPortMessage({
        type: "settings",
        settings: {
            ...DEFAULT_PUBLIC_SETTINGS,
            defaultTab: "generated",
            copyFormat: "html",
            downloadFormat: "pdf",
        },
    })).toBe(false);
});

it("keeps cache identity secret-independent and scoped to the selected profile", () => {
    const emptyProfiles = {
        openai: { apiKey: "", models: { overview: "", intensive: "" } },
        deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
    };
    const base = mergeSettings({
        ...DEFAULT_SETTINGS,
        generationProvider: "deepseek",
        generationProviderSettings: emptyProfiles,
    });
    const baseProfiles = (base as any).generationProviderSettings ?? emptyProfiles;
    const withKey = mergeSettings({
        ...base,
        generationProviderSettings: {
            ...baseProfiles,
            deepseek: { ...baseProfiles.deepseek, apiKey: "ds-test-key" },
        },
    });
    const withInactiveModel = mergeSettings({
        ...base,
        generationProviderSettings: {
            ...baseProfiles,
            openai: {
                ...baseProfiles.openai,
                models: { ...baseProfiles.openai.models, overview: "gpt-test" },
            },
        },
    });
    const withSelectedModel = mergeSettings({
        ...base,
        generationProviderSettings: {
            ...baseProfiles,
            deepseek: {
                ...baseProfiles.deepseek,
                models: { ...baseProfiles.deepseek.models, overview: "deepseek-test" },
            },
        },
    });

    expect(toPublicSettings(withKey).generationSettingsKey)
        .toBe(toPublicSettings(base).generationSettingsKey);
    expect(toPublicSettings(withInactiveModel).generationSettingsKey)
        .toBe(toPublicSettings(base).generationSettingsKey);
    expect(toPublicSettings(withSelectedModel).generationSettingsKey)
        .not.toBe(toPublicSettings(base).generationSettingsKey);
});
