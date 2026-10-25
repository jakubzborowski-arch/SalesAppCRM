import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Ocena jakości AI na zestawie rozmów (tests/eval) — tylko z kluczem: ANTHROPIC_API_KEY=… npm run eval:ai. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/eval/**/*.eval.ts"],
    environment: "node",
    testTimeout: 30 * 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
