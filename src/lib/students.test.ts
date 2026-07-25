import { describe, expect, it } from "vitest";

import { formatPhone, initialsOf, normalizeForSearch, toE164 } from "./students";

/** Funciones puras: se testean sin base y sin navegador. */

describe("normalizeForSearch", () => {
  it("saca las tildes y baja a minúsculas", () => {
    expect(normalizeForSearch("Sofía Herrera")).toBe("sofia herrera");
    expect(normalizeForSearch("ÁLVAREZ")).toBe("alvarez");
  });

  it("normaliza la ñ, para que buscar 'peña' y 'pena' se encuentren entre sí", () => {
    expect(normalizeForSearch("Peña")).toBe("pena");
    expect(normalizeForSearch("Iñaki")).toBe("inaki");
  });

  it("colapsa espacios de más y recorta las puntas", () => {
    expect(normalizeForSearch("  Malena   Ríos  ")).toBe("malena rios");
  });

  it("una búsqueda con tilde encuentra un nombre sin tilde, y al revés", () => {
    const guardado = normalizeForSearch("Sofia Herrera"); // cargado sin tilde
    expect(guardado.includes(normalizeForSearch("Sofía"))).toBe(true); // buscado con tilde
  });
});

describe("toE164", () => {
  it("acepta cómo escribe un teléfono una persona real (default AR)", () => {
    expect(toE164("11 5555-4433")).toBe("+541155554433");
    expect(toE164("011 15 5555 4433")).toBe("+5491155554433");
  });

  it("acepta un número que ya viene internacional", () => {
    expect(toE164("+54 11 5555-4433")).toBe("+541155554433");
  });

  it("devuelve null si no es un teléfono válido", () => {
    expect(toE164("123")).toBeNull();
    expect(toE164("no soy un teléfono")).toBeNull();
    expect(toE164("")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("muestra el E.164 como se lee", () => {
    expect(formatPhone("+541155554433")).toContain("5555");
    expect(formatPhone("+541155554433")).not.toBe("+541155554433");
  });

  it("si el dato es raro, lo muestra tal cual en vez de esconderlo", () => {
    expect(formatPhone("cualquier cosa")).toBe("cualquier cosa");
  });
});

describe("initialsOf", () => {
  it("toma la primera letra del nombre y la del apellido", () => {
    expect(initialsOf("Sofía Herrera")).toBe("SH");
    expect(initialsOf("Malena  Ríos")).toBe("MR");
  });

  it("con un solo nombre, una sola letra", () => {
    expect(initialsOf("Malena")).toBe("M");
  });

  it("con nombres largos, primera y última", () => {
    expect(initialsOf("Ana María Pérez Gómez")).toBe("AG");
  });
});
