import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone test config: unit tests for pure helpers don't need the app's Vite plugins.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
