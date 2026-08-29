import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * ESLint flat config for apps/frontend — issue #33
 *
 * Uses @eslint/eslintrc's FlatCompat to bridge the legacy
 * eslint-config-next and eslint-config-prettier configs into ESLint 9's
 * flat-config format.
 *
 * Rule precedence (last wins):
 *   1. eslint-config-next  — Next.js/React recommended rules
 *   2. eslint-config-prettier — disables all rules that conflict with Prettier
 *
 * To run:
 *   yarn workspace @truestub/frontend lint
 */
const eslintConfig = [
  // Ignore build artefacts and generated files
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "src/graphql/generated/**",
      "coverage/**",
      "*.config.js",
      "*.config.mjs",
      "*.config.ts",
    ],
  },
  // Next.js + Prettier rules via legacy-compat bridge
  ...compat.extends("next/core-web-vitals", "prettier"),
];

export default eslintConfig;
