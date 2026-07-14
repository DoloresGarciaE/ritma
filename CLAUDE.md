@AGENTS.md

# Ritma — guía para trabajar en esta base

Ritma es una web app **mobile-first** de gestión para docentes independientes y estudios
(agenda de clases, alumnos y cobranzas). Un solo dev, part-time; se avanza por bloques
cortos y deployables.

> `@AGENTS.md` (arriba) trae un aviso de Next.js 16: la API cambió respecto de versiones
> previas. Antes de escribir código de framework, consultá `node_modules/next/dist/docs/`.
> Cambio ya confirmado que afecta al plan: **Middleware pasó a llamarse Proxy** (`src/proxy.ts`).

## La documentación es la fuente de verdad

Toda la definición vive en [`docs/`](docs/) y es **normativa**. No la dupliques acá ni en el
código: referenciala. Antes de escribir código:

1. Leé [`docs/plan-implementacion-ritma.md`](docs/plan-implementacion-ritma.md) — documento
   operativo: fases, bloques con checkboxes y DoD. **Se trabaja en orden, un checkbox a la vez.**
2. De [`docs/plan-proyecto-ritma.md`](docs/plan-proyecto-ritma.md): §7 (modelo de dominio),
   §8 (reglas de negocio **RN1–RN10**) y §10 (arquitectura y estructura de carpetas).
3. Marca, color y componentes: [`especificacion-marca-ritma.md`](docs/especificacion-marca-ritma.md)
   (§4 voz y tono), [`especificacion-colores-ritma.md`](docs/especificacion-colores-ritma.md),
   [`especificacion-componentes-ui-ritma.md`](docs/especificacion-componentes-ui-ritma.md).

**Regla de oro:** el plan de implementación define el _qué_ y el _cuándo_; los otros cuatro
documentos definen el _cómo_. Si el código contradice una spec, se corrige el código o se
propone actualizar la spec **en el mismo PR** — nunca divergen en silencio.

## Reglas no negociables

1. **Las specs son normativas.** Ver arriba. Toda contradicción se resuelve, no se ignora.
2. **Multi-tenancy:** toda query de negocio pasa por el helper `withOrg(orgId)` (F0.6). El
   cliente crudo `db` solo se importa dentro de `src/lib/` (lo hace cumplir ESLint).
3. **La lógica de negocio vive en `src/server/services/`** como funciones puras (reciben
   datos, devuelven resultados; testeables sin DB). Todo lo que toca dinero (RN1–RN10) se
   escribe **junto con sus tests**, no después.
4. **Alcance cerrado.** Se implementa solo lo que dice el bloque en curso del plan. Si falta
   una definición o hay un problema en una spec, **frená y preguntá** — no inventes.
5. **Stack fijo** (decisiones tomadas en ADRs, no se reabren): Next.js App Router, TypeScript,
   Tailwind, shadcn/ui, Prisma, PostgreSQL (Neon), Better Auth; monolito en Vercel. No proponer
   Express separado, Supabase ni otro stack.
6. **Idioma:** commits [Convencionales](https://www.conventionalcommits.org/) en inglés;
   textos de UI en **español rioplatense (voseo)**, siguiendo la voz de marca (Marca §4).
   `main` queda **siempre deployable**.

## Estructura de carpetas

Definida en plan-implementación §4 y plan-proyecto §10.

```
ritma/
  docs/                  ← los 5 documentos + adr/ + brand/ (+ bitacora.md)
  prisma/                ← schema.prisma, migrations/, seed.ts
  src/
    app/                 ← rutas: (auth)/, (app)/{dashboard,agenda,alumnos,cobranzas,estudio,ajustes},
                           r/[token]/ (comprobante público), api/cron/*
    components/ui/       ← componentes shadcn según Especificación de componentes
    components/brand/    ← logotipo e isotipo (SVG inline con tokens)
    lib/                 ← auth, db (withOrg), permisos, whatsapp, receipts
    server/              ← queries org-scoped (reciben el orgId explícito)
    server/services/     ← lógica de negocio pura (RN1–RN10), con tests
  tools/                 ← contrast.js y scripts de apoyo
  tests/                 ← Vitest: aislamiento org×org, permisos, harness de DB (F0.6)
  tests/e2e/             ← Playwright
```

## Autenticación (desde F0.4)

- **Better Auth maneja identidad y sesión, y nada más.** La tenencia (qué organización, con
  qué rol) sale de `Organization` y `Membership`, que son la única fuente de verdad. **No
  usamos su plugin de organizaciones.**
- [`src/lib/auth.ts`](src/lib/auth.ts) es el contrato: `getSession()` (devuelve `null` si no
  hay) y `requireSession()` (redirige a `/login`). Los dos exponen `userId` y `activeOrgId`.
- `activeOrgId` es la primera membresía del usuario, o `null` si todavía no tiene ninguna. Se
  recalcula en cada `getSession()` con el plugin `customSession`, así que nunca queda una org
  vieja pegada a la sesión. **Es contexto, no autorización**: que la sesión traiga un `orgId`
  no prueba que el usuario siga siendo miembro — eso lo revalida `withOrg` (F0.6).
- **La guardia real vive en el layout de `(app)`** (`requireSession()` + organización), no en el
  proxy. `src/proxy.ts` solo mira si existe la cookie. Ojo: **el Proxy de Next 16 corre en Node,
  no en Edge** —podría tocar la base— pero no lo hace a propósito, porque corre en toda request
  que matchea (incluidos los prefetch de los `<Link>` del shell) y el layout ya lee la base.
  Cero lógica de negocio ahí.
- Al correr `npx @better-auth/cli generate`: **reescribe `prisma/schema.prisma`** y le mete
  `@@map("user")` y compañía. Sacale los `@@map` (renombran las tablas a minúscula sin
  necesidad) y revisá el diff completo antes de migrar.
- `BETTER_AUTH_URL` tiene que coincidir con el origen que sirve la app, o Better Auth
  responde `INVALID_ORIGIN`. Sin `GOOGLE_CLIENT_ID`/`SECRET`, el botón de Google no se
  muestra y el resto anda igual.

## Organización y shell (desde F0.5)

- **Sin organización no hay app.** El layout de `(app)` exige sesión **y** `activeOrgId`; sin
  org manda a `/crear-organizacion` (que vive en `(onboarding)`, fuera de `(app)`, para que las
  dos guardias no se peleen).
- Después de crear la organización, la server action hace **`revalidatePath("/", "layout")`
  antes del `redirect`**. No es decorativo: purga el cache del router del cliente, que si no
  puede tener guardado un `/dashboard` de cuando no había org (o sea: "andá al wizard") y te
  deja rebotando entre las dos pantallas para siempre.
- Las queries org-scoped viven en `src/server/` y reciben el `orgId` **explícito**, sacado de la
  sesión. `withOrg` (F0.6) las va a absorber.
- La bottom nav son **cinco ítems fijos** (Componentes §3.6). No se agregan ni se reordenan sin
  actualizar esa spec. "Más" agrupa Estudio y Ajustes.
- En una organización independiente no se muestra **nada** de estudio: ni el link en `/mas`, ni
  la palabra en el payload; `/estudio` devuelve 404 (no redirect: un redirect confirmaría que la
  ruta existe).
- La app bar la compone **cada página** (`<AppBar title=… />`), no el layout: así el título puede
  salir de los datos y cada pantalla trae su propia acción.

## CI/CD y observabilidad (desde F0.7)

- **Un branch de Neon por entorno.** `production` → Vercel Production; `dev` → tu `.env.local`
  **y** los Preview deployments. Los tests **no usan Neon**: van contra el Postgres efímero de
  `docker-compose.test.yml`. Nunca compartas base entre entornos.
- **Las migraciones viajan con el deploy.** [`vercel.json`](vercel.json) fija el build command a
  `npm run vercel-build`, que es `prisma generate && prisma migrate deploy && next build`. El
  `build` normal **no** migra, así que tu build local y el de CI no tocan ninguna base. Corolario:
  **`DIRECT_URL` es obligatoria en Vercel** (el CLI de Prisma no puede hacer DDL por el pooler);
  sin ella, el deploy falla en el build.
- **CI sin secretos** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): en cada PR corren
  lint + typecheck + `format:check` + Vitest; al pushear a `main`, además el smoke de Playwright.
  El Postgres de los tests es un `services:` container mapeado a `localhost:55432`, o sea la misma
  URL que ya trae `.env.test` — sirve tal cual, sin editar nada y sin tocar la guarda de
  [`tests/db.ts`](tests/db.ts).
- **El E2E nunca toca producción**: Playwright corre contra `next build` + `next start` apuntando
  al Postgres efímero del propio job. Un solo smoke (registro → wizard → dashboard); los E2E de
  cobranzas llegan en S6.
- **Sentry solo existe si hay DSN.** El gate está en [`next.config.ts`](next.config.ts) y es de
  **build**: sin `NEXT_PUBLIC_SENTRY_DSN` no se instala el plugin, no se inicializa nada y el build
  ni lo menciona (cero ruido en local). Sin `SENTRY_AUTH_TOKEN` el build igual pasa: solo no sube
  sourcemaps.
- ⚠️ **Bajo Turbopack (el default de Next 16), `sentry.client.config.ts` NO funciona**: el SDK solo
  inyecta en `instrumentation-client.*` e `instrumentation.*`. Por eso el cliente vive en
  [`src/instrumentation-client.ts`](src/instrumentation-client.ts) y el servidor lo carga
  [`src/instrumentation.ts`](src/instrumentation.ts), que además exporta `onRequestError` (captura
  Server Components, Route Handlers, Server Actions y el Proxy).

## Base de datos (desde F0.3)

- **Prisma 7, y no es el Prisma de los tutoriales.** El driver adapter es obligatorio, el
  generador es `prisma-client` (con `output` requerido) y la URL del CLI **no va en el schema**:
  vive en [`prisma.config.ts`](prisma.config.ts). Antes de tocar Prisma, leé la doc de la v7.
- **Dos conexiones a Neon**: la app usa la _pooled_ (`DATABASE_URL`) vía
  [`src/lib/db.ts`](src/lib/db.ts); el CLI (migrate, studio, seed) usa la _directa_
  (`DIRECT_URL`), porque por el pooler no se puede hacer DDL.
- No uses el helper `env()` de `prisma/config`: **lanza si falta la variable** y rompería
  `prisma generate` (que corre en `postinstall`) en una CI sin credenciales.
- El cliente se genera en `src/generated/prisma` y **está gitignored** (se regenera en
  `postinstall` y en `build`). Se importa de `@/generated/prisma/client` — no hay `index.ts`.
- Schema v1: `Organization`, `User`, `Membership` (+ enums `OrgType`, `Role`). El resto del
  dominio llega en sus bloques. Toda tabla lleva `createdAt`/`updatedAt`; las de negocio,
  `orgId` con índice.
- El cliente crudo `db` se importa **solo dentro de `src/lib/`** (lo obliga ESLint). En todo
  el resto se usa `withOrg` — ver la sección siguiente.

## Scoping y permisos (desde F0.6)

- **Toda query de negocio pasa por `withOrg(orgId)`** ([`src/lib/db.ts`](src/lib/db.ts)): es un
  cliente Prisma acotado a una organización (vía `$extends`) que filtra e inyecta el `orgId`
  automáticamente. Imposible olvidárselo. El `orgId` sale **siempre** del `activeOrgId` de la
  sesión, nunca de la URL ni de un input.
- **`db` crudo solo en `src/lib/`**, y lo hace cumplir una regla de ESLint (`no-restricted-imports`):
  importarlo desde `src/app/`, `src/server/` o cualquier otro lado es error de lint. Excepciones:
  `prisma/` (el seed corre antes de que exista una org) y `tests/` (arman datos cross-org a
  propósito). La creación del tenant (que no tiene `orgId` todavía) vive en
  `createOrganizationWithOwner`, también en `src/lib/db.ts`.
- **El mapa `SCOPE` (`Record<Prisma.ModelName, …>`) es la red de seguridad**: si se agrega un
  modelo al schema y no se clasifica (`orgId` / `self` / `global`), **no compila**. Al sumar una
  tabla de negocio (Student, ClassGroup…), clasificala como `orgId`.
- **Límites conocidos de `withOrg`** (por eso no es la única defensa): el hook **no** cubre
  escrituras **anidadas** (`disciplines: { create: … }` no dispara el hook del hijo) ni
  `$queryRaw`. Las escrituras de negocio van por funciones explícitas en `server/services/`, y
  cero SQL crudo fuera de `src/lib/`. La garantía dura sería RLS en Postgres (post-MVP).
- **Permisos**: la matriz del Plan §4 vive como función pura en
  [`src/server/services/permissions.ts`](src/server/services/permissions.ts) (`can`, `scopeOf`,
  `CAPABILITIES`) — testeable sin base. Los resolvers `requireMember(orgId)` y
  `requireRole(orgId, …roles)` están en [`src/server/authz.ts`](src/server/authz.ts): revalidan la
  membresía contra la base y devuelven el `Actor` (`{ userId, orgId, role }`). `activeOrgId` es
  contexto, no permiso: la membresía se revalida siempre en el server, nunca en la UI.
- El scope fino de teacher ("sus grupos y alumnos") todavía **no tiene modelos** (llegan en
  S2/S3): `scopeOf` deja el punto de extensión (devuelve `{ kind: "ownTeacher", teacherUserId }`),
  sin abstracción vacía. El test "un teacher no accede a grupos ajenos" se escribe en S2.
- **Tests de aislamiento** (Vitest contra Postgres real, nunca mockeando Prisma): levantá la base
  con `npm run test:db:up` (Docker) y corré `npm test`. La base es un contenedor efímero
  (`docker-compose.test.yml`, puerto 55432); [`tests/db.ts`](tests/db.ts) tiene una guarda de 4
  capas (incluida una tabla centinela) para que sea **imposible** truncar dev o producción por un
  `TEST_DATABASE_URL` mal puesto. `.env.test` está commiteado a propósito (solo credenciales de
  localhost, sin secretos).

## Tokens y UI (desde F0.2)

- Tailwind v4 es **CSS-first**: no hay `tailwind.config.ts`. Todo vive en
  [`src/app/globals.css`](src/app/globals.css) — escalas y tokens en `@theme`, y los valores
  de cada modo en `:root` / `.dark` / el media query de `prefers-color-scheme`.
- **Los componentes consumen tokens semánticos** (`bg-surface`, `text-text-secondary`,
  `bg-state-paid-bg`…), nunca stops de la escala (`bg-violeta-600`) ni hex. Las escalas existen
  para construir tokens.
- El modo lo decide el sistema; `.light` / `.dark` fuerzan el modo en un subárbol.
- [`/dev/ui`](src/app/dev/ui/page.tsx) es el test visual permanente: todo componente nuevo se
  agrega ahí, con sus estados y en los dos modos, con ejemplos del dominio real.
- ⚠️ Al traer un componente de shadcn: su `--accent` es el fondo de hover, pero en Ritma
  `accent` es el coral. Remapear `bg-accent` → `bg-muted` (Color §8).

## Convenciones

- **Ningún hex suelto en la UI:** todo color sale de un token de la Especificación de color.
  Si un color no está en esa spec, no existe (Color §5, §9).
- **Ningún estado comunica solo con color:** siempre etiqueta de texto además del color.
- **Montos:** formato `$20.000` (punto de miles, sin decimales salvo necesidad), en
  `tabular-nums`; períodos como "Marzo 2026" (Marca §7, Componentes §4.2). El formato único
  vive en [`src/lib/format.ts`](src/lib/format.ts) — no reimplementarlo.
- **Permisos en la UI:** lo que un rol no puede hacer **no se muestra** (no `disabled`).
  El server valida siempre; la UI nunca es el único guardián (Componentes §4.3).
- **Componentes:** si un componente no está en la Especificación de componentes, primero se
  especifica ahí y después se codea. Cambiar un componente versiona la spec en el mismo PR.
- **Zona horaria y moneda** por organización (default `America/Argentina/Buenos_Aires`, ARS);
  horarios como hora local ("19:00"), fechas de negocio como fecha civil, no UTC crudo (RN10).

## Testing (plan-implementación §10)

El rigor va donde está la plata. Servicios de dinero (imputaciones, generación de cuotas,
estados, liquidaciones, alquileres) y autorización (aislamiento org×org y rol×recurso): con
Vitest, cobertura total de RN1–RN10, escritos junto con el servicio. Smoke E2E de los flujos
F1–F3 (Plan §9) con Playwright, en `main`. No se testean componentes UI unitarios ni snapshots.

## Comandos

| Comando                           | Qué hace                                               |
| --------------------------------- | ------------------------------------------------------ |
| `npm run dev`                     | Servidor de desarrollo                                 |
| `npm run build`                   | `prisma generate` + build de producción                |
| `npm run lint`                    | ESLint                                                 |
| `npm run typecheck`               | TypeScript sin emitir (`tsc --noEmit`)                 |
| `npm run format` / `format:check` | Prettier: escribir / verificar                         |
| `npm run db:migrate`              | Crea y aplica migración, y regenera el cliente         |
| `npm run db:seed`                 | Seed idempotente (las dos orgs de los casos de uso)    |
| `npm run db:studio`               | Prisma Studio                                          |
| `npm test`                        | Levanta la DB de test (Docker), migra y corre Vitest   |
| `npm run test:watch`              | Vitest en watch (la DB de test tiene que estar arriba) |
| `npm run test:db:up` / `:down`    | Prende / apaga el Postgres de test (docker-compose)    |
| `npm run test:e2e`                | Smoke de Playwright (requiere `npm run build` antes)   |
| `npm run vercel-build`            | El build de Vercel: migra la base y después buildea    |

> En Next 16 no existe `next lint`: ESLint se corre con `eslint` (config flat en
> `eslint.config.mjs`).

## Flujo de trabajo

- Trunk-based: ramas cortas `feat/...`, PR propio (el diff es la revisión), merge solo con CI
  verde. **Un bloque del plan = una sesión = un commit deployable.** Nada queda a medio migrar.
- Checklist de PR: ¿CI verde? ¿toca dinero → tiene tests? ¿toca queries → respeta `withOrg`?
  ¿toca UI → cumple componentes/color? ¿cambió una regla → se versionó la spec?
- Ideas nuevas fuera del bloque en curso → backlog, no al sprint en curso.
