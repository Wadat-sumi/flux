import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
  worker: { format: "es" },
  test: {
    exclude: ["tests/e2e*/**", "node_modules/**"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
