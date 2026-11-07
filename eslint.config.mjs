import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/**/*.{jsx,tsx}", "src/features/**/*.{jsx,tsx}"],
    ignores: ["src/app/layout.tsx", "src/features/*/components/**/*.{jsx,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^[a-z]/]",
          message:
            "Compose TSX components here. Keep semantic HTML in shared or feature component definitions.",
        },
        {
          selector: "JSXAttribute[name.name='className']",
          message:
            "Keep presentation in component definitions. Use component variants instead of className overrides.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
