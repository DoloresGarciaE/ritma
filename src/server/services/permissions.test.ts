import { describe, expect, it } from "vitest";

import type { Role } from "@/generated/prisma/client";

import {
  assertRole,
  can,
  CAPABILITIES,
  ForbiddenError,
  scopeOf,
  type Actor,
  type Capability,
} from "./permissions";

/**
 * La política de permisos es función pura: se testea sin base. Estos casos son la matriz
 * del Plan §4 escrita como tabla de verdad — si alguien cambia un permiso sin versionar la
 * spec, esto se pone rojo.
 */

const ROLES: Role[] = ["OWNER", "ADMIN", "TEACHER"];

function actor(role: Role): Actor {
  return { userId: "u1", orgId: "o1", role };
}

/** Qué rol tiene qué capacidad, según la matriz §4 (independiente de CAPABILITIES). */
const EXPECTED: Record<Capability, Role[]> = {
  "org:configure": ["OWNER", "ADMIN"],
  "members:manage": ["OWNER", "ADMIN"],
  "org:viewAll": ["OWNER", "ADMIN"],
  "spaces:manage": ["OWNER", "ADMIN"],
  "settlements:manage": ["OWNER", "ADMIN"],
  "settlements:viewOwn": ["OWNER", "ADMIN", "TEACHER"],
  "groups:manage": ["OWNER", "ADMIN", "TEACHER"],
  "students:manage": ["OWNER", "ADMIN", "TEACHER"],
  "payments:manage": ["OWNER", "ADMIN", "TEACHER"],
  "reminders:send": ["OWNER", "ADMIN", "TEACHER"],
};

describe("can — la matriz de roles del Plan §4", () => {
  const capabilities = Object.keys(EXPECTED) as Capability[];

  for (const capability of capabilities) {
    for (const role of ROLES) {
      const allowed = EXPECTED[capability].includes(role);
      it(`${role} ${allowed ? "puede" : "NO puede"} ${capability}`, () => {
        expect(can(actor(role), capability)).toBe(allowed);
      });
    }
  }

  it("no hay capacidades fuera de la matriz (ninguna inventada)", () => {
    expect(Object.keys(CAPABILITIES).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("owner y admin tienen exactamente los mismos permisos (matriz §4)", () => {
    const caps = Object.keys(CAPABILITIES) as Capability[];
    for (const capability of caps) {
      expect(can(actor("OWNER"), capability)).toBe(can(actor("ADMIN"), capability));
    }
  });
});

describe("scopeOf — el alcance de datos", () => {
  it("owner ve todo", () => {
    expect(scopeOf(actor("OWNER"))).toEqual({ kind: "all" });
  });

  it("admin ve todo", () => {
    expect(scopeOf(actor("ADMIN"))).toEqual({ kind: "all" });
  });

  it("teacher ve solo lo propio, atado a su userId", () => {
    expect(scopeOf({ userId: "prof-42", orgId: "o1", role: "TEACHER" })).toEqual({
      kind: "ownTeacher",
      teacherUserId: "prof-42",
    });
  });
});

describe("assertRole", () => {
  it("deja pasar si el rol está permitido", () => {
    expect(() => assertRole(actor("ADMIN"), ["OWNER", "ADMIN"])).not.toThrow();
  });

  it("lanza ForbiddenError si el rol no alcanza (teacher pidiendo algo de admin/owner)", () => {
    expect(() => assertRole(actor("TEACHER"), ["OWNER", "ADMIN"])).toThrow(ForbiddenError);
  });
});
