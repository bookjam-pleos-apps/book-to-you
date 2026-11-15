import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/node_modules/**", "**/dist/**", "gpu/**", "spikes/**", "tests/architecture/fixtures/**", "**/drizzle.config.ts", "**/vite.config.ts"] },
  tseslint.configs.recommended,
  { files: ["apps/web/**/*.{ts,tsx}"], extends: [reactHooks.configs.flat.recommended] },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 25, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 2],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "no-restricted-syntax": [
        "error",
        { selector: "ExportDefaultDeclaration", message: "named export만 사용한다." },
        { selector: "ExportSpecifier[exported.name='default']", message: "named export만 사용한다." },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.int.ts", "**/testing/**"],
    rules: { "max-lines-per-function": "off" },
  },
);
