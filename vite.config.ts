import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => ({
  build: {
    lib: {
      entry: resolve(__dirname, "src/content.ts"),
      formats: ["iife"],
      name: "ReadableCaptionsContent",
      fileName: () => "content.js"
    },
    outDir: "dist",
    emptyOutDir: mode !== "development",
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
}));
