import { expect, test } from "@playwright/test";

import { createGroup, createStudent, enrollFromStudentPage, registerWithOrg } from "./helpers";

/**
 * F1 (Plan §9): registrar pago → imputación automática → comprobante → el link público
 * abre SIN login. El monto llega pre-cargado con la deuda (HU4.3, el objetivo de los
 * 15 segundos) y al pagar, Cobranzas queda en paz.
 */
test("F1: registrar un pago y compartir un comprobante que abre sin login", async ({
  page,
  context,
  browser,
}) => {
  // El fallback de compartir en un browser sin Web Share API es copiar el link.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const { orgName } = await registerWithOrg(page, "F1");
  await createGroup(page, "Árabe inicial");
  await createStudent(page, { name: "Sofía Herrera" });
  await enrollFromStudentPage(page, { studentName: "Sofía Herrera", groupName: "Árabe inicial" });

  // ── Deudores → Registrar pago ───────────────────────────────────────────────
  await page.goto("/cobranzas");
  await expect(page.getByText("Sofía Herrera").first()).toBeVisible();
  await page.getByRole("button", { name: "Registrar pago" }).first().click();

  const sheet = page.getByRole("dialog");
  // HU4.3: el monto viene PRE-CARGADO con la deuda.
  await expect(sheet.getByLabel("Monto")).toHaveValue("18.000");
  await sheet.getByRole("button", { name: "Registrar pago" }).click();

  // ── Comprobante ─────────────────────────────────────────────────────────────
  await expect(page.getByText("Pago registrado.")).toBeVisible();
  await page.getByRole("button", { name: "Compartir comprobante" }).click();
  await expect(page.getByText("Link copiado.")).toBeVisible();

  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/r\/[\w-]+/);

  // ── El alumno lo ve sin login (contexto limpio, cero cookies) ───────────────
  // El ORIGEN del link viene de NEXT_PUBLIC_APP_URL, que Next inlinea EN EL BUILD — acá
  // se normaliza al server del E2E. Lo que este flujo prueba es el TOKEN público; el
  // origen correcto por entorno lo cubren tests/auth-origins.test.ts y las env de F0.7.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(new URL(url).pathname);
  await expect(anonPage.getByRole("heading", { name: orgName })).toBeVisible();
  await expect(anonPage.getByText("$18.000").first()).toBeVisible();
  await expect(anonPage.getByText("Generado con Ritma")).toBeVisible();
  await anon.close();

  // ── Y la deuda quedó saldada ────────────────────────────────────────────────
  await page.goto("/cobranzas");
  await expect(page.getByText("Nada por cobrar")).toBeVisible();
});
