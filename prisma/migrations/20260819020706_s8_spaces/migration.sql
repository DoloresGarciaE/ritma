-- AlterTable
ALTER TABLE "ClassGroup" ADD COLUMN     "spaceId" TEXT;

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Space_orgId_name_key" ON "Space"("orgId", "name");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Herencia S8 (decisión del ticket): la convención de nombre "· Salón X" que el
-- seed de escenarios usaba como placeholder desde S2 se convierte en datos reales.
--
-- En las orgs STUDIO, todo grupo cuyo nombre termina en " · Salón X" o " · Terraza"
-- (las dos formas que la convención produjo): se crea el Space (una vez por org y
-- nombre, gen_random_uuid como en el backfill S7), se asigna el spaceId y se LIMPIA
-- el sufijo del nombre. Idempotente por construcción: tras la limpieza, ningún
-- nombre matchea el patrón y ambas sentencias son no-op.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO "Space" ("id", "orgId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, x."orgId", x."salon", NOW(), NOW()
FROM (
  SELECT DISTINCT g."orgId",
         substring(g."name" FROM ' · (Salón [^·]+|Terraza)$') AS "salon"
  FROM "ClassGroup" g
  JOIN "Organization" o ON o."id" = g."orgId"
  WHERE o."type" = 'STUDIO'
    AND g."name" ~ ' · (Salón [^·]+|Terraza)$'
) x
ON CONFLICT ("orgId", "name") DO NOTHING;

UPDATE "ClassGroup" g
SET "spaceId" = s."id",
    "name" = regexp_replace(g."name", ' · (Salón [^·]+|Terraza)$', '')
FROM "Space" s, "Organization" o
WHERE o."id" = g."orgId"
  AND o."type" = 'STUDIO'
  AND g."name" ~ ' · (Salón [^·]+|Terraza)$'
  AND s."orgId" = g."orgId"
  AND s."name" = substring(g."name" FROM ' · (Salón [^·]+|Terraza)$');
