import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { getInvitationByToken } from "@/server/public/invitations";
import { ForbiddenError, type Actor } from "@/server/services/permissions";
import {
  acceptInvitation,
  createInvitation,
  getInvitationToken,
  listPendingInvitations,
  listTeam,
  regenerateInvitation,
  revokeInvitation,
  revokeMemberAccess,
} from "@/server/services/team";

import {
  makeGroup,
  makeInvitation,
  makeMember,
  makeOrg,
  makeTeacherProfile,
  makeUser,
} from "./factories";

/**
 * S7 — el ciclo de vida del equipo (HU1.3): invitar → aceptar → trabajar → revocar.
 * Contra Postgres real, como toda la suite de autorización. La mitad "trabajar" (el
 * scoping de teacher) vive en teacher-scope.test.ts.
 */

async function actorIn(orgId: string, role: "OWNER" | "ADMIN" | "TEACHER"): Promise<Actor> {
  const member = await makeMember(orgId, role);
  return { userId: member.userId, orgId, role };
}

describe("createInvitation (HU1.3)", () => {
  it("crea con token opaco, vencimiento a 7 días y rol elegido; la lista la muestra", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");

    const { id, token } = await createInvitation(admin, {
      role: "TEACHER",
      email: "caro@example.com",
    });

    // 24 bytes base64url = 32 chars, sin padding: inadivinable, no derivado de nada.
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const pending = await listPendingInvitations(admin);
    expect(pending.map((i) => i.id)).toEqual([id]);
    expect(pending[0]).toMatchObject({
      email: "caro@example.com",
      role: "TEACHER",
      expired: false,
    });

    const days = (new Date(pending[0].expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("un TEACHER no invita (ForbiddenError) — por API, no solo por UI", async () => {
    const org = await makeOrg("Estudio Compás");
    const teacher = await actorIn(org.id, "TEACHER");

    await expect(createInvitation(teacher, { role: "TEACHER" })).rejects.toThrow(ForbiddenError);
    expect(await db.invitation.count({ where: { orgId: org.id } })).toBe(0);
  });

  it("en una org INDEPENDENT no existe la gestión del equipo", async () => {
    const org = await makeOrg("Danzas Malena", "INDEPENDENT");
    const owner = await actorIn(org.id, "OWNER");

    await expect(createInvitation(owner, { role: "ADMIN" })).rejects.toThrow(
      "La gestión del equipo existe solo en un estudio.",
    );
  });
});

describe("acceptInvitation (HU1.3)", () => {
  it("TEACHER: crea membresía + TeacherProfile vinculado (kind STAFF) y marca usada — atómico", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");
    const { token } = await createInvitation(admin, { role: "TEACHER" });
    const user = await makeUser("Caro Suárez");

    await acceptInvitation({ id: user.id, name: user.name }, org.id, token);

    const membership = await db.membership.findUniqueOrThrow({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
    });
    expect(membership.role).toBe("TEACHER");

    const profile = await db.teacherProfile.findUniqueOrThrow({
      where: { orgId_membershipUserId: { orgId: org.id, membershipUserId: user.id } },
    });
    expect(profile).toMatchObject({ displayName: "Caro Suárez", kind: "STAFF" });

    const invitation = await db.invitation.findFirstOrThrow({ where: { orgId: org.id } });
    expect(invitation.usedAt).not.toBeNull();
  });

  it("ADMIN: crea membresía SIN perfil docente (no dicta clases)", async () => {
    const org = await makeOrg("Estudio Compás");
    const owner = await actorIn(org.id, "OWNER");
    const { token } = await createInvitation(owner, { role: "ADMIN" });
    const user = await makeUser("Vale Admin");

    await acceptInvitation({ id: user.id, name: user.name }, org.id, token);

    const membership = await db.membership.findUniqueOrThrow({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
    });
    expect(membership.role).toBe("ADMIN");
    expect(await db.teacherProfile.count({ where: { orgId: org.id } })).toBe(0);
  });

  it("un solo uso: la segunda aceptación falla y no escribe nada", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");
    const { token } = await createInvitation(admin, { role: "TEACHER" });
    const first = await makeUser("Primera");
    const second = await makeUser("Segunda");

    await acceptInvitation({ id: first.id, name: first.name }, org.id, token);

    await expect(
      acceptInvitation({ id: second.id, name: second.name }, org.id, token),
    ).rejects.toThrow("Esta invitación ya fue usada.");

    expect(
      await db.membership.findUnique({
        where: { userId_orgId: { userId: second.id, orgId: org.id } },
      }),
    ).toBeNull();
    // Un solo perfil: el de la primera.
    expect(await db.teacherProfile.count({ where: { orgId: org.id } })).toBe(1);
  });

  it("vencida: falla con estado claro y no escribe nada", async () => {
    const org = await makeOrg("Estudio Compás");
    const stale = await makeInvitation(org.id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const user = await makeUser("Tarde");

    await expect(
      acceptInvitation({ id: user.id, name: user.name }, org.id, stale.token),
    ).rejects.toThrow("Esta invitación venció. Pedí una nueva.");
    expect(await db.membership.count({ where: { orgId: org.id } })).toBe(0);
  });

  it("revocada (borrada): el token muerto no autoriza nada", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");
    const { id, token } = await createInvitation(admin, { role: "TEACHER" });
    await revokeInvitation(admin, id);
    const user = await makeUser("Tarde");

    await expect(acceptInvitation({ id: user.id, name: user.name }, org.id, token)).rejects.toThrow(
      "Esta invitación no existe o fue revocada.",
    );
  });

  it("quien ya es parte no consume la invitación", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");
    const { token } = await createInvitation(admin, { role: "TEACHER" });
    const existing = await makeMember(org.id, "TEACHER");
    const user = await db.user.findUniqueOrThrow({ where: { id: existing.userId } });

    await expect(acceptInvitation({ id: user.id, name: user.name }, org.id, token)).rejects.toThrow(
      "Ya sos parte de esta organización.",
    );

    // La invitación sigue viva para la persona correcta.
    const invitation = await db.invitation.findFirstOrThrow({ where: { orgId: org.id } });
    expect(invitation.usedAt).toBeNull();
  });

  it("cross-org: el token de A no sirve para nada en B", async () => {
    const a = await makeOrg("Estudio A");
    const b = await makeOrg("Estudio B");
    const aAdmin = await actorIn(a.id, "ADMIN");
    const { token } = await createInvitation(aAdmin, { role: "ADMIN" });
    const user = await makeUser("Intrusa");

    // Aceptar "en B" con la llave de A: withOrg(B) no encuentra el token → genérico.
    await expect(acceptInvitation({ id: user.id, name: user.name }, b.id, token)).rejects.toThrow(
      "Esta invitación no existe o fue revocada.",
    );
    expect(await db.membership.count({ where: { userId: user.id } })).toBe(0);
    // Y la invitación de A quedó intacta.
    const invitation = await db.invitation.findFirstOrThrow({ where: { orgId: a.id } });
    expect(invitation.usedAt).toBeNull();
  });

  it("quien vuelve tras una revocación recibe un perfil NUEVO; el viejo conserva la historia", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");

    // Primera vida: perfil con un grupo asignado.
    const { token: firstToken } = await createInvitation(admin, { role: "TEACHER" });
    const user = await makeUser("Caro Suárez");
    await acceptInvitation({ id: user.id, name: user.name }, org.id, firstToken);
    const firstProfile = await db.teacherProfile.findFirstOrThrow({
      where: { orgId: org.id, membershipUserId: user.id },
    });
    const group = await makeGroup(org.id, "Árabe inicial", { teacherId: firstProfile.id });

    await revokeMemberAccess(admin, user.id);

    // Segunda vida.
    const { token: secondToken } = await createInvitation(admin, { role: "TEACHER" });
    await acceptInvitation({ id: user.id, name: user.name }, org.id, secondToken);

    const profiles = await db.teacherProfile.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "asc" },
    });
    expect(profiles).toHaveLength(2);
    expect(profiles[0].membershipUserId).toBeNull(); // el histórico, desvinculado
    expect(profiles[1].membershipUserId).toBe(user.id); // el nuevo, vinculado
    // El grupo sigue apuntando al perfil histórico: la historia no se reescribe.
    const groupAfter = await db.classGroup.findUniqueOrThrow({ where: { id: group.id } });
    expect(groupAfter.teacherId).toBe(firstProfile.id);
  });
});

describe("revocar y regenerar (HU1.3)", () => {
  it("revocar acceso: la membresía muere, el perfil y sus grupos quedan intactos", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");
    const teacher = await makeMember(org.id, "TEACHER");
    const profile = await makeTeacherProfile(org.id, "Caro Suárez", {
      membershipUserId: teacher.userId,
    });
    const group = await makeGroup(org.id, "Árabe inicial", { teacherId: profile.id });

    await revokeMemberAccess(admin, teacher.userId);

    expect(
      await db.membership.findUnique({
        where: { userId_orgId: { userId: teacher.userId, orgId: org.id } },
      }),
    ).toBeNull();
    const profileAfter = await db.teacherProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(profileAfter.membershipUserId).toBeNull();
    expect(profileAfter.displayName).toBe("Caro Suárez");
    const groupAfter = await db.classGroup.findUniqueOrThrow({ where: { id: group.id } });
    expect(groupAfter.teacherId).toBe(profile.id);
  });

  it("un TEACHER no revoca; nadie se revoca a sí mismo; la OWNER no se revoca", async () => {
    const org = await makeOrg("Estudio Compás");
    const owner = await actorIn(org.id, "OWNER");
    const admin = await actorIn(org.id, "ADMIN");
    const teacher = await actorIn(org.id, "TEACHER");

    await expect(revokeMemberAccess(teacher, admin.userId)).rejects.toThrow(ForbiddenError);
    await expect(revokeMemberAccess(admin, admin.userId)).rejects.toThrow(
      "No podés revocar tu propio acceso.",
    );
    await expect(revokeMemberAccess(admin, owner.userId)).rejects.toThrow(
      "La titular de la organización no se puede revocar.",
    );
    expect(await db.membership.count({ where: { orgId: org.id } })).toBe(3);
  });

  it("regenerar rota el token: el viejo muere, el nuevo funciona", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");
    const { id, token: oldToken } = await createInvitation(admin, { role: "TEACHER" });

    const { token: newToken } = await regenerateInvitation(admin, id);
    expect(newToken).not.toBe(oldToken);

    const user = await makeUser("Caro Suárez");
    await expect(
      acceptInvitation({ id: user.id, name: user.name }, org.id, oldToken),
    ).rejects.toThrow("Esta invitación no existe o fue revocada.");
    await acceptInvitation({ id: user.id, name: user.name }, org.id, newToken);
    expect(
      await db.membership.findUnique({
        where: { userId_orgId: { userId: user.id, orgId: org.id } },
      }),
    ).not.toBeNull();
  });

  it("el token viaja solo al compartir: la lista no lo trae, getInvitationToken sí", async () => {
    const org = await makeOrg("Estudio Compás");
    const admin = await actorIn(org.id, "ADMIN");
    const { id, token } = await createInvitation(admin, { role: "TEACHER" });

    const pending = await listPendingInvitations(admin);
    expect(JSON.stringify(pending)).not.toContain(token);

    expect(await getInvitationToken(admin, id)).toEqual({ token });
    // Y un TEACHER tampoco lo obtiene por API.
    const teacher = await actorIn(org.id, "TEACHER");
    await expect(getInvitationToken(teacher, id)).rejects.toThrow(ForbiddenError);
  });
});

describe("la puerta pública por token (server/public/invitations.ts)", () => {
  it("válida → org y rol; usada/vencida → SOLO el estado; desconocida → null", async () => {
    const org = await makeOrg("Estudio Compás");
    const valid = await makeInvitation(org.id, { role: "ADMIN" });
    const used = await makeInvitation(org.id, { usedAt: new Date() });
    const expired = await makeInvitation(org.id, { expiresAt: new Date(Date.now() - 1000) });

    expect(await getInvitationByToken(valid.token)).toEqual({
      kind: "valid",
      orgId: org.id,
      orgName: "Estudio Compás",
      role: "ADMIN",
    });
    // Un link viejo reenviado no cuenta para quién era: sin nombre de la org.
    expect(await getInvitationByToken(used.token)).toEqual({ kind: "used" });
    expect(await getInvitationByToken(expired.token)).toEqual({ kind: "expired" });
    expect(await getInvitationByToken("token-inexistente")).toBeNull();
    expect(await getInvitationByToken("")).toBeNull();
    expect(await getInvitationByToken("x".repeat(65))).toBeNull();
  });

  it("el equipo (listTeam) une membresías y perfiles; un TEACHER no lo lee", async () => {
    const org = await makeOrg("Estudio Compás");
    const owner = await actorIn(org.id, "OWNER");
    const teacher = await makeMember(org.id, "TEACHER");
    await makeTeacherProfile(org.id, "Caro Suárez", { membershipUserId: teacher.userId });

    const team = await listTeam(owner);
    expect(team.map((m) => m.role)).toEqual(["OWNER", "TEACHER"]);
    expect(team[1].teacher?.displayName).toBe("Caro Suárez");

    const teacherActor: Actor = { userId: teacher.userId, orgId: org.id, role: "TEACHER" };
    await expect(listTeam(teacherActor)).rejects.toThrow(ForbiddenError);
  });
});
