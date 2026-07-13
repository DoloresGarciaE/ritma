import { describe, expect, it } from "vitest";

import { createOrganizationWithOwner, db } from "@/lib/db";

import { makeUser } from "./factories";

/**
 * El wizard (F0.5) crea org + membresía OWNER + disciplinas en UNA transacción. Acá se
 * prueba lo que no se puede ver a ojo: que sea atómico de verdad.
 */

describe("createOrganizationWithOwner", () => {
  it("crea org + membresía OWNER + disciplinas, con los defaults del schema", async () => {
    const owner = await makeUser("Malena Ríos");

    const { id } = await createOrganizationWithOwner({
      ownerId: owner.id,
      name: "Danzas Malena",
      type: "INDEPENDENT",
      disciplines: ["Árabe", "Folklore"],
    });

    const org = await db.organization.findUniqueOrThrow({
      where: { id },
      include: { memberships: true, disciplines: true },
    });

    expect(org.type).toBe("INDEPENDENT");
    expect(org.currency).toBe("ARS"); // defaults de HU1.2
    expect(org.dueDay).toBe(10);
    expect(org.timezone).toBe("America/Argentina/Buenos_Aires");
    expect(org.memberships).toEqual([expect.objectContaining({ userId: owner.id, role: "OWNER" })]);
    expect(new Set(org.disciplines.map((d) => d.name))).toEqual(new Set(["Árabe", "Folklore"]));
  });

  it("si falla a mitad de camino, no queda basura (rollback atómico)", async () => {
    const before = await db.organization.count();

    // El ownerId no existe → la FK de Membership explota DESPUÉS de insertar la org. Al ser
    // una escritura anidada (una transacción), toda la operación revierte.
    await expect(
      createOrganizationWithOwner({
        ownerId: "user-que-no-existe",
        name: "Organización Fantasma",
        type: "STUDIO",
        disciplines: ["Canto"],
      }),
    ).rejects.toThrow();

    expect(await db.organization.count()).toBe(before);
    expect(
      await db.organization.findFirst({ where: { name: "Organización Fantasma" } }),
    ).toBeNull();
  });
});
