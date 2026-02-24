import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content.ts")
      },
      output: {
        entryFileNames: "[name].js"
      }
    },
    outDir: "dist",
    emptyOutDir: true
  }
});