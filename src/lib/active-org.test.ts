import { describe, expect, it } from "vitest";

import { resolveActiveOrg } from "./active-org";

/**
 * La seguridad del selector en su forma pura: la preferencia (una cookie, o sea input
 * del cliente) JAMÁS activa una org sin membresía que la respalde.
 */

describe("resolveActiveOrg", () => {
  it("con preferencia respaldada por membresía, gana la preferencia", () => {
    expect(resolveActiveOrg(["org-a", "org-b"], "org-b")).toBe("org-b");
  });

  it("una preferencia SIN membresía se ignora: cae a la primera, nunca a la ajena", () => {
    expect(resolveActiveOrg(["org-a", "org-b"], "org-forjada")).toBe("org-a");
  });

  it("sin preferencia, la primera membresía (el comportamiento de siempre)", () => {
    expect(resolveActiveOrg(["org-a", "org-b"], null)).toBe("org-a");
    expect(resolveActiveOrg(["org-a", "org-b"], undefined)).toBe("org-a");
    expect(resolveActiveOrg(["org-a", "org-b"], "")).toBe("org-a");
  });

  it("sin membresías, null — aunque la cookie diga cualquier cosa", () => {
    expect(resolveActiveOrg([], "org-forjada")).toBeNull();
    expect(resolveActiveOrg([], null)).toBeNull();
  });
});
