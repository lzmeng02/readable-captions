import { describe, expect, it, vi } from "vitest";
import { createRenderScheduler } from "../../../src/panel/render-scheduler";

function createFakeFrames() {
    let nextId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    return {
        request(callback: FrameRequestCallback): number {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
        },
        cancel(id: number): void { callbacks.delete(id); },
        runAll(): void {
            const pending = [...callbacks.values()];
            callbacks.clear();
            for (const callback of pending) callback(0);
        },
    };
}

describe("createRenderScheduler", () => {
    it("coalesces schedules into one frame", () => {
        const renderNow = vi.fn();
        const frames = createFakeFrames();
        const scheduler = createRenderScheduler(renderNow, frames.request, frames.cancel);
        scheduler.schedule();
        scheduler.schedule();
        expect(renderNow).not.toHaveBeenCalled();
        frames.runAll();
        expect(renderNow).toHaveBeenCalledTimes(1);
    });

    it("flush replaces a pending frame with one immediate render", () => {
        const renderNow = vi.fn();
        const frames = createFakeFrames();
        const scheduler = createRenderScheduler(renderNow, frames.request, frames.cancel);
        scheduler.schedule();
        scheduler.flush();
        frames.runAll();
        expect(renderNow).toHaveBeenCalledTimes(1);
    });

    it("cancel prevents a pending render", () => {
        const renderNow = vi.fn();
        const frames = createFakeFrames();
        const scheduler = createRenderScheduler(renderNow, frames.request, frames.cancel);
        scheduler.schedule();
        scheduler.cancel();
        frames.runAll();
        expect(renderNow).not.toHaveBeenCalled();
    });

    it("uses the browser frame functions by default", () => {
        const renderNow = vi.fn();
        const requestFrame = vi.fn((_callback: FrameRequestCallback) => 42);
        const cancelFrame = vi.fn();
        vi.stubGlobal("requestAnimationFrame", requestFrame);
        vi.stubGlobal("cancelAnimationFrame", cancelFrame);

        const scheduler = createRenderScheduler(renderNow);
        scheduler.schedule();
        scheduler.cancel();

        expect(requestFrame).toHaveBeenCalledTimes(1);
        expect(cancelFrame).toHaveBeenCalledWith(42);
        expect(renderNow).not.toHaveBeenCalled();
    });
});
