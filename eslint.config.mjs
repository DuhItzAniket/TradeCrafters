import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  ...tseslint.configs.recommended,
  {
    files: ["apps/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/next-env.d.ts",
    "packages/market-catalog/data/**",
  ]),
]);
