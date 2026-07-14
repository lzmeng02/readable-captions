// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyMarkdownText, downloadMarkdownText } from "../../../src/panel/export-utils";

describe("Panel export resource cleanup", () => {
    const execCommand = vi.fn();

    beforeEach(() => {
        document.body.replaceChildren();
        Object.defineProperty(document, "execCommand", {
            configurable: true,
            value: execCommand,
        });
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: undefined,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        execCommand.mockReset();
        Reflect.deleteProperty(document, "execCommand");
        Reflect.deleteProperty(navigator, "clipboard");
        document.body.replaceChildren();
    });

    it("removes the fallback textarea when execCommand throws", async () => {
        execCommand.mockImplementationOnce(() => {
            throw new Error("copy failed");
        });

        await expect(copyMarkdownText("content")).rejects.toThrow("copy failed");

        expect(document.querySelector("textarea")).toBeNull();
    });

    it("removes the temporary anchor and revokes its URL after click throws", () => {
        vi.useFakeTimers();
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
        const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
            throw new Error("download blocked");
        });

        expect(() => downloadMarkdownText("# note", "title")).toThrow("download blocked");
        expect(document.querySelector("a[download]")).toBeNull();
        expect(revoke).not.toHaveBeenCalled();

        vi.runAllTimers();
        expect(revoke).toHaveBeenCalledWith("blob:test");
    });
});
