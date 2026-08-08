import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";

import { config as loadEnv } from "dotenv";

import { isProductionTarget, productionDbUrls } from "./seed-guard";

/**
 * Escenarios de testeo realistas SOBRE USUARIOS EXISTENTES (sesión de demo, agosto 2026).
 *
 * Tres personas para recorrer desde el teléfono:
 *   1. La dueña de un ESTUDIO con tres "salones" (Estudio Meraki).
 *   2. Una docente INDEPENDIENTE con su mundo chico (Clases de Folklore de {nombre}).
 *   3. La misma docente ADENTRO del estudio (membresía TEACHER + un grupo "a su cargo").
 *
 * Reglas del guion:
 * - Los datos se cuelgan de los emails de abajo; solo se crea un usuario si el email no
 *   existe (y se avisa, con la contraseña impresa).
 * - SALONES POR CONVENCIÓN DE NOMBRE ("· Salón A"): placeholder hasta que S8 traiga el
 *   modelo Space. Cero migraciones acá.
 * - DATOS LEGÍTIMOS O NADA: cuotas por `runGenerateCharges`/`runMarkOverdue` (los jobs
 *   reales), pagos por `createPayment` (imputación + recompute reales), exoneración por
 *   `waiveCharge`, recordatorios por `logReminder`. Nunca inserts crudos de plata.
 * - Idempotente: correrlo dos veces no duplica nada.
 * - Cinturón: imprime host y base de `DATABASE_URL` y pide confirmación. `--yes` la
 *   saltea (para scripts), pero NO saltea el cinturón anti-producción: si el host es el
 *   del branch de prod (según `.env.production` local), el script se niega SIEMPRE.
 *
 * Correr: `npm run seed:scenarios` (agregar `-- --yes` para saltear la confirmación).
 */

// ── Configuración: TUS usuarios de testeo ────────────────────────────────────
const STUDIO_OWNER_EMAIL = "garciaelissondo@gmail.com"; // dueña de Estudio Meraki
const DUAL_TEACHER_EMAIL = "dgarciaelissondo@gmail.com"; // docente independiente + profe en Meraki
const FALLBACK_PASSWORD = "ritma-demo-2026"; // solo si un email no existe todavía

loadEnv({ path: [".env.local", ".env"], quiet: true });

async function confirmTarget() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const url = new URL(databaseUrl);
  const target = `${url.hostname}${url.pathname}`;
  console.log(`\nBase de datos destino: ${target}`);

  // Cinturón anti-producción: NO lo saltea ni `--yes`. La referencia es el
  // `.env.production` local (gitignored; el host de prod no se commitea al repo público).
  const prodUrls = productionDbUrls(".env.production");
  if (prodUrls.length === 0) {
    console.log("(sin .env.production en esta máquina: no hay contra qué comparar el host)");
  } else if (isProductionTarget(databaseUrl, prodUrls)) {
    console.error(
      "\n✋ Ese host es el branch de PRODUCCIÓN (según .env.production). Este script se " +
        "niega a correr contra producción, incluso con --yes. Si de verdad querés " +
        "escenarios en prod, es una decisión aparte: no pasa por acá.",
    );
    process.exit(1);
  }

  if (process.argv.includes("--yes")) {
    console.log("(--yes: sin confirmación interactiva)\n");
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('¿Escribo los escenarios acá? Escribí "si" para seguir: ');
  rl.close();
  if (answer.trim().toLowerCase() !== "si" && answer.trim().toLowerCase() !== "sí") {
    console.log("Cancelado: no se escribió nada.");
    process.exit(0);
  }
}

async function main() {
  await confirmTarget();

  // Imports dinámicos DESPUÉS de dotenv (db.ts lee process.env al importarse).
  const { db, createOrganizationWithOwner } = await import("../src/lib/db");
  const { auth } = await import("../src/lib/auth");
  const { normalizeForSearch } = await import("../src/lib/students");
  const { addMonths, periodOf, todayInTz, addDays, DEFAULT_TIMEZONE } =
    await import("../src/lib/dates");
  const { runGenerateCharges } = await import("../src/server/system/generate-charges");
  const { runMarkOverdue } = await import("../src/server/system/mark-overdue");
  const { createEnrollment } = await import("../src/server/services/enrollments");
  const { waiveCharge } = await import("../src/server/services/charges");
  const { createPayment } = await import("../src/server/services/payments");
  const { logReminder } = await import("../src/server/services/reminders");

  try {
    const today = todayInTz(DEFAULT_TIMEZONE);
    const CUR = periodOf(today);
    const PREV = addMonths(CUR, -1);
    const TWO_AGO = addMonths(CUR, -2);

    // ── Usuarios (existentes, o creados con aviso) ───────────────────────────
    async function ensureUser(email: string, name: string) {
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) return existing;
      console.log(
        `⚠ El usuario ${email} no existía: lo creo con contraseña "${FALLBACK_PASSWORD}".`,
      );
      await auth.api.signUpEmail({ body: { email, password: FALLBACK_PASSWORD, name } });
      return db.user.findUniqueOrThrow({ where: { email } });
    }

    const owner = await ensureUser(STUDIO_OWNER_EMAIL, "Dolores");
    const teacher = await ensureUser(DUAL_TEACHER_EMAIL, "Dolores Garcia");
    const teacherFirstName = teacher.name.trim().split(/\s+/)[0] || "la profe";

    /**
     * GARANTÍA DE LOGIN para el recorrido: estas cuentas pueden haber nacido con Google
     * (en dev y en los previews el botón de Google no existe), así que acá se les
     * asegura una credencial email+contraseña con la clave del guion. SOLO toca a los
     * dos usuarios configurados arriba, y solo en la base que confirmaste.
     */
    async function ensureLoginPassword(user: { id: string; email: string }) {
      const ctx = await auth.$context;
      const hash = await ctx.password.hash(FALLBACK_PASSWORD);
      const credential = await db.account.findFirst({
        where: { userId: user.id, providerId: "credential" },
      });
      if (credential) {
        await db.account.update({ where: { id: credential.id }, data: { password: hash } });
      } else {
        await db.account.create({
          data: {
            id: randomUUID(),
            accountId: user.id,
            providerId: "credential",
            userId: user.id,
            password: hash,
          },
        });
      }
    }

    await ensureLoginPassword(owner);
    await ensureLoginPassword(teacher);

    // ── Organizaciones ───────────────────────────────────────────────────────
    async function ensureOrg(input: {
      ownerId: string;
      name: string;
      type: "INDEPENDENT" | "STUDIO";
      disciplines: string[];
      paymentAlias: string;
      reminderTemplate?: string;
    }) {
      const existing = await db.organization.findFirst({
        where: {
          name: input.name,
          memberships: { some: { userId: input.ownerId, role: "OWNER" } },
        },
      });
      if (existing) return existing;

      const { id } = await createOrganizationWithOwner({
        ownerId: input.ownerId,
        name: input.name,
        type: input.type,
        disciplines: input.disciplines,
      });
      return db.organization.update({
        where: { id },
        data: {
          paymentAlias: input.paymentAlias,
          reminderTemplate: input.reminderTemplate ?? null,
        },
      });
    }

    const meraki = await ensureOrg({
      ownerId: owner.id,
      name: "Estudio Meraki",
      type: "STUDIO",
      disciplines: ["Árabe", "Contemporáneo", "Folklore", "Yoga", "Canto"],
      paymentAlias: "meraki.estudio.mp",
      reminderTemplate:
        "Hola {nombre} 👋 Te acercamos el resumen de {periodo} del estudio: {monto}. " +
        "Alias: {alias}. ¡Cualquier cosa nos escribís!",
    });

    const folklore = await ensureOrg({
      ownerId: teacher.id,
      name: `Clases de Folklore de ${teacherFirstName}`,
      type: "INDEPENDENT",
      disciplines: ["Folklore"],
      paymentAlias: `${teacherFirstName.toLowerCase()}.folklore`,
      // Sin plantilla propia: ejercita la default de Marca §4.2.
    });

    // ── Escenario 3: la docente entra al estudio como TEACHER ────────────────
    await db.membership.upsert({
      where: { userId_orgId: { userId: teacher.id, orgId: meraki.id } },
      create: { userId: teacher.id, orgId: meraki.id, role: "TEACHER" },
      update: {},
    });

    // ── Alumnos ──────────────────────────────────────────────────────────────
    type StudentSpec = { name: string; phone?: string; active?: boolean };

    async function ensureStudents(orgId: string, specs: StudentSpec[]) {
      const byName = new Map<string, { id: string }>();
      for (const spec of specs) {
        let student = await db.student.findFirst({ where: { orgId, name: spec.name } });
        if (!student) {
          student = await db.student.create({
            data: {
              orgId,
              name: spec.name,
              searchName: normalizeForSearch(spec.name),
              phone: spec.phone ?? null,
              active: spec.active ?? true,
            },
          });
        }
        byName.set(spec.name, student);
      }
      return byName;
    }

    const merakiStudents = await ensureStudents(meraki.id, [
      { name: "Lola Márquez", phone: "+5491161112233" },
      { name: "Bianca Suárez", phone: "+5491162223344" },
      { name: "Federica Paz", phone: "+5491163334455" },
      { name: "Joaquín Ledesma", phone: "+5491164445566" },
      { name: "Milagros Funes", phone: "+5491165556677" },
      { name: "Catalina Ríos", phone: "+5491166667788" },
      { name: "Bruno Acosta", phone: "+5491167778899" },
      { name: "Delfina Castro", phone: "+5491168889900" },
      { name: "Emilia Vega", phone: "+5491169990011" },
      { name: "Josefina Ponce", phone: "+5491160001122" },
      { name: "Ramiro Sosa", phone: "+5491151112233" },
      { name: "Abril Domínguez", phone: "+5491152223344" },
      { name: "Paula Giordano" }, // sin teléfono: ejercita el botón deshabilitado
      { name: "Franco Medina", phone: "+5491153334455" },
      { name: "Guadalupe Torres", phone: "+5491154445566", active: false }, // baja RN9
    ]);

    const folkStudents = await ensureStudents(folklore.id, [
      { name: "Rocío Almada", phone: "+5491171112233" },
      { name: "Micaela Bravo", phone: "+5491172223344" },
      { name: "Sol Peralta", phone: "+5491173334455" },
      { name: "Ana Clara Núñez" }, // sin teléfono
      { name: "Victoria Ferreyra", phone: "+5491174445566" },
      { name: "Julián Molina", phone: "+5491175556677" },
      { name: "Carmen Ocampo", phone: "+5491176667788", active: false },
    ]);

    // ── Grupos y franjas ─────────────────────────────────────────────────────
    // SALONES POR CONVENCIÓN: el sufijo "· Salón X" es un placeholder que S8 reemplaza
    // por el modelo Space. Dos grupos a la misma hora en salones distintos, a propósito.
    type GroupSpec = {
      name: string;
      discipline: string;
      price: number;
      slots: { weekday: number; startTime: string; durationMin: number }[];
    };

    async function ensureGroups(orgId: string, specs: GroupSpec[]) {
      const byName = new Map<string, { id: string }>();
      for (const spec of specs) {
        let group = await db.classGroup.findFirst({ where: { orgId, name: spec.name } });
        if (!group) {
          const discipline = await db.discipline.findUniqueOrThrow({
            where: { orgId_name: { orgId, name: spec.discipline } },
          });
          group = await db.classGroup.create({
            data: {
              orgId,
              name: spec.name,
              disciplineId: discipline.id,
              defaultPrice: spec.price,
              slots: { create: spec.slots.map((slot) => ({ ...slot, orgId })) },
            },
          });
        }
        byName.set(spec.name, group);
      }
      return byName;
    }

    // Weekdays: 0=domingo … 6=sábado (convención JS del dominio).
    const CARGO = `Folklore norteño · Salón B · a cargo de ${teacherFirstName}`;
    const merakiGroups = await ensureGroups(meraki.id, [
      {
        name: "Yoga mañanas · Terraza",
        discipline: "Yoga",
        price: 14000,
        slots: [
          { weekday: 1, startTime: "09:00", durationMin: 60 },
          { weekday: 3, startTime: "09:00", durationMin: 60 },
        ],
      },
      // El cruce verosímil #1: martes 18:00 en Salón A y Salón B a la vez.
      {
        name: "Árabe inicial · Salón A",
        discipline: "Árabe",
        price: 18000,
        slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
      },
      {
        name: "Contemporáneo juvenil · Salón B",
        discipline: "Contemporáneo",
        price: 20000,
        slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
      },
      {
        name: "Árabe avanzado · Salón A",
        discipline: "Árabe",
        price: 24000,
        slots: [{ weekday: 4, startTime: "20:00", durationMin: 90 }],
      },
      {
        name: "Canto grupal · Salón B",
        discipline: "Canto",
        price: 16000,
        slots: [{ weekday: 5, startTime: "19:00", durationMin: 60 }],
      },
      // El cruce #2, sábado 11:00 — y el grupo "a cargo" de la docente dual: SIN
      // teacherId todavía (S9), la convención de nombre es el placeholder.
      {
        name: CARGO,
        discipline: "Folklore",
        price: 17000,
        slots: [{ weekday: 6, startTime: "11:00", durationMin: 90 }],
      },
      {
        name: "Contemporáneo adultos · Salón A",
        discipline: "Contemporáneo",
        price: 21000,
        slots: [{ weekday: 6, startTime: "11:00", durationMin: 60 }],
      },
    ]);

    // La agenda de la docente dual NO choca con su grupo del estudio (sáb 11:00):
    // sus clases propias son martes y jueves a la mañana.
    const folkGroups = await ensureGroups(folklore.id, [
      {
        name: "Folklore inicial",
        discipline: "Folklore",
        price: 12000,
        slots: [{ weekday: 2, startTime: "10:00", durationMin: 90 }],
      },
      {
        name: "Folklore avanzado",
        discipline: "Folklore",
        price: 14000,
        slots: [{ weekday: 4, startTime: "10:00", durationMin: 90 }],
      },
    ]);

    // ── Inscripciones (servicio real: crea la cuota inicial con el motor) ────
    type EnrollSpec = { student: string; group: string; startDate: string; price?: number };

    async function ensureEnrollments(
      orgId: string,
      students: Map<string, { id: string }>,
      groups: Map<string, { id: string }>,
      specs: EnrollSpec[],
    ) {
      for (const spec of specs) {
        const student = students.get(spec.student)!;
        const group = groups.get(spec.group)!;
        const existing = await db.enrollment.findFirst({
          where: { orgId, studentId: student.id, groupId: group.id, endDate: null },
        });
        if (existing) continue;
        const groupRow = await db.classGroup.findUniqueOrThrow({ where: { id: group.id } });
        await createEnrollment(orgId, {
          studentId: student.id,
          groupId: group.id,
          plan: "MONTHLY",
          price: spec.price ?? groupRow.defaultPrice.toNumber(),
          startDate: spec.startDate,
        });
      }
    }

    const first = (period: string) => `${period}-01`;

    await ensureEnrollments(meraki.id, merakiStudents, merakiGroups, [
      { student: "Lola Márquez", group: "Yoga mañanas · Terraza", startDate: first(TWO_AGO) },
      { student: "Bianca Suárez", group: "Árabe inicial · Salón A", startDate: first(TWO_AGO) },
      { student: "Federica Paz", group: "Árabe inicial · Salón A", startDate: first(PREV) },
      {
        student: "Joaquín Ledesma",
        group: "Contemporáneo juvenil · Salón B",
        startDate: first(PREV),
      },
      {
        student: "Milagros Funes",
        group: "Contemporáneo juvenil · Salón B",
        startDate: first(TWO_AGO),
      },
      { student: "Catalina Ríos", group: "Árabe avanzado · Salón A", startDate: first(PREV) },
      { student: "Bruno Acosta", group: "Árabe avanzado · Salón A", startDate: first(TWO_AGO) },
      { student: "Delfina Castro", group: "Canto grupal · Salón B", startDate: addDays(today, -4) },
      { student: "Emilia Vega", group: CARGO, startDate: first(PREV) },
      { student: "Josefina Ponce", group: CARGO, startDate: first(PREV) },
      { student: "Ramiro Sosa", group: CARGO, startDate: first(CUR) },
      {
        student: "Abril Domínguez",
        group: "Contemporáneo adultos · Salón A",
        startDate: first(TWO_AGO),
      },
      { student: "Paula Giordano", group: "Yoga mañanas · Terraza", startDate: first(PREV) },
      {
        student: "Franco Medina",
        group: "Contemporáneo adultos · Salón A",
        startDate: first(PREV),
      },
    ]);

    await ensureEnrollments(folklore.id, folkStudents, folkGroups, [
      { student: "Rocío Almada", group: "Folklore inicial", startDate: first(TWO_AGO) },
      { student: "Micaela Bravo", group: "Folklore inicial", startDate: addDays(today, -3) },
      { student: "Sol Peralta", group: "Folklore avanzado", startDate: first(PREV) },
      { student: "Ana Clara Núñez", group: "Folklore avanzado", startDate: first(PREV) },
      { student: "Victoria Ferreyra", group: "Folklore inicial", startDate: first(PREV) },
      { student: "Julián Molina", group: "Folklore avanzado", startDate: first(CUR) },
    ]);

    // ── Cuotas: LOS JOBS REALES, dos períodos + vencidas ─────────────────────
    await runGenerateCharges(PREV);
    await runGenerateCharges(CUR);
    await runMarkOverdue();

    // ── Pagos (servicio real: imputación automática/manual + recompute) ──────
    async function ensurePayment(
      orgId: string,
      students: Map<string, { id: string }>,
      studentName: string,
      input: {
        amount: number;
        method: "CASH" | "TRANSFER" | "OTHER";
        receivedBy?: "STUDIO" | "TEACHER";
        daysAgo: number;
        toPeriod?: string; // imputación manual a la cuota de ESTE período
      },
    ) {
      const student = students.get(studentName)!;
      const existing = await db.payment.findFirst({
        where: { orgId, studentId: student.id, amount: input.amount },
      });
      if (existing) return;

      let allocations: { chargeId: string; amount: number }[] | undefined;
      if (input.toPeriod) {
        const charge = await db.charge.findFirst({
          where: { orgId, period: input.toPeriod, enrollment: { studentId: student.id } },
        });
        if (charge) allocations = [{ chargeId: charge.id, amount: input.amount }];
      }

      await createPayment(orgId, {
        studentId: student.id,
        amount: input.amount,
        method: input.method,
        ...(input.receivedBy ? { receivedBy: input.receivedBy } : {}),
        paidAt: addDays(today, -input.daysAgo),
        ...(allocations ? { allocations } : {}),
      });
    }

    // Meraki: el mes de un estudio de verdad — pagas totales, una parcial, crédito,
    // una cobrada por la profe, y deuda vieja que quedó vencida.
    await ensurePayment(meraki.id, merakiStudents, "Lola Márquez", {
      amount: 28000, // PREV + CUR de yoga: las dos quedan PAID
      method: "TRANSFER",
      daysAgo: 5,
    });
    await ensurePayment(meraki.id, merakiStudents, "Bianca Suárez", {
      amount: 18000, // cubre PREV (antigua-primero): CUR queda PENDING
      method: "CASH",
      daysAgo: 3,
    });
    await ensurePayment(meraki.id, merakiStudents, "Milagros Funes", {
      amount: 45000, // PREV + CUR ($40.000) y quedan $5.000 a favor
      method: "TRANSFER",
      daysAgo: 2,
    });
    await ensurePayment(meraki.id, merakiStudents, "Delfina Castro", {
      amount: 8000, // la mitad de su única cuota (CUR, vence el 10): PARTIAL
      method: "CASH",
      daysAgo: 1,
      toPeriod: CUR,
    });
    await ensurePayment(meraki.id, merakiStudents, "Emilia Vega", {
      amount: 34000, // PREV + CUR del grupo a cargo: cobrada POR LA PROFE (RN5)
      method: "TRANSFER",
      receivedBy: "TEACHER",
      daysAgo: 2,
    });
    // Catalina: beca — la cuota de PREV se exonera por el servicio real (sin pagos).
    const catalina = merakiStudents.get("Catalina Ríos")!;
    const catalinaPrev = await db.charge.findFirst({
      where: {
        orgId: meraki.id,
        period: PREV,
        enrollment: { studentId: catalina.id },
        status: { in: ["PENDING", "OVERDUE"] },
        allocations: { none: {} },
      },
    });
    if (catalinaPrev) await waiveCharge(meraki.id, catalinaPrev.id);

    // Independiente: el mundo chico con estados mezclados.
    await ensurePayment(folklore.id, folkStudents, "Rocío Almada", {
      amount: 24000, // PREV + CUR: al día
      method: "TRANSFER",
      daysAgo: 4,
    });
    await ensurePayment(folklore.id, folkStudents, "Micaela Bravo", {
      amount: 6000, // mitad de su cuota de alta (CUR): PARTIAL
      method: "CASH",
      daysAgo: 1,
      toPeriod: CUR,
    });
    await ensurePayment(folklore.id, folkStudents, "Victoria Ferreyra", {
      amount: 12000, // solo PREV: CUR pendiente
      method: "CASH",
      daysAgo: 2,
    });
    // Sol, Ana Clara y Julián deben: vencidas de PREV y/o pendientes de CUR.

    // ── Recordatorios (servicio real, log honesto) ───────────────────────────
    async function ensureReminder(
      orgId: string,
      students: Map<string, { id: string }>,
      studentName: string,
      channel: "WHATSAPP_LINK" | "EMAIL",
    ) {
      const student = students.get(studentName)!;
      const existing = await db.reminderLog.findFirst({
        where: { orgId, studentId: student.id, channel },
      });
      if (existing) return;
      await logReminder(orgId, { studentId: student.id, channel });
    }

    await ensureReminder(meraki.id, merakiStudents, "Joaquín Ledesma", "WHATSAPP_LINK");
    await ensureReminder(meraki.id, merakiStudents, "Josefina Ponce", "WHATSAPP_LINK");
    await ensureReminder(folklore.id, folkStudents, "Sol Peralta", "WHATSAPP_LINK");

    // ── Resumen ──────────────────────────────────────────────────────────────
    for (const org of [meraki, folklore]) {
      const charges = await db.charge.groupBy({
        by: ["status"],
        where: { orgId: org.id },
        _count: true,
      });
      const summary = charges
        .map((row) => `${row.status.toLowerCase()}: ${row._count}`)
        .join(" · ");
      console.log(
        `${org.name} — alumnos: ${await db.student.count({ where: { orgId: org.id } })} · ` +
          `grupos: ${await db.classGroup.count({ where: { orgId: org.id } })} · ` +
          `cuotas: ${await db.charge.count({ where: { orgId: org.id } })} (${summary}) · ` +
          `pagos: ${await db.payment.count({ where: { orgId: org.id } })} · ` +
          `recordatorios: ${await db.reminderLog.count({ where: { orgId: org.id } })}`,
      );
    }
    console.log(
      `\nPersonas del recorrido (guion en docs/observaciones-demo.md):\n` +
        `  1. ${STUDIO_OWNER_EMAIL} → Estudio Meraki (dueña)\n` +
        `  2. ${DUAL_TEACHER_EMAIL} → Clases de Folklore de ${teacherFirstName} (titular)\n` +
        `  3. ${DUAL_TEACHER_EMAIL} → cambia a Estudio Meraki con el selector de "Más" (profe)\n\n` +
        `Las DOS cuentas entran con email + contraseña: "${FALLBACK_PASSWORD}"\n` +
        `(la credencial se asegura en cada corrida; en dev/preview no hay botón de Google).\n`,
    );
  } finally {
    const { db } = await import("../src/lib/db");
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
