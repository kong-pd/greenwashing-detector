// eslint.config.js — flat config for ESLint 10 (the `lint` script was broken
// without it). Keeps the gate light: react-hooks rules guard the polling
// effects (AbortController cleanup), unused-vars stays a warning so the
// delivery flow isn't blocked by style noise.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist"] },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // React-19 advisory perf rules downgraded to warnings: the legacy design
      // assets (Interactions/TweaksPanel + stage animations) predate them and
      // are protected "take as-is" files per the rebuild manuals. Correctness
      // rules (rules-of-hooks / exhaustive-deps) stay at their default levels.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "no-unused-vars": ["warn", { varsIgnorePattern: "^[A-Z_]" }],
      "react-refresh/only-export-components": "off",
    },
  },
];
