import { describe, expect, it } from "vitest";

import { waLink } from "./whatsapp";

describe("waLink", () => {
  it("arma el deep link con el E.164 sin el + y el texto URL-encodeado", () => {
    expect(waLink("+5491155554433", "Hola Sofía")).toBe(
      "https://wa.me/5491155554433?text=Hola%20Sof%C3%ADa",
    );
  });

  it("encodea el emoji y los signos del mensaje real", () => {
    const link = waLink("+5491155554433", "Hola 👋 ¿todo bien? $20.000");
    expect(link.startsWith("https://wa.me/5491155554433?text=")).toBe(true);
    expect(link).not.toContain(" ");
    expect(decodeURIComponent(link.split("text=")[1])).toBe("Hola 👋 ¿todo bien? $20.000");
  });
});
