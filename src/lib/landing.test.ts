import { describe, expect, it } from "vitest";

import { resolveActiveOrg } from "./active-org";
import { resolveLanding, safeInternalPath } from "./landing";

describe("resolveLanding", () => {
  it("sin sesión → login", () => {
    expect(resolveLanding(null)).toBe("/login");
  });

  it("sesión sin organización → wizard", () => {
    expect(resolveLanding({ activeOrgId: null })).toBe("/crear-organizacion");
  });

  it("sesión con org activa → dashboard", () => {
    expect(resolveLanding({ activeOrgId: "org-a" })).toBe("/dashboard");
  });

  describe("integrada con resolveActiveOrg (la sesión real arma activeOrgId así)", () => {
    it("cookie de org forjada con membresías reales → dashboard de la org PROPIA", () => {
      const activeOrgId = resolveActiveOrg(["org-a", "org-b"], "org-forjada");
      expect(resolveLanding({ activeOrgId })).toBe("/dashboard");
      expect(activeOrgId).toBe("org-a");
    });

    it("cookie forjada sin ninguna membresía → wizard, no la org ajena", () => {
      const activeOrgId = resolveActiveOrg([], "org-ajena");
      expect(resolveLanding({ activeOrgId })).toBe("/crear-organizacion");
    });
  });
});

describe("safeInternalPath (el ?next= de la invitación, S7)", () => {
  it("acepta solo paths internos", () => {
    expect(safeInternalPath("/invitacion/abc123")).toBe("/invitacion/abc123");
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
  });

  it("rechaza URLs absolutas, protocol-relative y basura", () => {
    // "//evil.com" es la trampa clásica: el navegador lo lee como https://evil.com.
    expect(safeInternalPath("//evil.com/phish")).toBeNull();
    expect(safeInternalPath("https://evil.com")).toBeNull();
    expect(safeInternalPath("javascript:alert(1)")).toBeNull();
    expect(safeInternalPath("invitacion/abc")).toBeNull();
    expect(safeInternalPath("")).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
  });
});
