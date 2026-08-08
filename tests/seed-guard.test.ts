import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { endpointId, isProductionTarget, productionDbUrls } from "../prisma/seed-guard";

/**
 * El cinturón anti-producción de `seed:scenarios`: ni `--yes` puede apuntarlo a prod.
 * Los hosts de acá son de FORMA Neon real, pero inventados.
 */

const PROD_POOLED =
  "postgresql://user:pw@ep-prod-fake-123-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require";
const PROD_DIRECT =
  "postgresql://user:pw@ep-prod-fake-123.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require";
const DEV_POOLED =
  "postgresql://user:pw@ep-dev-fake-456-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require";

describe("endpointId", () => {
  it("saca el sufijo -pooler: pooled y directa son la MISMA base", () => {
    expect(endpointId("ep-x-abc-pooler.c-9.us-east-1.aws.neon.tech")).toBe("ep-x-abc");
    expect(endpointId("ep-x-abc.c-9.us-east-1.aws.neon.tech")).toBe("ep-x-abc");
  });

  it("no distingue mayúsculas", () => {
    expect(endpointId("EP-X-ABC-POOLER.NEON.TECH")).toBe("ep-x-abc");
  });
});

describe("isProductionTarget", () => {
  it("el host de prod (pooled) se detecta contra las dos URLs de prod", () => {
    expect(isProductionTarget(PROD_POOLED, [PROD_POOLED, PROD_DIRECT])).toBe(true);
  });

  it("la variante cruzada también: directa contra pooled y viceversa", () => {
    expect(isProductionTarget(PROD_DIRECT, [PROD_POOLED])).toBe(true);
    expect(isProductionTarget(PROD_POOLED, [PROD_DIRECT])).toBe(true);
  });

  it("el branch de dev NO es producción", () => {
    expect(isProductionTarget(DEV_POOLED, [PROD_POOLED, PROD_DIRECT])).toBe(false);
  });

  it("localhost NO es producción", () => {
    expect(isProductionTarget("postgresql://u:p@localhost:15432/ritma_test", [PROD_POOLED])).toBe(
      false,
    );
  });

  it("sin URLs de prod no hay contra qué comparar: no bloquea", () => {
    expect(isProductionTarget(PROD_POOLED, [])).toBe(false);
  });

  it("entradas de prod ilegibles se ignoran sin romper", () => {
    expect(isProductionTarget(PROD_POOLED, ["esto no es una url", PROD_DIRECT])).toBe(true);
    expect(isProductionTarget(DEV_POOLED, ["esto no es una url"])).toBe(false);
  });
});

describe("productionDbUrls", () => {
  const dir = mkdtempSync(join(tmpdir(), "ritma-seed-guard-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("lee DATABASE_URL y DIRECT_URL del env file sin tocar process.env", () => {
    const file = join(dir, "env-prod");
    writeFileSync(file, `DATABASE_URL="${PROD_POOLED}"\nDIRECT_URL="${PROD_DIRECT}"\nOTRA=x\n`);
    const before = process.env.DATABASE_URL;
    expect(productionDbUrls(file)).toEqual([PROD_POOLED, PROD_DIRECT]);
    expect(process.env.DATABASE_URL).toBe(before);
  });

  it("archivo inexistente → lista vacía (el seed avisa que no puede comparar)", () => {
    expect(productionDbUrls(join(dir, "no-existe"))).toEqual([]);
  });
});
