import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../../../src/settings/defaults";

describe("provider settings normalization", () => {
    it("creates an isolated empty profile for every provider", () => {
        expect(DEFAULT_SETTINGS).toMatchObject({
            generationProvider: "deepseek",
            generationProviderSettings: {
                openai: { apiKey: "", models: { overview: "", intensive: "" } },
                deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
            },
        });
    });

    it("migrates current globals only into the selected provider and trims them", () => {
        const value = mergeSettings({
            generationProvider: "deepseek",
            generationApiKey: "  ds-test-key  ",
            generationModels: { overview: "  ds-overview  ", intensive: "  ds-intensive  " },
            generationAccessMode: "webapp",
        });

        expect(value).toMatchObject({
            generationProvider: "deepseek",
            generationProviderSettings: {
                openai: { apiKey: "", models: { overview: "", intensive: "" } },
                deepseek: {
                    apiKey: "ds-test-key",
                    models: { overview: "ds-overview", intensive: "ds-intensive" },
                },
            },
        });
        expect(value).not.toHaveProperty("generationApiKey");
        expect(value).not.toHaveProperty("generationModels");
        expect(value).not.toHaveProperty("generationAccessMode");
    });

    it("migrates summary fields only into the valid legacy provider", () => {
        expect(mergeSettings({
            generationProvider: "invalid",
            summaryProvider: "openai",
            summaryApiKey: "  oa-test-key  ",
            summaryModel: "  gpt-test  ",
            summaryAccessMode: "webapp",
        })).toMatchObject({
            generationProvider: "openai",
            generationProviderSettings: {
                openai: {
                    apiKey: "oa-test-key",
                    models: { overview: "gpt-test", intensive: "gpt-test" },
                },
                deepseek: { apiKey: "", models: { overview: "", intensive: "" } },
            },
        });
    });

    it("does not resurrect obsolete credentials when the new schema is present", () => {
        const value = mergeSettings({
            generationProvider: "openai",
            generationProviderSettings: {
                openai: { apiKey: "", models: { overview: "", intensive: "" } },
            },
            generationApiKey: "obsolete-test-key",
            summaryApiKey: "older-test-key",
        });
        expect((value as any).generationProviderSettings?.openai?.apiKey).toBe("");
    });

    it("preserves prompt content while normalizing keys and models", () => {
        const value = mergeSettings({
            generationProvider: "openai",
            generationProviderSettings: {
                openai: { apiKey: "  oa-test-key  ", models: { overview: "  gpt-test  " } },
            },
            generationPromptTemplates: { overview: "  keep prompt spacing  ", intensive: "" },
        });
        expect((value as any).generationProviderSettings?.openai).toEqual({
            apiKey: "oa-test-key",
            models: { overview: "gpt-test", intensive: "" },
        });
        expect(value.generationPromptTemplates.overview).toBe("  keep prompt spacing  ");
    });
});
