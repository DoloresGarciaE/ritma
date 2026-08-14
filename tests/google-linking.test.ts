import { beforeEach, describe, expect, it } from "vitest";

import { listMembershipsForUser } from "@/lib/active-org";
import { auth } from "@/lib/auth";
import { createOrganizationWithOwner, db } from "@/lib/db";

import { resetDb } from "./db";

/**
 * Vinculación de cuentas (ticket Google, ago 2026).
 *
 * La promesa del ticket es una sola: **entrar con Google usando el email de una cuenta que
 * ya existe con contraseña entra a ESA cuenta**, con sus organizaciones y membresías
 * intactas, y sin fabricar un segundo usuario con el mismo email.
 *
 * Contra Postgres real y con las APIs reales de Better Auth. Lo único que no se puede
 * ejercitar acá es el viaje a Google (haría falta un id_token firmado por ellos): se
 * ejercita el resto del camino que corre el callback, que es donde vive nuestra promesa —
 * `findOAuthUser` (a quién reconoce por email) y `linkAccount` (qué fila crea).
 */

const EMAIL = "malena@ritma.test";
const GOOGLE_SUB = "108453120987654321000"; // el `sub` del id_token: el id de Google

beforeEach(async () => {
  await resetDb();
});

/** Registro real por email+contraseña, tal como lo hace la pantalla de registro. */
async function signUpWithPassword() {
  const { user } = await auth.api.signUpEmail({
    body: { name: "Malena Ríos", email: EMAIL, password: "una-clave-larga" },
  });
  return user;
}

describe("entrar con Google con el email de una cuenta que ya existe", () => {
  it("el registro con contraseña deja el email SIN verificar (por eso el gate local se baja)", async () => {
    const user = await signUpWithPassword();

    // Este `false` es la razón entera de `requireLocalEmailVerified: false`: con el default
    // de Better Auth, esta cuenta no podría vincularse con Google nunca.
    expect(user.emailVerified).toBe(false);
  });

  it("reconoce al usuario existente por email y le suma la cuenta de Google, sin duplicar", async () => {
    const user = await signUpWithPassword();
    const org = await createOrganizationWithOwner({
      ownerId: user.id,
      name: "Estudio Meraki",
      type: "STUDIO",
      disciplines: ["Árabe"],
    });

    const ctx = await auth.$context;

    // 1. Lo que hace el callback ANTES de decidir: buscar por (accountId, providerId) y,
    //    si no hay, por email. Acá todavía no existe ninguna cuenta de Google.
    const found = await ctx.internalAdapter.findOAuthUser(EMAIL, GOOGLE_SUB, "google");
    expect(found?.user.id).toBe(user.id);
    expect(found?.linkedAccount).toBeNull();

    // 2. Y lo que hace después: vincular contra el usuario que YA existe.
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "google",
      accountId: GOOGLE_SUB,
    });

    // Un solo usuario con ese email: jamás una cuenta duplicada.
    const users = await db.user.findMany({ where: { email: EMAIL } });
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(user.id);

    // Y sus dos formas de entrar conviven: la credencial del registro y la de Google.
    const accounts = await ctx.internalAdapter.findAccounts(user.id);
    expect(accounts.map((account) => account.providerId).sort()).toEqual(["credential", "google"]);

    // Lo que la promesa protege de verdad: la organización sigue siendo suya.
    const memberships = await listMembershipsForUser(user.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      orgId: org.id,
      orgName: "Estudio Meraki",
      role: "OWNER",
    });
  });

  it("una vez vinculada, Google entra por la cuenta de Google y encuentra al MISMO usuario", async () => {
    const user = await signUpWithPassword();
    const ctx = await auth.$context;

    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "google",
      accountId: GOOGLE_SUB,
    });

    // El segundo login ya no resuelve por email sino por (accountId, providerId): mismo
    // usuario, y ahora con la cuenta vinculada a la vista.
    const found = await ctx.internalAdapter.findOAuthUser(EMAIL, GOOGLE_SUB, "google");
    expect(found?.user.id).toBe(user.id);
    expect(found?.linkedAccount?.providerId).toBe("google");
  });

  it("un usuario social nuevo, sin membresías, no activa ninguna organización", async () => {
    // El caso inverso: quien entra con Google por primera vez no pertenece a nada, así que
    // `activeOrgId` queda null y la raíz lo manda al wizard (resolveLanding).
    const outsider = await db.user.create({
      data: { email: "nueva@ritma.test", name: "Nueva Profe", emailVerified: true },
    });

    const memberships = await listMembershipsForUser(outsider.id);
    expect(memberships).toEqual([]);
  });
});
