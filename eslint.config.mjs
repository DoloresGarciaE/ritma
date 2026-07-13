import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Disables ESLint rules that conflict with Prettier. Must stay after the Next configs.
  prettier,
  // F0.6 — el aislamiento por organización es obligatorio: el cliente Prisma crudo (`db`)
  // y el constructor `PrismaClient` no se importan fuera de `src/lib/`. Todo lo demás pasa
  // por `withOrg(orgId)`. Sin esto, cualquiera podría saltearse el scoping sin darse cuenta
  // (Plan §10, decisión 1; CLAUDE.md → Base de datos).
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              importNames: ["db"],
              message:
                "El cliente crudo `db` se salta el scoping por organización. Usá withOrg(orgId) (o, para queries sin tenant, escribí el acceso dentro de src/lib/).",
            },
            {
              name: "@/generated/prisma/client",
              importNames: ["PrismaClient"],
              message:
                "Instanciá el cliente solo en src/lib/db.ts. En el resto, usá withOrg(orgId).",
            },
          ],
        },
      ],
    },
  },
  {
    // El cliente crudo vive legítimamente acá: withOrg y la creación del tenant (src/lib/),
    // el seed (corre antes de que exista una org) y los tests de aislamiento (arman datos
    // cross-org a propósito y verifican el scoping desde afuera).
    files: ["src/lib/**", "prisma/**", "tests/**", "**/*.test.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma client (generated code, F0.3).
    "src/generated/**",
  ]),
]);

export default eslintConfig;
