import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../../../src/settings/defaults";
import type { ExtensionSettings } from "../../../src/settings/types";
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

it("ignores private storage revision metadata in the public projection and cache identity", () => {
    const withStorageMetadata = {
        ...DEFAULT_SETTINGS,
        storageVersion: 1,
        revision: "public-trap-revision-001",
    } as ExtensionSettings & { storageVersion: number; revision: string };

    const projected = toPublicSettings(withStorageMetadata);

    expect(projected).toEqual(toPublicSettings(DEFAULT_SETTINGS));
    expect(projected).not.toHaveProperty("revision");
    expect(projected).not.toHaveProperty("storageVersion");
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

it("uses a wider cache digest for colliding effective prompt settings without including API keys", () => {
    const first = mergeSettings({
        ...DEFAULT_SETTINGS,
        generationProvider: "deepseek",
        generationPromptTemplates: {
            ...DEFAULT_SETTINGS.generationPromptTemplates,
            overview: "dqf47-abkoyw-rnk",
        },
    });
    const second = mergeSettings({
        ...first,
        generationPromptTemplates: {
            ...first.generationPromptTemplates,
            overview: "1x7h58b-n902eu-25mf",
        },
    });
    const withApiKeyOnlyChange = mergeSettings({
        ...first,
        generationProviderSettings: {
            ...first.generationProviderSettings,
            deepseek: {
                ...first.generationProviderSettings.deepseek,
                apiKey: "ds-test-key",
            },
        },
    });

    const firstKey = toPublicSettings(first).generationSettingsKey;
    const secondKey = toPublicSettings(second).generationSettingsKey;
    const keyOnlyChange = toPublicSettings(withApiKeyOnlyChange).generationSettingsKey;

    expect(firstKey).not.toBe(secondKey);
    expect(keyOnlyChange).toBe(firstKey);
    expect(firstKey).toMatch(/^[0-9a-z]{13}$/);
    expect(firstKey).not.toContain("ds-test-key");
});
