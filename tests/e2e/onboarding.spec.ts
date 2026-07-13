import { expect, test } from "@playwright/test";

/**
 * El único smoke E2E (Plan §9): el camino que hace todo usuario nuevo, de punta a punta y
 * contra Postgres real — registro → wizard de 3 pasos → dashboard con su CTA.
 *
 * Si esto pasa, están vivos: Better Auth (cookie de sesión), el Proxy, la guardia del layout
 * de (app), la server action que crea la organización en una transacción y el shell.
 */
test("un usuario nuevo se registra, crea su organización y llega al dashboard", async ({
  page,
}) => {
  // Email único por corrida: la base no se trunca entre el build y el test.
  const email = `malena+${Date.now()}@ritma.test`;

  // ── Registro ────────────────────────────────────────────────────────────────
  await page.goto("/registro");

  await page.getByLabel("Nombre y apellido").fill("Malena Ríos");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("una-clave-larga");
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  // Sin organización, quien se registra cae en el wizard (no en el dashboard).
  await expect(page).toHaveURL(/\/crear-organizacion$/);

  // ── Wizard, paso 1: nombre ──────────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: "¿Cómo se llama tu espacio?" })).toBeVisible();
  await page.getByLabel("Nombre").fill("Danzas Malena");
  await page.getByRole("button", { name: "Continuar" }).click();

  // ── Wizard, paso 2: tipo de organización ────────────────────────────────────
  await expect(page.getByRole("heading", { name: "¿Cómo trabajás?" })).toBeVisible();
  await page.getByRole("radio", { name: "Trabajo por mi cuenta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // ── Wizard, paso 3: disciplinas ─────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: "¿Qué enseñás?" })).toBeVisible();
  await page.getByRole("button", { name: "Árabe" }).click();
  await page.getByRole("button", { name: "Crear organización" }).click();

  // ── Dashboard ───────────────────────────────────────────────────────────────
  await expect(page).toHaveURL(/\/dashboard$/);
  // La app bar la compone la página con datos reales: el nombre sale de la base.
  await expect(page.getByRole("heading", { name: "Danzas Malena" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Creá tu primer grupo" })).toBeVisible();
});
