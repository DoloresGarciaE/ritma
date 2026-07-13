import { beforeEach, describe, expect, it, vi } from "vitest";

// Se mockea SOLO la sesión (el borde de la request). Prisma queda REAL: la membresía se lee
// de Postgres. Esto no es "mockear el scoping" —eso está prohibido—, es sustituir la
// identidad, que en un test no viene de una cookie.
const requireSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireSession: () => requireSessionMock(),
}));

import { requireMember, requireRole } from "@/server/authz";
import { ForbiddenError } from "@/server/services/permissions";

import { makeMember, makeOrg } from "./factories";

function loginAs(userId: string) {
  requireSessionMock.mockResolvedValue({
    userId,
    name: "Tester",
    email: "tester@test.local",
    activeOrgId: null,
  });
}

beforeEach(() => {
  requireSessionMock.mockReset();
});

describe("requireMember", () => {
  it("devuelve el actor con su rol real cuando es miembro", async () => {
    const org = await makeOrg("Estudio Compás");
    const member = await makeMember(org.id, "ADMIN");
    loginAs(member.userId);

    await expect(requireMember(org.id)).resolves.toEqual({
      userId: member.userId,
      orgId: org.id,
      role: "ADMIN",
    });
  });

  it("lanza ForbiddenError si el usuario NO es miembro de la org", async () => {
    const orgA = await makeOrg("Estudio A");
    const orgB = await makeOrg("Estudio B");
    const member = await makeMember(orgA.id, "OWNER"); // no pertenece a B
    loginAs(member.userId);

    await expect(requireMember(orgB.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("requireRole", () => {
  it("un teacher NO pasa un chequeo reservado a owner/admin", async () => {
    const org = await makeOrg("Estudio A");
    const teacher = await makeMember(org.id, "TEACHER");
    loginAs(teacher.userId);

    await expect(requireRole(org.id, "OWNER", "ADMIN")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("un admin sí pasa un chequeo de owner/admin", async () => {
    const org = await makeOrg("Estudio A");
    const admin = await makeMember(org.id, "ADMIN");
    loginAs(admin.userId);

    await expect(requireRole(org.id, "OWNER", "ADMIN")).resolves.toMatchObject({ role: "ADMIN" });
  });
});
