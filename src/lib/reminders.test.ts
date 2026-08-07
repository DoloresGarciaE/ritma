import { describe, expect, it } from "vitest";

import {
  DEFAULT_REMINDER_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE_NO_ALIAS,
  defaultReminderTemplate,
  firstNameOf,
  REMINDER_VARIABLES,
  renderTemplate,
  withoutEmojis,
} from "./reminders";

const VARS = {
  nombre: "Sofía",
  periodo: "Marzo 2026",
  monto: "$20.000",
  alias: "estudio.luna",
};

describe("renderTemplate", () => {
  it("la default renderiza el ejemplo normativo de Marca §4.2 con los datos puestos", () => {
    expect(renderTemplate(DEFAULT_REMINDER_TEMPLATE, VARS)).toBe(
      "Hola Sofía 👋 Te paso el resumen de Marzo 2026: $20.000. " +
        "Podés transferir a estudio.luna. ¡Gracias!",
    );
  });

  it("reemplaza TODAS las apariciones, no solo la primera", () => {
    expect(renderTemplate("{nombre} {nombre} debe {monto}", VARS)).toBe("Sofía Sofía debe $20.000");
  });

  it("una variable desconocida o un typo quedan visibles (para verse en la vista previa)", () => {
    expect(renderTemplate("Hola {nombre}, {grupo} te espera. {Nombre}", VARS)).toBe(
      "Hola Sofía, {grupo} te espera. {Nombre}",
    );
  });

  it("sin alias cargado, {alias} queda vacío en vez de romper", () => {
    expect(renderTemplate("Transferí a {alias}.", { ...VARS, alias: "" })).toBe("Transferí a .");
  });

  it("la default usa exactamente las variables documentadas para el editor", () => {
    for (const variable of REMINDER_VARIABLES) {
      expect(DEFAULT_REMINDER_TEMPLATE).toContain(`{${variable.name}}`);
    }
  });

  it("la default respeta la regla de emojis de Marca §4: uno, y solo uno", () => {
    expect(DEFAULT_REMINDER_TEMPLATE.match(/\p{Extended_Pictographic}/gu)).toHaveLength(1);
  });
});

describe("firstNameOf", () => {
  it("se queda con el nombre de pila", () => {
    expect(firstNameOf("Sofía Herrera")).toBe("Sofía");
    expect(firstNameOf("  Malena  Ríos ")).toBe("Malena");
    expect(firstNameOf("Cher")).toBe("Cher");
  });
});

describe("defaultReminderTemplate", () => {
  it("con alias usa el default completo; sin alias, el que no tiene la frase", () => {
    expect(defaultReminderTemplate("estudio.luna")).toBe(DEFAULT_REMINDER_TEMPLATE);
    expect(defaultReminderTemplate("")).toBe(DEFAULT_REMINDER_TEMPLATE_NO_ALIAS);
    expect(defaultReminderTemplate("   ")).toBe(DEFAULT_REMINDER_TEMPLATE_NO_ALIAS);
  });

  it('el default sin alias nunca puede renderizar "transferir a ."', () => {
    expect(DEFAULT_REMINDER_TEMPLATE_NO_ALIAS).not.toContain("{alias}");
    const rendered = renderTemplate(DEFAULT_REMINDER_TEMPLATE_NO_ALIAS, { ...VARS, alias: "" });
    expect(rendered).toBe("Hola Sofía 👋 Te paso el resumen de Marzo 2026: $20.000. ¡Gracias!");
  });
});

describe("withoutEmojis", () => {
  it("saca el emoji del canal WhatsApp sin dejar doble espacio (regla de Marca §4 para email)", () => {
    expect(withoutEmojis("Hola Sofía 👋 Te paso el resumen.")).toBe(
      "Hola Sofía Te paso el resumen.",
    );
  });

  it("cubre emojis compuestos y con variation selector; no toca acentos ni signos", () => {
    expect(withoutEmojis("Equipo 👩‍🏫 listo ❤️ ¡vamos!")).toBe("Equipo listo ¡vamos!");
    expect(withoutEmojis("¿Todo bien? $20.000 · Árabe")).toBe("¿Todo bien? $20.000 · Árabe");
  });
});
