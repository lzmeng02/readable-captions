import { describe, expect, it } from "vitest";
import { normalizeBilibiliTranscript } from "../../../../src/platforms/bilibili/normalize";

describe("normalizeBilibiliTranscript", () => {
    it("returns null when a line is not an object", () => {
        expect(normalizeBilibiliTranscript([{ from: 0, to: 1, content: "ok" }, null])).toBeNull();
    });

    it("returns null when a line has an invalid field type", () => {
        expect(normalizeBilibiliTranscript([{ from: "0", to: 1, content: "bad" }])).toBeNull();
    });

    it("normalizes a valid transcript", () => {
        expect(normalizeBilibiliTranscript([{ from: 0, to: 1.5, content: "ok" }])).toEqual([
            { from: 0, to: 1.5, content: "ok" },
        ]);
    });
});
