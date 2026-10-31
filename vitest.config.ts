import { defineConfig } from "vitest/config";

// Runs the tests of every workspace: the web app's games and the shared game rules.
export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
  },
});
