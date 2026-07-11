import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import packageJson from "../../package.json";

const created: string[] = [];
afterEach(async () => Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe("development content build", () => {
    it("keeps sibling extension artifacts", async () => {
        const outDir = await mkdtemp(join(tmpdir(), "readable-captions-dev-"));
        created.push(outDir);
        await writeFile(join(outDir, "manifest.json"), "sentinel", "utf8");
        await build({
            root: resolve("."),
            configFile: resolve("vite.config.ts"),
            mode: "development",
            logLevel: "silent",
            build: { outDir },
        });
        expect(existsSync(join(outDir, "manifest.json"))).toBe(true);
        expect(existsSync(join(outDir, "content.js"))).toBe(true);
    });

    it("cleans stale artifacts in production mode", async () => {
        const outDir = await mkdtemp(join(tmpdir(), "readable-captions-prod-"));
        created.push(outDir);
        await writeFile(join(outDir, "sentinel.txt"), "stale", "utf8");
        await build({
            root: resolve("."),
            configFile: resolve("vite.config.ts"),
            mode: "production",
            logLevel: "silent",
            build: { outDir },
        });
        expect(existsSync(join(outDir, "sentinel.txt"))).toBe(false);
        expect(existsSync(join(outDir, "content.js"))).toBe(true);
    });

    it("starts with a complete build before content watch", () => {
        expect(packageJson.scripts.dev).toBe("npm run build && vite build --watch --mode development");
    });
});
