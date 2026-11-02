import babelParser from "@babel/eslint-parser";
import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["dist/**", "coverage/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [
            ["@babel/preset-typescript", {}],
            ["@babel/preset-react", { runtime: "automatic" }],
          ],
        },
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      ...reactHooks.configs["recommended-latest"].rules,
      // tsc --noEmit owns unused-symbol and undefined-name checks for TS; the
      // Babel parser cannot scope type-only syntax for the core rules.
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
