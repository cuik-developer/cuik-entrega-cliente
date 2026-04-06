import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@cuik/shared": "../shared",
      "@cuik/shared/types/editor": "../shared/types/editor",
      "@cuik/shared/validators/pass-design-schema": "../shared/validators/pass-design-schema",
    },
  },
})
