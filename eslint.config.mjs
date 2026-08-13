import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Acceptance-test harness — needs a running app, a real DB and a browser,
    // so it is intentionally outside the product's lint/type scope.
    "qa/scripts/**",
    // Self-contained Remotion project (marketing video) with its own
    // package.json, tsconfig, and `npm run lint` — not part of this app.
    "motion/**",
  ]),
]);

export default eslintConfig;
