-- CreateEnum
CREATE TYPE "TeacherKind" AS ENUM ('OWNER_TEACHER', 'STAFF', 'EXTERNAL');

-- AlterTable
ALTER TABLE "ClassGroup" ADD COLUMN     "teacherId" TEXT;

-- CreateTable
CREATE TABLE "TeacherProfile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "membershipUserId" TEXT,
    "displayName" TEXT NOT NULL,
    "kind" "TeacherKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherProfile_orgId_idx" ON "TeacherProfile"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_orgId_membershipUserId_key" ON "TeacherProfile"("orgId", "membershipUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_orgId_idx" ON "Invitation"("orgId");

-- CreateIndex
CREATE INDEX "ClassGroup_orgId_teacherId_idx" ON "ClassGroup"("orgId", "teacherId");

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_membershipUserId_fkey" FOREIGN KEY ("membershipUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill S7 (decisión del ticket, ADR-004): se paga la deuda de la nota S2.
--
-- Cada org existente recibe el perfil docente de su OWNER (kind OWNER_TEACHER):
-- en una INDEPENDENT el owner ES el único profe implícito de la Fase 1, y en un
-- STUDIO la dueña suele dictar también — sin perfil no habría a quién asignarle
-- grupos. Los ids usan gen_random_uuid() (nativa de Postgres 13+): el formato
-- cuid() vive en la app, y acá cualquier string único sirve.
--
-- Los GRUPOS solo se asignan en las INDEPENDENT (todos al owner). En un STUDIO
-- quedan "sin profe asignado" hasta que un admin los asigne: adivinar sería peor.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO "TeacherProfile" ("id", "orgId", "membershipUserId", "displayName", "kind", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", m."userId", u."name", 'OWNER_TEACHER', NOW(), NOW()
FROM "Organization" o
JOIN LATERAL (
  SELECT "userId" FROM "Membership"
  WHERE "orgId" = o."id" AND "role" = 'OWNER'
  ORDER BY "createdAt" ASC
  LIMIT 1
) m ON true
JOIN "User" u ON u."id" = m."userId";

UPDATE "ClassGroup" g
SET "teacherId" = tp."id"
FROM "TeacherProfile" tp
JOIN "Organization" o ON o."id" = tp."orgId"
WHERE tp."orgId" = g."orgId"
  AND tp."kind" = 'OWNER_TEACHER'
  AND o."type" = 'INDEPENDENT'
  AND g."teacherId" IS NULL;
