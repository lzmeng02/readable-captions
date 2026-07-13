import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PUBLIC_SETTINGS, PUBLIC_SETTINGS_PORT } from "../../../src/settings/public";
import { watchPublicSettings } from "../../../src/settings/public-client";
import { createFakeRuntimePort } from "../../helpers/runtime-port";

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("watchPublicSettings", () => {
    it("reports a missing runtime port instead of publishing defaults", async () => {
        vi.stubGlobal("chrome", { runtime: {} });
        const onSettings = vi.fn();
        const onError = vi.fn();

        const stop = watchPublicSettings(onSettings, onError);
        await Promise.resolve();

        expect(onSettings).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
        stop();
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

        const stop = watchPublicSettings(onSettings, onError);
        fake.emitDisconnect();

        expect(onSettings).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
        stop();
    });

    it("fails closed, reconnects, and recovers after a post-ready disconnect", async () => {
        vi.useFakeTimers();
        const first = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        const second = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        const connect = vi.fn()
            .mockReturnValueOnce(first.port)
            .mockReturnValueOnce(second.port);
        vi.stubGlobal("chrome", { runtime: { connect } });
        const onSettings = vi.fn();
        const onError = vi.fn();

        const stop = watchPublicSettings(onSettings, onError);
        first.emitMessage({ type: "settings", settings: DEFAULT_PUBLIC_SETTINGS });
        first.emitDisconnect();

        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining("reconnect"),
        }));
        await vi.runOnlyPendingTimersAsync();
        expect(connect).toHaveBeenCalledTimes(2);

        const stale = { ...DEFAULT_PUBLIC_SETTINGS, defaultTab: "intensive" as const };
        first.emitMessage({ type: "settings", settings: stale });
        expect(onSettings).toHaveBeenCalledOnce();

        const recovered = { ...DEFAULT_PUBLIC_SETTINGS, generationEnabled: false };
        second.emitMessage({ type: "settings", settings: recovered });
        expect(onSettings).toHaveBeenLastCalledWith(recovered);
        stop();
    });

    it("cancels a scheduled reconnect when unsubscribed", async () => {
        vi.useFakeTimers();
        const first = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        const connect = vi.fn(() => first.port);
        vi.stubGlobal("chrome", { runtime: { connect } });

        const stop = watchPublicSettings(vi.fn(), vi.fn());
        first.emitDisconnect();
        stop();
        await vi.runOnlyPendingTimersAsync();

        expect(connect).toHaveBeenCalledOnce();
    });

    it("disconnects the active port and ignores its callbacks when unsubscribed", () => {
        const fake = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        const disconnect = vi.spyOn(fake.port, "disconnect");
        vi.stubGlobal("chrome", { runtime: { connect: vi.fn(() => fake.port) } });
        const onSettings = vi.fn();
        const onError = vi.fn();

        const stop = watchPublicSettings(onSettings, onError);
        stop();
        stop();
        fake.emitMessage({ type: "settings", settings: DEFAULT_PUBLIC_SETTINGS });

        expect(disconnect).toHaveBeenCalledOnce();
        expect(onSettings).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });

    it("reports one error per outage across missing and throwing reconnect attempts", async () => {
        vi.useFakeTimers();
        const first = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        const recoveredPort = createFakeRuntimePort(PUBLIC_SETTINGS_PORT);
        const connect = vi.fn()
            .mockReturnValueOnce(first.port)
            .mockReturnValueOnce(undefined)
            .mockImplementationOnce(() => {
                throw new Error("Extension context invalidated");
            })
            .mockReturnValueOnce(recoveredPort.port);
        vi.stubGlobal("chrome", { runtime: { connect } });
        const onSettings = vi.fn();
        const onError = vi.fn();

        const stop = watchPublicSettings(onSettings, onError);
        first.emitMessage({ type: "settings", settings: DEFAULT_PUBLIC_SETTINGS });
        first.emitDisconnect();
        expect(onError).toHaveBeenCalledOnce();

        await vi.advanceTimersByTimeAsync(100);
        expect(connect).toHaveBeenCalledTimes(2);
        expect(onError).toHaveBeenCalledOnce();

        await vi.advanceTimersByTimeAsync(200);
        expect(connect).toHaveBeenCalledTimes(3);
        expect(onError).toHaveBeenCalledOnce();

        await vi.advanceTimersByTimeAsync(400);
        expect(connect).toHaveBeenCalledTimes(4);
        const recovered = { ...DEFAULT_PUBLIC_SETTINGS, generationEnabled: false };
        recoveredPort.emitMessage({ type: "settings", settings: recovered });
        expect(onSettings).toHaveBeenLastCalledWith(recovered);
        expect(onError).toHaveBeenCalledOnce();

        recoveredPort.emitDisconnect();
        expect(onError).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(99);
        expect(connect).toHaveBeenCalledTimes(4);
        await vi.advanceTimersByTimeAsync(1);
        expect(connect).toHaveBeenCalledTimes(5);
        expect(onError).toHaveBeenCalledTimes(2);
        stop();
    });

    it("uses bounded exponential backoff and never publishes defaults while unavailable", async () => {
        vi.useFakeTimers();
        const connect = vi.fn(() => undefined);
        vi.stubGlobal("chrome", { runtime: { connect } });
        const onSettings = vi.fn();
        const onError = vi.fn();

        const stop = watchPublicSettings(onSettings, onError);
        await Promise.resolve();
        expect(connect).toHaveBeenCalledOnce();

        const delays = [100, 200, 400, 800, 1600, 3200, 5000, 5000];
        for (const [index, delay] of delays.entries()) {
            await vi.advanceTimersByTimeAsync(delay - 1);
            expect(connect).toHaveBeenCalledTimes(index + 1);
            await vi.advanceTimersByTimeAsync(1);
            expect(connect).toHaveBeenCalledTimes(index + 2);
        }

        expect(onSettings).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledOnce();
        stop();
    });
});
