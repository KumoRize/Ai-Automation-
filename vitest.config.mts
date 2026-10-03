import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: {
      APP_SECRET: "test-secret-that-is-at-least-32-characters-long",
      APP_PASSWORD: "correct horse",
      DATA_DIR: "./data-test",
    },
  },
});
