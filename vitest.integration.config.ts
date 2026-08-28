import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 15000,
    // Tests de integración pegan a una DB real — un solo worker a la vez
    // (maxWorkers: 1) evita contención de conexiones/locks entre archivos
    // paralelos. poolOptions fue removido en Vitest 4.
    pool: "forks",
    maxWorkers: 1,
  },
});
