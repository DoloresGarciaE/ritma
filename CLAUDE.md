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
2. **Multi-tenancy:** toda query de negocio pasa por el helper `withOrg` (llega en F0.6).
   Prohibido usar `prisma.*` directo fuera de `src/lib/` y `src/server/`.
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
    lib/                 ← auth, db (withOrg), permisos, whatsapp, receipts
    server/services/     ← lógica de negocio pura (RN1–RN10), con tests
  tools/                 ← contrast.js y scripts de apoyo
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
- **La guardia real vive en el layout de `(app)`** (`requireSession()`), no en el proxy:
  `src/proxy.ts` solo mira si existe la cookie (corre en Edge y no puede tocar la base). Cero
  lógica de negocio ahí.
- Al correr `npx @better-auth/cli generate`: **reescribe `prisma/schema.prisma`** y le mete
  `@@map("user")` y compañía. Sacale los `@@map` (renombran las tablas a minúscula sin
  necesidad) y revisá el diff completo antes de migrar.
- `BETTER_AUTH_URL` tiene que coincidir con el origen que sirve la app, o Better Auth
  responde `INVALID_ORIGIN`. Sin `GOOGLE_CLIENT_ID`/`SECRET`, el botón de Google no se
  muestra y el resto anda igual.

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
- `prisma.*` solo dentro de `src/lib/` y `src/server/`. Desde F0.6 toda query de negocio pasa
  por `withOrg`.

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

| Comando                           | Qué hace                                            |
| --------------------------------- | --------------------------------------------------- |
| `npm run dev`                     | Servidor de desarrollo                              |
| `npm run build`                   | `prisma generate` + build de producción             |
| `npm run lint`                    | ESLint                                              |
| `npm run typecheck`               | TypeScript sin emitir (`tsc --noEmit`)              |
| `npm run format` / `format:check` | Prettier: escribir / verificar                      |
| `npm run db:migrate`              | Crea y aplica migración, y regenera el cliente      |
| `npm run db:seed`                 | Seed idempotente (las dos orgs de los casos de uso) |
| `npm run db:studio`               | Prisma Studio                                       |

> En Next 16 no existe `next lint`: ESLint se corre con `eslint` (config flat en
> `eslint.config.mjs`).

## Flujo de trabajo

- Trunk-based: ramas cortas `feat/...`, PR propio (el diff es la revisión), merge solo con CI
  verde. **Un bloque del plan = una sesión = un commit deployable.** Nada queda a medio migrar.
- Checklist de PR: ¿CI verde? ¿toca dinero → tiene tests? ¿toca queries → respeta `withOrg`?
  ¿toca UI → cumple componentes/color? ¿cambió una regla → se versionó la spec?
- Ideas nuevas fuera del bloque en curso → backlog, no al sprint en curso.
