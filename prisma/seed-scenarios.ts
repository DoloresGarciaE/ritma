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
 * - SALONES: desde S8 son entidad real (Space + spaceId) — el sufijo "· Salón X" murió;
 *   la migración S8 convirtió los nombres viejos y acá los grupos nacen limpios.
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

  // Cinturón anti-producción: NO lo saltea ni `--yes`. La referencia es doble: el endpoint
  // de prod fijado en seed-guard.ts (funciona en cualquier máquina) + `.env.production`
  // local si existe (por si prod cambia de endpoint antes de actualizar el código).
  const prodUrls = productionDbUrls(".env.production");
  if (isProductionTarget(databaseUrl, prodUrls)) {
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
      ownerName: string;
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
        ownerName: input.ownerName,
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
      ownerName: owner.name,
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
      ownerName: teacher.name,
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

    // Su perfil docente en Meraki (S7): STAFF, vinculado a su cuenta — lo mismo que
    // dejaría aceptar una invitación. El de la dueña ya existe (createOrganizationWithOwner
    // lo crea; el backfill de la migración S7 cubrió las orgs pre-existentes).
    const dualProfile = await db.teacherProfile.upsert({
      where: { orgId_membershipUserId: { orgId: meraki.id, membershipUserId: teacher.id } },
      update: { displayName: teacher.name, kind: "STAFF" },
      create: {
        orgId: meraki.id,
        membershipUserId: teacher.id,
        displayName: teacher.name,
        kind: "STAFF",
      },
    });
    const merakiOwnerProfile = await db.teacherProfile.upsert({
      where: { orgId_membershipUserId: { orgId: meraki.id, membershipUserId: owner.id } },
      update: {},
      create: {
        orgId: meraki.id,
        membershipUserId: owner.id,
        displayName: owner.name,
        kind: "OWNER_TEACHER",
      },
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

    // ── Salones (S8): entidad real, ya sin convención de nombre ──────────────
    async function ensureSpaces(orgId: string, names: string[]) {
      const byName = new Map<string, string>();
      for (const name of names) {
        const space = await db.space.upsert({
          where: { orgId_name: { orgId, name } },
          update: {},
          create: { orgId, name },
        });
        byName.set(name, space.id);
      }
      return byName;
    }

    const merakiSpaces = await ensureSpaces(meraki.id, ["Salón A", "Salón B", "Terraza"]);

    // ── Grupos y franjas ─────────────────────────────────────────────────────
    // Desde S8 el salón es dato (`spaceId`), no sufijo del nombre: la migración
    // convirtió los nombres viejos; acá los grupos nacen limpios y asignados.
    type GroupSpec = {
      name: string;
      discipline: string;
      price: number;
      salon?: string;
      slots: { weekday: number; startTime: string; durationMin: number }[];
    };

    async function ensureGroups(orgId: string, specs: GroupSpec[], spaces?: Map<string, string>) {
      const byName = new Map<string, { id: string }>();
      for (const spec of specs) {
        const spaceId = spec.salon ? (spaces?.get(spec.salon) ?? null) : null;
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
              spaceId,
              slots: { create: spec.slots.map((slot) => ({ ...slot, orgId })) },
            },
          });
        } else if (group.spaceId !== spaceId) {
          // Idempotente: si el grupo ya existe (o lo heredó la migración), el salón se
          // realinea con el spec sin tocar nada más.
          await db.classGroup.update({ where: { id: group.id }, data: { spaceId } });
        }
        byName.set(spec.name, group);
      }
      return byName;
    }

    // Weekdays: 0=domingo … 6=sábado (convención JS del dominio).
    //
    // Los nombres LEGADOS (el "a cargo de" de S2 y los sufijos "· Salón X" pre-S8) se
    // renombran si todavía existen — no se duplica: ensureGroups busca por nombre. La
    // migración S8 ya limpió los sufijos; esto cubre una base sembrada entre medio.
    const CARGO = "Folklore norteño";
    await db.classGroup.updateMany({
      where: {
        orgId: meraki.id,
        name: {
          in: [
            `Folklore norteño · Salón B · a cargo de ${teacherFirstName}`,
            "Folklore norteño · Salón B",
          ],
        },
      },
      data: { name: CARGO },
    });
    const merakiGroups = await ensureGroups(
      meraki.id,
      [
        {
          name: "Yoga mañanas",
          discipline: "Yoga",
          price: 14000,
          salon: "Terraza",
          slots: [
            { weekday: 1, startTime: "09:00", durationMin: 60 },
            { weekday: 3, startTime: "09:00", durationMin: 60 },
          ],
        },
        // El cruce verosímil #1: martes 18:00 en Salón A y Salón B a la vez — desde S8,
        // salones DISTINTOS de verdad: legítimo y en silencio.
        {
          name: "Árabe inicial",
          discipline: "Árabe",
          price: 18000,
          salon: "Salón A",
          slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
        },
        {
          name: "Contemporáneo juvenil",
          discipline: "Contemporáneo",
          price: 20000,
          salon: "Salón B",
          slots: [{ weekday: 2, startTime: "18:00", durationMin: 60 }],
        },
        {
          name: "Árabe avanzado",
          discipline: "Árabe",
          price: 24000,
          salon: "Salón A",
          slots: [{ weekday: 4, startTime: "20:00", durationMin: 90 }],
        },
        {
          name: "Canto grupal",
          discipline: "Canto",
          price: 16000,
          salon: "Salón B",
          slots: [{ weekday: 5, startTime: "19:00", durationMin: 60 }],
        },
        // El cruce #2, sábado 11:00 — salones distintos: también legítimo.
        {
          name: CARGO,
          discipline: "Folklore",
          price: 17000,
          salon: "Salón B",
          slots: [{ weekday: 6, startTime: "11:00", durationMin: 90 }],
        },
        {
          name: "Contemporáneo adultos",
          discipline: "Contemporáneo",
          price: 21000,
          salon: "Salón A",
          slots: [{ weekday: 6, startTime: "11:00", durationMin: 60 }],
        },
        // El cruce EN EL MISMO salón, dejado A PROPÓSITO (S8): sábado 12:00–12:30 pisa
        // a Folklore norteño (11:00–12:30) en Salón B — el calendario lo muestra lado a
        // lado y editar cualquiera de los dos dispara el aviso fuerte de la demo.
        {
          name: "Canto infantil",
          discipline: "Canto",
          price: 12000,
          salon: "Salón B",
          slots: [{ weekday: 6, startTime: "12:00", durationMin: 60 }],
        },
      ],
      merakiSpaces,
    );

    // ── Asignación de profes (S7): el corazón del escenario dual ─────────────
    // La docente tiene SOLO Folklore norteño: su mundo en Meraki es ese grupo, sus
    // alumnas y sus cobranzas. La dueña dicta el resto — menos "Canto grupal" y
    // "Contemporáneo juvenil", que quedan SIN profe a propósito: el indicador de
    // owner/admin necesita datos, y la dueña NO puede dictar el martes 18:00 en dos
    // salones a la vez — el eje por profe de S8 (con razón) lo marcaría imposible.
    // Así el cruce del martes queda como lo que es: dos salones, dos clases, y un
    // grupo esperando al próximo profe que se invite.
    await db.classGroup.updateMany({
      where: { orgId: meraki.id, name: CARGO },
      data: { teacherId: dualProfile.id },
    });
    await db.classGroup.updateMany({
      where: { orgId: meraki.id, name: { in: ["Canto grupal", "Contemporáneo juvenil"] } },
      data: { teacherId: null },
    });
    await db.classGroup.updateMany({
      where: {
        orgId: meraki.id,
        name: { notIn: [CARGO, "Canto grupal", "Contemporáneo juvenil"] },
      },
      data: { teacherId: merakiOwnerProfile.id },
    });

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

    // En la independiente, todos los grupos son de su dueña (el auto del alcance 4).
    const folkOwnerProfile = await db.teacherProfile.findFirstOrThrow({
      where: { orgId: folklore.id, membershipUserId: teacher.id },
    });
    await db.classGroup.updateMany({
      where: { orgId: folklore.id },
      data: { teacherId: folkOwnerProfile.id },
    });

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
        await createEnrollment(
          orgId,
          { kind: "all" },
          {
            studentId: student.id,
            groupId: group.id,
            plan: "MONTHLY",
            price: spec.price ?? groupRow.defaultPrice.toNumber(),
            startDate: spec.startDate,
          },
        );
      }
    }

    const first = (period: string) => `${period}-01`;

    await ensureEnrollments(meraki.id, merakiStudents, merakiGroups, [
      { student: "Lola Márquez", group: "Yoga mañanas", startDate: first(TWO_AGO) },
      { student: "Bianca Suárez", group: "Árabe inicial", startDate: first(TWO_AGO) },
      { student: "Federica Paz", group: "Árabe inicial", startDate: first(PREV) },
      {
        student: "Joaquín Ledesma",
        group: "Contemporáneo juvenil",
        startDate: first(PREV),
      },
      {
        student: "Milagros Funes",
        group: "Contemporáneo juvenil",
        startDate: first(TWO_AGO),
      },
      { student: "Catalina Ríos", group: "Árabe avanzado", startDate: first(PREV) },
      { student: "Bruno Acosta", group: "Árabe avanzado", startDate: first(TWO_AGO) },
      { student: "Delfina Castro", group: "Canto grupal", startDate: addDays(today, -4) },
      { student: "Emilia Vega", group: CARGO, startDate: first(PREV) },
      { student: "Josefina Ponce", group: CARGO, startDate: first(PREV) },
      { student: "Ramiro Sosa", group: CARGO, startDate: first(CUR) },
      {
        student: "Abril Domínguez",
        group: "Contemporáneo adultos",
        startDate: first(TWO_AGO),
      },
      { student: "Paula Giordano", group: "Yoga mañanas", startDate: first(PREV) },
      {
        student: "Franco Medina",
        group: "Contemporáneo adultos",
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

      await createPayment(
        orgId,
        { kind: "all" },
        {
          studentId: student.id,
          amount: input.amount,
          method: input.method,
          ...(input.receivedBy ? { receivedBy: input.receivedBy } : {}),
          paidAt: addDays(today, -input.daysAgo),
          ...(allocations ? { allocations } : {}),
        },
      );
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
      await logReminder(orgId, { kind: "all" }, { studentId: student.id, channel });
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
