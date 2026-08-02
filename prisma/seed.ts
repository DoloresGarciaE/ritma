import { config as loadEnv } from "dotenv";

/**
 * Seed idempotente: se puede correr todas las veces que haga falta sin duplicar
 * nada. Siembra las dos organizaciones de los casos de uso del Plan (§2, §3):
 * una profe independiente y un estudio con varios profes.
 *
 * Los dos owners quedan con una contraseña de DESARROLLO (ver README) para poder
 * entrar a la app. El hash lo hace Better Auth: acá no se inventa nada de auth.
 */

// `prisma db seed` ya hereda las variables que cargó prisma.config.ts, pero esto
// permite correr `tsx prisma/seed.ts` a mano.
loadEnv({ path: [".env.local", ".env"], quiet: true });

/** Solo para desarrollo. En producción nadie se registra por acá. */
const DEV_PASSWORD = "ritma-dev-2026";

const ORG_INDEPENDIENTE = "seed_org_independiente";
const ORG_ESTUDIO = "seed_org_estudio";

const SEED_USERS = [
  { email: "malena@example.com", name: "Malena Ríos", orgId: ORG_INDEPENDIENTE, role: "OWNER" },
  { email: "carla@example.com", name: "Carla Duarte", orgId: ORG_ESTUDIO, role: "OWNER" },
  // Staff del estudio: un profe (TEACHER) para que los tests de roles y la matriz §4 tengan
  // datos realistas (owner ≠ teacher). En la org independiente el owner es el único profe.
  { email: "sofia@example.com", name: "Sofía Herrera", orgId: ORG_ESTUDIO, role: "TEACHER" },
] as const;

/** Disciplinas de cada org. El unique [orgId, name] las hace idempotentes. */
const SEED_DISCIPLINES: Record<string, string[]> = {
  [ORG_INDEPENDIENTE]: ["Árabe", "Folklore"],
  [ORG_ESTUDIO]: ["Árabe", "Contemporáneo", "Funcional", "Canto"],
};

/**
 * El padrón de alumnos (S1). Hay de todo a propósito, porque es lo que hay en la vida real:
 * alguien sin teléfono, alguien dado de baja, y nombres con tilde y con ñ para que la
 * búsqueda se pueda probar de verdad.
 */
const SEED_STUDENTS: Record<string, { name: string; phone?: string; active?: boolean }[]> = {
  [ORG_INDEPENDIENTE]: [
    { name: "Sofía Herrera", phone: "+541155554433" },
    { name: "Camila Peña", phone: "+541144332211" },
    { name: "Julieta Ibáñez", phone: "+541166778899" },
    { name: "Valentina Ruiz" }, // sin teléfono: se anotó por Instagram
    { name: "Martina Álvarez", phone: "+541122334455", active: false }, // dejó en marzo
  ],
  [ORG_ESTUDIO]: [
    { name: "Lucía Fernández", phone: "+541133224455" },
    { name: "Iñaki Gómez", phone: "+541199887766" },
    { name: "Renata Do Santos", phone: "+541155667788" },
    { name: "Tomás Quiroga" }, // sin teléfono
    { name: "Agustina Bianchi", phone: "+541177889900", active: false },
  ],
};

/**
 * La agenda (S2): grupos con franjas realistas. "Árabe inicial" y "Contemporáneo juvenil"
 * son los de dos días por semana; "Canto grupal" está inactivo para probar el acceso
 * "Grupos" y el filtro de la agenda.
 */
const SEED_GROUPS: Record<
  string,
  {
    name: string;
    discipline: string;
    price: number;
    active?: boolean;
    slots: { weekday: number; startTime: string; durationMin: number }[];
  }[]
> = {
  [ORG_INDEPENDIENTE]: [
    {
      name: "Árabe inicial",
      discipline: "Árabe",
      price: 18000,
      slots: [
        { weekday: 2, startTime: "18:00", durationMin: 60 },
        { weekday: 4, startTime: "18:00", durationMin: 60 },
      ],
    },
    {
      name: "Árabe intermedio",
      discipline: "Árabe",
      price: 20000,
      slots: [{ weekday: 3, startTime: "19:30", durationMin: 90 }],
    },
    {
      name: "Folklore adultos",
      discipline: "Folklore",
      price: 15000,
      slots: [{ weekday: 6, startTime: "10:00", durationMin: 90 }],
    },
  ],
  [ORG_ESTUDIO]: [
    {
      name: "Contemporáneo juvenil",
      discipline: "Contemporáneo",
      price: 22000,
      slots: [
        { weekday: 1, startTime: "17:00", durationMin: 60 },
        { weekday: 3, startTime: "17:00", durationMin: 60 },
      ],
    },
    {
      name: "Árabe avanzado",
      discipline: "Árabe",
      price: 24000,
      slots: [{ weekday: 4, startTime: "20:00", durationMin: 90 }],
    },
    {
      name: "Funcional mañanas",
      discipline: "Funcional",
      price: 16000,
      slots: [{ weekday: 2, startTime: "08:30", durationMin: 45 }],
    },
    {
      name: "Canto grupal",
      discipline: "Canto",
      price: 19000,
      active: false,
      slots: [{ weekday: 5, startTime: "18:30", durationMin: 60 }],
    },
  ],
};

async function main() {
  // Import dinámico y no estático: db.ts y auth.ts leen process.env al importarse,
  // así que tienen que cargarse DESPUÉS de dotenv (los import se hoistean).
  const { db } = await import("../src/lib/db");
  const { auth } = await import("../src/lib/auth");

  try {
    await db.organization.upsert({
      where: { id: ORG_INDEPENDIENTE },
      update: { name: "Danzas Malena" },
      create: {
        id: ORG_INDEPENDIENTE,
        name: "Danzas Malena",
        type: "INDEPENDENT",
        // currency, timezone y dueDay quedan en los defaults del schema
        // (ARS, America/Argentina/Buenos_Aires, 10): son los de HU1.2.
      },
    });

    await db.organization.upsert({
      where: { id: ORG_ESTUDIO },
      update: { name: "Estudio Compás" },
      create: { id: ORG_ESTUDIO, name: "Estudio Compás", type: "STUDIO" },
    });

    for (const { email, name, orgId, role } of SEED_USERS) {
      const existing = await db.user.findUnique({
        where: { email },
        include: { accounts: { where: { providerId: "credential" } } },
      });

      // El seed de F0.3 creó estos usuarios sin contraseña. Los borramos para que
      // Better Auth los cree de nuevo con su credencial (las membresías caen por
      // cascada y se vuelven a crear abajo). Idempotente: si ya tienen credencial,
      // no se toca nada.
      if (existing && existing.accounts.length === 0) {
        await db.user.delete({ where: { id: existing.id } });
      }

      if (!existing || existing.accounts.length === 0) {
        await auth.api.signUpEmail({ body: { email, name, password: DEV_PASSWORD } });
      }

      const user = await db.user.findUniqueOrThrow({ where: { email } });

      await db.membership.upsert({
        where: { userId_orgId: { userId: user.id, orgId } },
        update: { role },
        create: { userId: user.id, orgId, role },
      });
    }

    for (const [orgId, names] of Object.entries(SEED_DISCIPLINES)) {
      await db.discipline.createMany({
        data: names.map((name) => ({ orgId, name })),
        skipDuplicates: true,
      });
    }

    // Alumnos (S1). Student no tiene un unique natural (dos alumnos pueden llamarse igual),
    // así que la idempotencia se resuelve buscando por [orgId, name] antes de crear.
    const { normalizeForSearch } = await import("../src/lib/students");

    for (const [orgId, students] of Object.entries(SEED_STUDENTS)) {
      for (const { name, phone, active } of students) {
        const existing = await db.student.findFirst({ where: { orgId, name } });
        if (existing) continue;

        await db.student.create({
          data: {
            orgId,
            name,
            searchName: normalizeForSearch(name),
            phone: phone ?? null,
            active: active ?? true,
          },
        });
      }
    }

    // Grupos y franjas (S2). Como Student: sin unique natural, la idempotencia se
    // resuelve buscando por [orgId, name] — si el grupo existe, se saltea entero.
    for (const [orgId, groups] of Object.entries(SEED_GROUPS)) {
      for (const { name, discipline, price, active, slots } of groups) {
        const existing = await db.classGroup.findFirst({ where: { orgId, name } });
        if (existing) continue;

        const disciplineRow = await db.discipline.findUniqueOrThrow({
          where: { orgId_name: { orgId, name: discipline } },
        });

        await db.classGroup.create({
          data: {
            orgId,
            name,
            disciplineId: disciplineRow.id,
            defaultPrice: price,
            active: active ?? true,
            slots: { create: slots.map((slot) => ({ ...slot, orgId })) },
          },
        });
      }
    }

    // Excepciones de ESTA semana, con los helpers reales del dominio: el DoD de S2 es
    // "la semana del profe se ve correcta, feriado cancelado incluido". El upsert por
    // [slotId, date] las hace idempotentes; corridas en semanas distintas van dejando
    // historial realista.
    const { addDays, civilToDb, mondayOf, todayInTz } = await import("../src/lib/dates");

    async function seedException(
      orgId: string,
      groupName: string,
      weekday: number,
      changes: {
        status: "SCHEDULED" | "CANCELLED";
        note?: string;
        movedTo?: { days: number; startTime: string };
      },
    ) {
      const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
      const weekStart = mondayOf(todayInTz(org.timezone));

      const group = await db.classGroup.findFirstOrThrow({ where: { orgId, name: groupName } });
      const slot = await db.scheduleSlot.findFirstOrThrow({
        where: { groupId: group.id, weekday },
      });

      const date = addDays(weekStart, (weekday + 6) % 7);
      const movedToDate = changes.movedTo ? addDays(weekStart, changes.movedTo.days) : null;

      await db.classSession.upsert({
        where: { slotId_date: { slotId: slot.id, date: civilToDb(date) } },
        update: {},
        create: {
          orgId,
          groupId: group.id,
          slotId: slot.id,
          date: civilToDb(date),
          status: changes.status,
          note: changes.note ?? null,
          movedToDate: movedToDate ? civilToDb(movedToDate) : null,
          movedToStartTime: changes.movedTo?.startTime ?? null,
        },
      });
    }

    // El feriado del DoD: el martes de "Árabe inicial", cancelado.
    await seedException(ORG_INDEPENDIENTE, "Árabe inicial", 2, {
      status: "CANCELLED",
      note: "Feriado",
    });
    // Una reprogramada para QA manual: el lunes de "Contemporáneo juvenil" → jueves 18:00.
    await seedException(ORG_ESTUDIO, "Contemporáneo juvenil", 1, {
      status: "SCHEDULED",
      movedTo: { days: 3, startTime: "18:00" },
    });

    // ── Inscripciones y cuotas (S3) ──────────────────────────────────────────
    //
    // El DoD del bloque: "al simular el cambio de mes en seed, las cuotas correctas
    // aparecen con el estado correcto". Acá se simula DE VERDAD: las inscripciones se
    // siembran con altas relativas a hoy, y las cuotas de los DOS últimos períodos las
    // generan LOS MISMOS jobs del cron (`runGenerateCharges` × 2 + `runMarkOverdue`) —
    // idempotentes por el unique (enrollmentId, period), así que re-correr el seed no
    // duplica nada. Estados resultantes: al día (el período actual, sin vencer), vencidas
    // (el anterior, sin pagos hasta S4), una exonerada (beca), y una clase suelta.
    const { addMonths, dateInPeriod, periodOf } = await import("../src/lib/dates");
    const { runGenerateCharges } = await import("../src/server/system/generate-charges");
    const { runMarkOverdue } = await import("../src/server/system/mark-overdue");
    const { waiveCharge } = await import("../src/server/services/charges");

    const todayAr = todayInTz("America/Argentina/Buenos_Aires");
    const CUR = periodOf(todayAr);
    const PREV = addMonths(CUR, -1);
    const TWO_AGO = addMonths(CUR, -2);

    /**
     * Historias por org: quién, a qué grupo, con qué plan y desde cuándo. El precio
     * hereda la tarifa del grupo salvo pacto distinto (HU4.1). `endDate` = baja RN9.
     */
    const SEED_ENROLLMENTS: Record<
      string,
      {
        student: string;
        group: string;
        plan?: "MONTHLY" | "DROP_IN";
        price?: number;
        startDate: string;
        endDate?: string;
      }[]
    > = {
      [ORG_INDEPENDIENTE]: [
        // Dos períodos de historia: la del mes pasado ya venció (no hay pagos hasta S4).
        { student: "Sofía Herrera", group: "Árabe inicial", startDate: `${TWO_AGO}-01` },
        // La misma alumna en dos grupos: dos conceptos en Deudores.
        { student: "Camila Peña", group: "Árabe inicial", startDate: `${TWO_AGO}-01` },
        { student: "Camila Peña", group: "Folklore adultos", startDate: `${PREV}-01` },
        // La beca: su cuota del mes pasado se exonera más abajo (RN3).
        { student: "Julieta Ibáñez", group: "Árabe intermedio", startDate: `${PREV}-01` },
        // Alta a mitad de ESTE mes: cuota completa, editable (RN2).
        { student: "Valentina Ruiz", group: "Árabe inicial", startDate: dateInPeriod(CUR, 15) },
        // Clase suelta hace 3 días: cargo único, vence a los 7 (propuesta RN11).
        {
          student: "Valentina Ruiz",
          group: "Folklore adultos",
          plan: "DROP_IN",
          price: 9000,
          startDate: addDays(todayAr, -3),
        },
        // Se fue hace meses (RN9): la inscripción cerrada queda, sin cuotas nuevas.
        {
          student: "Martina Álvarez",
          group: "Folklore adultos",
          startDate: `${addMonths(CUR, -5)}-01`,
          endDate: dateInPeriod(addMonths(CUR, -3), 28),
        },
      ],
      [ORG_ESTUDIO]: [
        { student: "Lucía Fernández", group: "Contemporáneo juvenil", startDate: `${TWO_AGO}-01` },
        { student: "Iñaki Gómez", group: "Árabe avanzado", startDate: `${PREV}-01` },
        // Precio pactado distinto de la tarifa del grupo (HU4.1: editable por alumno).
        {
          student: "Renata Do Santos",
          group: "Funcional mañanas",
          price: 14000,
          startDate: dateInPeriod(CUR, 10),
        },
        // Baja a MITAD del mes pasado: ese período todavía generó su cuota (RN9).
        {
          student: "Tomás Quiroga",
          group: "Contemporáneo juvenil",
          startDate: `${TWO_AGO}-01`,
          endDate: dateInPeriod(PREV, 15),
        },
      ],
    };

    for (const [orgId, enrollments] of Object.entries(SEED_ENROLLMENTS)) {
      for (const { student, group, plan, price, startDate, endDate } of enrollments) {
        const studentRow = await db.student.findFirstOrThrow({
          where: { orgId, name: student },
        });
        const groupRow = await db.classGroup.findFirstOrThrow({ where: { orgId, name: group } });

        // Sin unique natural (un alumno puede re-inscribirse): idempotencia por
        // [orgId, studentId, groupId] — si existe, se saltea entera.
        const existing = await db.enrollment.findFirst({
          where: { orgId, studentId: studentRow.id, groupId: groupRow.id },
        });
        if (existing) continue;

        await db.enrollment.create({
          data: {
            orgId,
            studentId: studentRow.id,
            groupId: groupRow.id,
            plan: plan ?? "MONTHLY",
            price: price ?? groupRow.defaultPrice,
            startDate: civilToDb(startDate),
            endDate: endDate ? civilToDb(endDate) : null,
          },
        });

        // La clase suelta nace con su cargo único (RN11): el cron nunca la toca.
        if (plan === "DROP_IN") {
          const enrollment = await db.enrollment.findFirstOrThrow({
            where: { orgId, studentId: studentRow.id, groupId: groupRow.id },
          });
          const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
          await db.charge.upsert({
            where: {
              enrollmentId_period: { enrollmentId: enrollment.id, period: periodOf(startDate) },
            },
            update: {},
            create: {
              orgId,
              enrollmentId: enrollment.id,
              period: periodOf(startDate),
              amount: price ?? groupRow.defaultPrice,
              currency: org.currency,
              dueDate: civilToDb(addDays(startDate, 7)),
            },
          });
        }
      }
    }

    // El cambio de mes, simulado con los jobs REALES: el mes pasado (como si el cron
    // hubiera corrido el día 1), este mes, y el chequeo diario de vencidas.
    await runGenerateCharges(PREV);
    await runGenerateCharges(CUR);
    await runMarkOverdue();

    // La beca (RN3): la cuota del mes pasado de Julieta, exonerada con el servicio real.
    const becaCharge = await db.charge.findFirst({
      where: {
        orgId: ORG_INDEPENDIENTE,
        period: PREV,
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        enrollment: { student: { name: "Julieta Ibáñez" } },
      },
    });
    if (becaCharge) await waiveCharge(ORG_INDEPENDIENTE, becaCharge.id);

    // ── Pagos (S4) ───────────────────────────────────────────────────────────
    //
    // Registrados con el SERVICIO real (createPayment): imputación automática
    // antigua-primero, transacción, recálculo de estados — el seed cuenta exactamente lo
    // que contaría un mes de uso. Idempotencia: un pago no tiene unique natural, así que
    // se saltea si ya existe uno del mismo alumno por el mismo monto.
    //
    // La historia que queda armada:
    // - Sofía: UN pago que cubre DOS cuotas (junio + julio de Árabe inicial) → PAID ×2.
    // - Julieta: paga su Intermedio ($20.000) con $25.000 → PAID + $5.000 A FAVOR.
    // - Valentina: seña de $4.000 a su clase suelta (imputación manual) → PARTIAL con
    //   vencimiento futuro — el badge Parcial se ve en Deudores.
    // - Lucía (estudio): su junio exacto, transferencia RECIBIDA POR LA PROFE (RN5).
    // - Tomás (ya de baja): $10.000 a cuenta de su última cuota → sigue Vencida, pero
    //   Deudores muestra solo lo que FALTA.
    const { createPayment } = await import("../src/server/services/payments");

    async function seedPayment(
      orgId: string,
      studentName: string,
      input: {
        amount: number;
        method: "CASH" | "TRANSFER" | "OTHER";
        receivedBy?: "STUDIO" | "TEACHER";
        daysAgo: number;
        toDropIn?: boolean;
      },
    ) {
      const student = await db.student.findFirstOrThrow({
        where: { orgId, name: studentName },
      });

      const existing = await db.payment.findFirst({
        where: { orgId, studentId: student.id, amount: input.amount },
      });
      if (existing) return;

      let allocations: { chargeId: string; amount: number }[] | undefined;
      if (input.toDropIn) {
        const dropInCharge = await db.charge.findFirst({
          where: {
            orgId,
            status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
            enrollment: { studentId: student.id, plan: "DROP_IN" },
          },
        });
        if (!dropInCharge) return;
        allocations = [{ chargeId: dropInCharge.id, amount: input.amount }];
      }

      await createPayment(orgId, {
        studentId: student.id,
        amount: input.amount,
        method: input.method,
        receivedBy: input.receivedBy,
        paidAt: addDays(todayAr, -input.daysAgo),
        allocations,
      });
    }

    await seedPayment(ORG_INDEPENDIENTE, "Sofía Herrera", {
      amount: 36000,
      method: "TRANSFER",
      daysAgo: 3,
    });
    await seedPayment(ORG_INDEPENDIENTE, "Julieta Ibáñez", {
      amount: 25000,
      method: "CASH",
      daysAgo: 2,
    });
    await seedPayment(ORG_INDEPENDIENTE, "Valentina Ruiz", {
      amount: 4000,
      method: "CASH",
      daysAgo: 1,
      toDropIn: true,
    });
    await seedPayment(ORG_ESTUDIO, "Lucía Fernández", {
      amount: 22000,
      method: "TRANSFER",
      receivedBy: "TEACHER",
      daysAgo: 3,
    });
    await seedPayment(ORG_ESTUDIO, "Tomás Quiroga", {
      amount: 10000,
      method: "CASH",
      daysAgo: 2,
    });

    const orgs = await db.organization.findMany({
      orderBy: { name: "asc" },
      include: {
        memberships: { include: { user: { include: { accounts: true } } } },
        disciplines: { orderBy: { name: "asc" } },
      },
    });

    console.log("\nOrganizaciones sembradas:\n");
    console.table(
      orgs.flatMap((org) =>
        org.memberships.map((m) => ({
          org: org.name,
          tipo: org.type,
          usuario: m.user.name,
          email: m.user.email,
          rol: m.role,
          "puede entrar": m.user.accounts.some((a) => a.providerId === "credential") ? "sí" : "no",
          disciplinas: org.disciplines.map((d) => d.name).join(", "),
        })),
      ),
    );
    const chargesByStatus = await db.charge.groupBy({ by: ["status"], _count: true });
    const statusSummary = chargesByStatus
      .map((row) => `${row.status.toLowerCase()}: ${row._count}`)
      .join(" · ");

    console.log(
      `Totales — organizaciones: ${await db.organization.count()} · ` +
        `usuarios: ${await db.user.count()} · ` +
        `membresías: ${await db.membership.count()} · ` +
        `disciplinas: ${await db.discipline.count()} · ` +
        `alumnos: ${await db.student.count()} · ` +
        `grupos: ${await db.classGroup.count()} · ` +
        `franjas: ${await db.scheduleSlot.count()} · ` +
        `sesiones (excepciones): ${await db.classSession.count()} · ` +
        `inscripciones: ${await db.enrollment.count()} · ` +
        `cuotas: ${await db.charge.count()} (${statusSummary}) · ` +
        `pagos: ${await db.payment.count()} · ` +
        `imputaciones: ${await db.paymentAllocation.count()}\n` +
        `Contraseña de desarrollo: ${DEV_PASSWORD}\n`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
