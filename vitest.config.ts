import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Vitest 5 does not resolve the `@/*` tsconfig alias without this.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      ".aiox-core/**",
      ".aiox/**",
      ".claude/**",
      ".codex/**",
      ".cursor/**",
      ".gemini/**",
      ".kimi/**",
      ".antigravity/**",
      "agents/**",
      ".github/agents/**",
      ".planning/**",
      ".next/**",
    ],
  },
});
