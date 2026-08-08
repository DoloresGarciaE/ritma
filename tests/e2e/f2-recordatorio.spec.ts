import { expect, test } from "@playwright/test";

import { createGroup, createStudent, enrollFromStudentPage, registerWithOrg } from "./helpers";

/**
 * F2 (Plan §9): Deudores → WhatsApp con la plantilla RENDERIZADA (nombre, monto; sin
 * variables sin reemplazar y sin frase de alias cuando la org no cargó uno) → el disparo
 * queda en el historial de la ficha como fecha y canal, sin estados inventados.
 */
test("F2: el recordatorio sale renderizado y el disparo queda en el historial", async ({
  page,
}) => {
  await registerWithOrg(page, "F2");
  await createGroup(page, "Folklore adultos");
  await createStudent(page, { name: "Rocío Álvarez", phone: "11 5555-4433" });
  await enrollFromStudentPage(page, {
    studentName: "Rocío Álvarez",
    groupName: "Folklore adultos",
  });

  // ── Deudores: el link wa.me ya viene armado del server ──────────────────────
  await page.goto("/cobranzas");
  const wa = page.getByRole("link", { name: "Recordar a Rocío Álvarez por WhatsApp" });
  await expect(wa).toBeVisible();

  const href = (await wa.getAttribute("href"))!;
  // Teléfono en E.164 sin el "+" (default AR: 11 5555-4433 → 54911...).
  expect(href).toMatch(/^https:\/\/wa\.me\/54\d+\?text=/);

  const text = decodeURIComponent(href.split("text=")[1]);
  expect(text).toContain("Rocío"); // {nombre}
  expect(text).toContain("$18.000"); // {monto}: la deuda del período completo
  expect(text).not.toContain("{"); // ninguna variable quedó sin reemplazar
  // La org no cargó alias: la plantilla default va SIN la frase de la transferencia.
  expect(text.toLowerCase()).not.toContain("transfer");

  // ── El tap dispara el log; la ida a WhatsApp se aborta (es externa) ─────────
  await page.context().route("https://wa.me/**", (route) => route.abort());
  const logPost = page
    .waitForResponse((response) => response.request().method() === "POST", { timeout: 15000 })
    .catch(() => null);
  const popup = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
  await wa.click();
  await logPost;
  const opened = await popup;
  if (opened) await opened.close();

  // ── El historial de la ficha: canal y fecha ─────────────────────────────────
  await page.goto("/alumnos");
  await page.getByRole("link", { name: /Rocío Álvarez/ }).click();
  await expect(page.getByText("Sin recordatorios todavía.")).toBeHidden();
  await expect(
    page
      .locator("li")
      .filter({ hasText: /^WhatsApp/ })
      .first(),
  ).toBeVisible();
});
