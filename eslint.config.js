import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

// TS 7.0 no tiene API programática aún — typescript-eslint resuelve
// require("typescript") que con el alias en package.json apunta a TS 6.x.
// tsc (build) sigue usando TS 7 via @typescript/native.
// Tracking: https://github.com/typescript-eslint/typescript-eslint/issues/10940

export default tseslint.config(
  { ignores: ["dist", "generated", "coverage", "node_modules", "eslint.config.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    rules: {
      // ── Reglas críticas (lo que tsc NO cubre) ──────────────────────

      // Promesas sin await/catch — en un proyecto con webhooks de pago
      // y jobs async, una promesa perdida puede significar un evento
      // de pago que nunca se procesa.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Alinea con verbatimModuleSyntax — fuerza a marcar explícitamente
      // los imports que son solo de tipos.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],

      // El proyecto usa pino (logger) en todos lados — console.log no
      // debería colarse en código productivo.
      "no-console": "warn",

      // ── Reglas deshabilitadas (solapadas con tsc strict o imprácticas) ─

      // Prisma genera métodos que se pasan como callbacks frecuentemente
      // (ej. .map(prisma.model.findMany)). 399 errores, no práctico.
      "@typescript-eslint/unbound-method": "off",

      // Común en tests (async () => { expect(...) }) — no real.
      "@typescript-eslint/require-await": "off",

      // Funciones vacías son legítimas en mocks/stubs de tests.
      "@typescript-eslint/no-empty-function": "off",

      // Express require 4 params para error handlers — el _next es
      // obligatorio por signature aunque no se use.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },
  eslintConfigPrettier,
);
