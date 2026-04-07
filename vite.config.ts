import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/content.ts"),
      formats: ["iife"],
      name: "ReadableCaptionsContent",
      fileName: () => "content.js"
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
