import { afterEach, describe, expect, it } from "vitest";

import {
  buildInvitationEmailHtml,
  buildReminderEmailHtml,
  escapeHtml,
  isEmailConfigured,
  sendInvitationEmail,
  sendReminderEmail,
} from "./email";

/**
 * La guarda de env del email (patrón r2.test.ts): puras, sin red — el envío real no se
 * testea (sería testear a Resend); sí que sin la env el feature NO EXISTE y que el HTML
 * escapa lo que viene del dominio.
 */

const saved = process.env.RESEND_API_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = saved;
});

describe("isEmailConfigured", () => {
  it("false sin RESEND_API_KEY; true con ella", () => {
    delete process.env.RESEND_API_KEY;
    expect(isEmailConfigured()).toBe(false);

    process.env.RESEND_API_KEY = "re_test_123";
    expect(isEmailConfigured()).toBe(true);
  });
});

describe("sendReminderEmail — fail-closed", () => {
  it("sin la env, lanza sin intentar ninguna red", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      sendReminderEmail({
        to: "sofia@example.com",
        subject: "Resumen de Marzo 2026",
        message: "Hola",
        orgName: "Danzas Malena",
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe("buildReminderEmailHtml", () => {
  it("escapa el contenido del dominio (nombre de org y mensaje no inyectan HTML)", () => {
    const html = buildReminderEmailHtml({
      message: "Hola <script>alert(1)</script>",
      orgName: 'Estudio "A&B"',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Estudio &quot;A&amp;B&quot;");
  });

  it("lleva el logotipo del header (Marca §9.3) y separa párrafos por línea", () => {
    const html = buildReminderEmailHtml({
      message: "Primera línea\nSegunda línea",
      orgName: "Danzas Malena",
    });
    expect(html).toContain("/brand/ritma-logotipo.png");
    expect(html.match(/<p /g)?.length).toBe(3); // 2 del mensaje + 1 del pie
  });
});

describe("buildInvitationEmailHtml (S7)", () => {
  it("nombra org y rol escapados, y lleva UN solo botón al link (Marca §9.3)", () => {
    const html = buildInvitationEmailHtml({
      orgName: 'Estudio "A&B"',
      roleLabel: "Profe",
      url: "https://ritma.com.ar/invitacion/abc123",
    });
    expect(html).toContain("Estudio &quot;A&amp;B&quot;");
    expect(html).toContain("Profe");
    expect(html).toContain('href="https://ritma.com.ar/invitacion/abc123"');
    expect(html.match(/<a /g)?.length).toBe(1);
    expect(html).toContain("/brand/ritma-logotipo.png");
    expect(html).toContain("Aceptar invitación");
  });
});

describe("sendInvitationEmail — fail-closed", () => {
  it("sin la env, lanza sin intentar ninguna red", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      sendInvitationEmail({
        to: "caro@example.com",
        orgName: "Estudio Compás",
        roleLabel: "Profe",
        url: "https://ritma.com.ar/invitacion/abc123",
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe("escapeHtml", () => {
  it("escapa las cinco entidades", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});
