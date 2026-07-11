import { describe, expect, it } from "vitest";
import { extractVideoTitle } from "../../../src/panel/title-utils";

describe("extractVideoTitle", () => {
    it.each([
        ["GPT-5 教程_哔哩哔哩_bilibili", "GPT-5 教程"],
        ["A-B-C - 哔哩哔哩", "A-B-C"],
        ["already clean", "already clean"],
        ["_哔哩哔哩_bilibili", "bilibili_video"],
        ["   ", "bilibili_video"],
    ])("extracts %s", (input, expected) => expect(extractVideoTitle(input)).toBe(expected));
});
