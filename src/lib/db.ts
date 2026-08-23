import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import type { OrgType, Prisma } from "@/generated/prisma/client";

/**
 * Cliente Prisma de la app. Usa la conexión POOLED de Neon (el host termina en
 * "-pooler"); el CLI de Prisma va por la directa (ver prisma.config.ts).
 *
 * `db` es el cliente CRUDO, sin scoping. Solo puede importarse dentro de `src/lib/`
 * (lo obliga una regla de ESLint, F0.6): es la puerta de la base y quien la use se
 * saltea el aislamiento por organización. Todo lo demás pasa por `withOrg(orgId)`.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Falta DATABASE_URL. Copiá .env.example a .env.local y completala.");
}

const createPrismaClient = () => new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// En dev, Next recarga los módulos en cada cambio: sin este cache se abriría un
// pool nuevo por recarga hasta agotar las conexiones de Neon.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

// ─────────────────────────────────────────────────────────────────────────────
// withOrg — el helper de scoping obligatorio (Plan §10, decisión 1).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cómo se acota cada modelo:
 * - "orgId":  el modelo tiene columna `orgId` → se filtra e inyecta.
 * - "self":   el modelo ES el tenant (Organization) → se filtra por `id`.
 * - "global": identidad de Better Auth (User/Session/Account/Verification), sin
 *             tenencia → no se toca.
 *
 * `Record<Prisma.ModelName, Scope>` es la red de seguridad: si mañana se agrega un
 * modelo al schema (Student, ClassGroup…) y no se clasifica acá, esto NO COMPILA.
 */
type Scope = "orgId" | "self" | "global";

const SCOPE: Record<Prisma.ModelName, Scope> = {
  Organization: "self",
  Discipline: "orgId",
  Student: "orgId",
  ClassGroup: "orgId",
  ScheduleSlot: "orgId",
  ClassSession: "orgId",
  Enrollment: "orgId",
  Charge: "orgId",
  Payment: "orgId",
  PaymentAllocation: "orgId",
  ReminderLog: "orgId",
  // Membership tiene orgId y es dato del tenant. La lee la capa de permisos
  // (requireMember) a través de withOrg; el arranque de sesión la lee cruda en auth.ts.
  Membership: "orgId",
  // S7: el equipo también es dato del tenant. La ÚNICA lectura de Invitation fuera de
  // withOrg es la puerta pública por token (server/public/invitations.ts), como el
  // comprobante.
  TeacherProfile: "orgId",
  Invitation: "orgId",
  // S8: los salones del estudio.
  Space: "orgId",
  User: "global",
  Session: "global",
  Account: "global",
  Verification: "global",
};

/** Operaciones con `where` libre (WhereInput). */
const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);

/**
 * Operaciones con `where` único (WhereUniqueInput). En Prisma 7 `extendedWhereUnique`
 * es GA: el where único admite además filtros no únicos, así que se le puede agregar
 * la clave del tenant y no hay que reescribir findUnique → findFirst.
 */
const UNIQUE_WHERE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);

/** Escrituras donde hay que inyectar `orgId` en `data` (o en `create`, si es upsert). */
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

type AnyArgs = Record<string, unknown>;

function scopedClient(orgId: string) {
  return db.$extends({
    name: `withOrg(${orgId})`,
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          // `model` llega en PascalCase ("Discipline"), no en camelCase.
          const scope = SCOPE[model as Prisma.ModelName];

          // Defensa en profundidad: un modelo sin clasificar (o un mismatch de nombre)
          // se corta, no pasa sin filtrar.
          if (scope === undefined) {
            throw new Error(`withOrg: modelo sin clasificar en SCOPE: ${model}`);
          }
          if (scope === "global") return query(args);

          const key = scope === "self" ? "id" : "orgId";
          const a = { ...(args as AnyArgs) } as AnyArgs;

          // Filtro de tenant en el where. Se mergea a nivel raíz: como los campos raíz
          // se combinan con AND, no hay OR que lo escape.
          if (WHERE_OPS.has(operation) || UNIQUE_WHERE_OPS.has(operation)) {
            a.where = { ...((a.where as AnyArgs) ?? {}), [key]: orgId };
          }

          // Inyección de orgId en las escrituras de modelos con columna orgId.
          if (scope === "orgId" && CREATE_OPS.has(operation)) {
            if (operation === "upsert") {
              // OJO: un upsert con orgId ajeno en el where NO tira, cae al CREATE.
              // Inyectar orgId en `create` es lo que impide que escriba en otra org.
              a.create = { ...((a.create as AnyArgs) ?? {}), orgId };
            } else if (Array.isArray(a.data)) {
              a.data = (a.data as AnyArgs[]).map((d) => ({ ...d, orgId })); // createMany
            } else {
              a.data = { ...((a.data as AnyArgs) ?? {}), orgId };
            }
          }

          return query(a as typeof args);
        },
      },
    },
  });
}

export type OrgClient = ReturnType<typeof scopedClient>;

// El cliente extendido es un proxy inmutable sobre el MISMO pool (no abre conexiones):
// re-envolver cuesta ~11 µs. Se memoiza con un Map de módulo —no `cache()` de React—
// para que funcione igual dentro y fuera de una request (los tests corren sin request).
const clientForOrg = new Map<string, OrgClient>();

/**
 * Cliente Prisma acotado a una organización: toda query de modelos de tenant queda
 * filtrada por `orgId`, y toda escritura lo lleva inyectado. Es imposible olvidárselo.
 *
 * Límites conocidos (se cubren con convención + tests, no con este hook):
 * - Las escrituras ANIDADAS (`disciplines: { create: … }`) NO disparan el hook del hijo:
 *   las escrituras de negocio van por funciones explícitas en `server/services/`.
 * - `$queryRaw`/`$executeRaw` no pasan por acá: no se usa SQL crudo fuera de `src/lib/`.
 */
export function withOrg(orgId: string): OrgClient {
  let client = clientForOrg.get(orgId);
  if (!client) {
    client = scopedClient(orgId);
    clientForOrg.set(orgId, client);
  }
  return client;
}

/**
 * Puerta de SISTEMA (S3): el acceso cross-org de los jobs programados.
 *
 * Los crons (generar cuotas, marcar vencidas) operan sobre TODAS las organizaciones: no
 * hay sesión, no hay actor, no hay un solo orgId — `withOrg` no puede representarlos. En
 * vez de dejar que cada job importe el `db` crudo (y borrar la línea entre "query de
 * sistema" y "query que se saltea el scoping"), esta función es la ÚNICA puerta:
 *
 * - ESLint la permite SOLO en `src/server/system/` (donde viven los jobs) — importarla
 *   desde una page, una action o un servicio de negocio es error de lint.
 * - Los jobs iteran org por org y le pasan los datos a los servicios PUROS
 *   (`services/billing.ts`), que no saben de esta distinción: reciben datos, devuelven
 *   resultados. La escritura vuelve por acá, con el `orgId` de la org que se está
 *   procesando puesto explícito.
 * - Devuelve el mismo cliente crudo (mismo pool); el nombre existe para que la intención
 *   quede en el código y el lint pueda distinguirla.
 */
export function forSystem() {
  return db;
}

/**
 * La puerta PÚBLICA (S5): el comprobante `/r/[token]` se resuelve sin sesión, sin org y
 * sin actor — como los crons, `withOrg` no puede representarlo. La autorización ES el
 * token: opaco, de 192 bits, imposible de adivinar y revocable (se rota y el link viejo
 * muere). Ver `server/public/receipts.ts`.
 *
 * - ESLint la permite SOLO en `src/server/public/` — la superficie pública entera queda
 *   en un módulo con nombre, no en un `db` crudo suelto en una page.
 * - Quien la usa responde con lo MÍNIMO que la pieza pública define (Marca §9.1) y 404
 *   genérico para todo lo demás: un token inválido no aprende ni siquiera si existe.
 * - Devuelve el mismo cliente crudo (mismo pool); el nombre existe para el lint y para
 *   que la intención quede en el código.
 */
export function forPublic() {
  return db;
}

/**
 * Crea una organización con su dueño, sus disciplinas y el PERFIL DOCENTE del dueño en
 * UNA transacción.
 *
 * El perfil (S7): en una INDEPENDENT el owner ES el único profe (sus grupos se le
 * auto-asignan al crearlos); en un STUDIO la dueña suele dictar también — sin perfil no
 * habría a quién asignarle grupos hasta que llegue la primera invitación. Kind
 * OWNER_TEACHER en ambos casos; si no dicta, el perfil queda sin grupos y no molesta.
 *
 * No puede pasar por `withOrg`: todavía no hay `orgId` (se está creando el tenant). Vive
 * acá, con el `db` crudo, por la misma razón que el seed. Una escritura anidada es un
 * BEGIN…COMMIT sobre una sola conexión: si falla cualquier parte (p. ej. el `ownerId` no
 * existe), no queda nada a medio crear.
 */
export function createOrganizationWithOwner(input: {
  ownerId: string;
  /** Para el `displayName` del perfil docente del owner (S7). */
  ownerName: string;
  name: string;
  type: OrgType;
  disciplines: string[];
}): Promise<{ id: string }> {
  return db.organization.create({
    data: {
      name: input.name,
      type: input.type,
      memberships: { create: { userId: input.ownerId, role: "OWNER" } },
      teachers: {
        create: {
          membershipUserId: input.ownerId,
          displayName: input.ownerName,
          kind: "OWNER_TEACHER",
        },
      },
      disciplines: {
        createMany: {
          data: input.disciplines.map((name) => ({ name })),
          skipDuplicates: true,
        },
      },
    },
    select: { id: true },
  });
}
