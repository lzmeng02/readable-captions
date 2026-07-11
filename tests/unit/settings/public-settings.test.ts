import { expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { toPublicSettings } from "../../../src/settings/public";

it("never exposes private generation settings to content", () => {
    const value = toPublicSettings({ ...DEFAULT_SETTINGS, generationApiKey: "secret" });
    expect(value).not.toHaveProperty("generationApiKey");
    expect(value).not.toHaveProperty("generationProvider");
    expect(value).not.toHaveProperty("generationModels");
    expect(value).not.toHaveProperty("generationPromptTemplates");
});
