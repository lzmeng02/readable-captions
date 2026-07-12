import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PUBLIC_SETTINGS, PUBLIC_SETTINGS_PORT } from "../../../src/settings/public";
import { watchPublicSettings } from "../../../src/settings/public-client";
import { createFakeRuntimePort } from "../../helpers/runtime-port";

afterEach(() => vi.unstubAllGlobals());

describe("watchPublicSettings", () => {
    it("reports a missing runtime port instead of publishing defaults", async () => {
        vi.stubGlobal("chrome", { runtime: {} });
        const onSettings = vi.fn();
        const onError = vi.fn();

        watchPublicSettings(onSettings, onError);
        await Promise.resolve();

        expect(onSettings).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("reports a background settings read failure", () => {
        const fake = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        vi.stubGlobal("chrome", { runtime: { connect: vi.fn(() => fake.port) } });
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const onSettings = vi.fn();
        const onError = vi.fn();

        try {
            watchPublicSettings(onSettings, onError);
            fake.emitMessage({ type: "error", message: "settings unavailable" });

            expect(onSettings).not.toHaveBeenCalled();
            expect(onError).toHaveBeenCalledWith(expect.objectContaining({
                message: "settings unavailable",
            }));
        } finally {
            consoleError.mockRestore();
        }
    });

    it("publishes valid settings messages", () => {
        const fake = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        vi.stubGlobal("chrome", { runtime: { connect: vi.fn(() => fake.port) } });
        const onSettings = vi.fn();
        const onError = vi.fn();

        watchPublicSettings(onSettings, onError);
        const settings = { ...DEFAULT_PUBLIC_SETTINGS, defaultTab: "intensive" as const };
        fake.emitMessage({ type: "settings", settings });

        expect(onSettings).toHaveBeenCalledOnce();
        expect(onSettings).toHaveBeenCalledWith(settings);
        expect(onError).not.toHaveBeenCalled();
    });

    it("reports a disconnect before the first settings value", () => {
        const fake = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        vi.stubGlobal("chrome", { runtime: { connect: vi.fn(() => fake.port) } });
        const onSettings = vi.fn();
        const onError = vi.fn();

        watchPublicSettings(onSettings, onError);
        fake.emitDisconnect();

        expect(onSettings).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
});
