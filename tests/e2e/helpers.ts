import { expect, type Page } from "@playwright/test";

/**
 * Setup compartido de los E2E de flujo (F1/F2): cada spec arma SUS datos por el camino
 * real — registro → wizard → grupo → alumno → inscripción (que crea la cuota inicial con
 * el motor de S3). Nada se siembra por atrás: si el camino de alta se rompe, el E2E
 * también lo cuenta.
 */

/** Registro + wizard. El nombre de la org lleva el timestamp: único por corrida. */
export async function registerWithOrg(page: Page, label: string): Promise<{ orgName: string }> {
  const stamp = Date.now();
  const orgName = `Danzas ${label} ${stamp}`;

  await page.goto("/registro");
  await page.getByLabel("Nombre y apellido").fill("Malena Ríos");
  await page.getByLabel("Email").fill(`malena+${label.toLowerCase()}-${stamp}@ritma.test`);
  // `exact` porque getByLabel matchea por substring: el botón de ver/ocultar del campo
  // lleva aria-label "Mostrar contraseña" y sin esto el locator resuelve a dos elementos.
  await page.getByLabel("Contraseña", { exact: true }).fill("una-clave-larga");
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(page).toHaveURL(/\/crear-organizacion$/);
  await page.getByLabel("Nombre").fill(orgName);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("radio", { name: "Trabajo por mi cuenta" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Árabe" }).click();
  await page.getByRole("button", { name: "Crear organización" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  return { orgName };
}

/** Grupo con la franja default (lunes 19:00, 60′) y tarifa $18.000. */
export async function createGroup(page: Page, name: string): Promise<void> {
  await page.goto("/agenda?nuevo=grupo");
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Nombre del grupo").fill(name);
  await sheet.getByRole("button", { name: "Árabe", exact: true }).click();
  await sheet.getByLabel("Tarifa de referencia").fill("18000");
  await sheet.getByRole("button", { name: "Crear grupo" }).click();
  // El grupo aparece en la semana: el alta cerró el círculo.
  await expect(page.getByText(name).first()).toBeVisible();
}

/** Alta express del padrón (HU2.3). */
export async function createStudent(
  page: Page,
  student: { name: string; phone?: string },
): Promise<void> {
  await page.goto("/alumnos");
  await page.getByRole("button", { name: "Nuevo alumno" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Nombre y apellido").fill(student.name);
  if (student.phone) await sheet.getByLabel("WhatsApp").fill(student.phone);
  await sheet.getByRole("button", { name: "Guardar alumno" }).click();
  await expect(page.getByRole("link", { name: new RegExp(student.name) })).toBeVisible();
}

/**
 * Inscripción desde la ficha (HU4.1): crea la cuota inicial del período en curso con el
 * MISMO motor que el cron (S3) — el deudor de F1/F2 nace acá.
 */
export async function enrollFromStudentPage(
  page: Page,
  input: { studentName: string; groupName: string },
): Promise<void> {
  await page.goto("/alumnos");
  await page.getByRole("link", { name: new RegExp(input.studentName) }).click();
  await expect(page).toHaveURL(/\/alumnos\/[\w-]+$/);

  await page.getByRole("button", { name: "Inscribir a un grupo" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: input.groupName, exact: true }).click();
  // El precio llega PRE-CARGADO con la tarifa del grupo — no se tipea (un fill sobre el
  // AmountInput controlado concatena dígitos): se verifica y va.
  await expect(sheet.getByLabel("Precio")).toHaveValue("18.000");
  await sheet.getByRole("button", { name: "Inscribir", exact: true }).click();

  // La cuota inicial quedó en el estado de cuenta (el cron de mora no corre acá:
  // recién nacida siempre es Pendiente).
  await expect(page.getByText("Pendiente").first()).toBeVisible();
}
