# Bitácora de Ritma

Registro semanal, tres líneas por semana (hecho / trabado / próximo). Es la memoria para
retomar después de una semana sin tocar el proyecto (Plan de implementación §2.6, §11).

---

## Semana 1 (julio 2026) — arrancó Ritma

- **Hecho:** F0.1 cerrado — scaffold Next.js 16 (TS, App Router, Tailwind, ESLint, Prettier),
  estructura de carpetas de §4, README con enlaces a docs, y deploy "hola Ritma" en producción
  (ritma-eight.vercel.app). Día 0 cerrado del lado del repo: docs a `docs/`, `tools/contrast.js`,
  ADR-001, esta bitácora.
- **Trabado:** nada bloqueante. Dominio `ritma.com.ar` comprado y tablero "Ritma" creado en
  GitHub Projects. Pendiente de Día 0 fuera del repo: crear las cuentas gratuitas de
  Neon/R2/Resend/Sentry, OAuth de Google, delegar el dominio a Vercel (F0.7) y —si se quiere—
  la búsqueda de antecedentes de marca en INPI/stores.
- **Próximo:** F0.2 — tokens de color (claro/oscuro) en `globals.css`, fuentes con `next/font`
  (Inter + Space Grotesk), shadcn/ui y los primeros componentes; página `/dev/ui`.

## Semana 2 (julio 2026) — tokens y UI base

- **Hecho:** F0.1 mergeado a `main` (squash). F0.2 en `feat/f0-2-ui-tokens`: tokens de color
  claro/oscuro y escalas en Tailwind, Inter + Space Grotesk con `next/font`, shadcn/ui
  inicializado, y Botón, Campos (con el input de monto), Badge de estado y Card según la
  Especificación de componentes. `/dev/ui` muestra todo en los dos modos a la vez.
- **Trabado:** nada bloqueante. La Especificación de color pasó a 1.1: al implementar
  aparecieron tres huecos (los estados Pendiente y Exonerada no tenían token, el botón
  destructivo necesitaba un rojo que no cambie con el modo, y Neutro 400 como placeholder
  daba 2.15:1). Se resolvieron sin agregar colores nuevos.
- **Próximo:** F0.3 — Neon + Prisma, `schema.prisma` v1 (Organization, User, Membership),
  primera migración y `seed.ts`.

## Semana 3 (julio 2026) — base de datos

- **Hecho:** F0.2 mergeado a `main` (squash). F0.3 en `feat/f0-3-database`: Prisma 7 sobre Neon
  (pooled para la app vía driver adapter, directa para el CLI), `schema.prisma` v1 con
  Organization / User / Membership, primera migración aplicada, seed idempotente con las dos
  orgs de los casos de uso, y el singleton en `src/lib/db.ts`.
- **Trabado:** nada bloqueante, pero Prisma 7 no es el Prisma de los tutoriales: el driver
  adapter es obligatorio, la URL del CLI se mudó a `prisma.config.ts`, y su helper `env()`
  lanza si falta la variable — eso habría roto `npm ci` en la CI de F0.7, donde no hay
  credenciales de base. Se esquivó leyendo `process.env` y dejando el `datasource` condicional.
- **Próximo:** F0.4 — Better Auth (email+contraseña y Google), páginas de login/registro con los
  componentes de F0.2, y sesión con `activeOrgId`.

## Semana 4 (julio 2026) — autenticación

- **Hecho:** F0.3 mergeado a `main` (squash). F0.4 en `feat/f0-4-auth`: Better Auth con adapter
  de Prisma (sus tablas Session/Account/Verification migradas en Neon), login y registro con los
  componentes de F0.2, Google detrás de un chequeo de env vars, `activeOrgId` en la sesión vía
  `customSession`, protección de rutas (proxy optimista + `requireSession()` en el layout de
  `(app)`), logout, y el seed con contraseña de desarrollo para los dos owners.
- **Trabado:** nada bloqueante. Dos cosas para tener presentes: el CLI de Better Auth reescribe
  `schema.prisma` y le agrega `@@map("user")` —que habría renombrado nuestra tabla `User` a
  minúscula, con datos adentro—, así que hay que revisar su diff siempre; y `BETTER_AUTH_URL`
  tiene que coincidir con el origen que sirve la app o todo responde `INVALID_ORIGIN`.
- **Próximo:** F0.5 — wizard de creación de organización (3 pasos, HU1.1–1.2) y shell de `(app)`
  con bottom nav, app bar y sidebar en `md`.

## Semana 5 (julio 2026) — organización y shell

- **Hecho:** F0.4 mergeado a `main` (squash). F0.5 en `feat/f0-5-org-shell`: modelo `Discipline`,
  wizard de 3 pasos en `/crear-organizacion` (server action con Zod, creación atómica de org +
  membresía OWNER + disciplinas), shell de `(app)` con bottom nav, sidebar con el logotipo y app
  bar, y las rutas placeholder con sus estados vacíos. El DoD de la Fase 0 queda a un paso: se
  recorre registro → wizard → dashboard con el CTA. Medido en un navegador de verdad: **2,6 s**
  de punta a punta (HU1.1 pedía menos de 2 minutos).
- **Trabado:** nada bloqueante, pero aparecieron dos cosas feas. Una, que en F0.4 escribí que el
  Proxy de Next corre en Edge: **es falso**, corre en Node. La conclusión (no autorizar ahí)
  seguía siendo la correcta, pero el motivo estaba mal y quedó corregido en CLAUDE.md y en §10.
  Dos, el riesgo real del bloque no era la base sino el **cache del router del cliente**, que
  podía dejar al usuario rebotando entre el wizard y el dashboard; se resuelve con
  `revalidatePath("/", "layout")` antes del redirect, y quedó verificado que no rebota.
- **Próximo:** F0.6 — `withOrg`, permisos por rol y los tests de aislamiento entre organizaciones.
  Es el bloque más importante de la fase.

## Semana 6 (julio 2026) — scoping y permisos

- **Hecho:** F0.5 mergeado a `main` (por PR, no squash). F0.6 en `feat/f0-6-scoping`: `withOrg(orgId)`
  en `src/lib/db.ts` (cliente Prisma acotado por organización vía `$extends`, con un mapa
  `Record<Prisma.ModelName>` que no compila si se agrega un modelo sin clasificar); regla de ESLint
  que prohíbe el `db` crudo fuera de `src/lib/`; matriz de permisos §4 como función pura en
  `server/services/permissions.ts` y los resolvers `requireMember`/`requireRole` en `server/authz.ts`;
  refactor de todas las queries a `withOrg` (grep de Prisma crudo fuera de `lib` = cero); y **53 tests**
  de Vitest contra un Postgres real en Docker (aislamiento org×org, sin-membresía, roles, atomicidad
  del wizard). Seed con una profe TEACHER en el estudio.
- **Trabado:** nada bloqueante, pero el diseño tuvo que blindarse contra tres fugas reales de la
  extensión de Prisma (verificadas contra la base): las escrituras **anidadas** no disparan el hook del
  hijo, `upsert` con `orgId` ajeno **cae al CREATE** en vez de tirar, y `$queryRaw` no pasa por el hook.
  Se cubren con convención (escrituras de negocio por funciones explícitas, cero SQL crudo fuera de
  `lib`) + tests. Elegí **Docker local** para la base de test, no un branch de Neon: la URL de Neon es
  idéntica en forma a la de prod, así que un typo apunta a producción sin que ninguna validación lo
  note; la guarda de `tests/db.ts` (4 capas, con tabla centinela) hace imposible truncar la base que no
  es. Dos decisiones de la matriz §4 quedaron anotadas para confirmar: owner y admin tienen permisos
  idénticos (así está en la spec), y el scope fino de teacher se difiere a S2 (no hay modelos todavía).
- **Próximo:** F0.7 — CI/CD (GitHub Actions: lint + typecheck + Vitest en cada PR, con el service de
  Postgres que ya mapea el harness de hoy) y observabilidad (Sentry), más el cableado Vercel↔Git. Cierra
  la Fase 0.

## Semana 7 (julio 2026) — CI/CD y observabilidad

- **Hecho:** F0.6 mergeada a `main` y deployada. F0.7 en `feat/f0-7-ci-cd`: GitHub Actions con dos
  jobs en cada PR (lint + typecheck + `format:check`; y Vitest contra un Postgres real vía
  `services:`) más el smoke de Playwright al pushear a `main`; **el CI no necesita ningún secreto**,
  porque el `services:` container queda en `localhost:55432` — exactamente la URL que ya traía
  `.env.test`, así que sirve tal cual y sin tocar la guarda de `tests/db.ts`. Playwright con **un**
  smoke (registro → wizard → dashboard con el CTA) contra un build de producción local, nunca contra
  producción. Sentry client+server, activo solo si hay DSN. Y las migraciones ahora **viajan con el
  deploy**: `vercel.json` fija el build a `vercel-build` = `prisma migrate deploy && next build`.
- **Trabado:** nada bloqueante, pero aparecieron tres cosas que había que verificar y no suponer. Una:
  bajo Turbopack (el default de Next 16) **`sentry.client.config.ts` no funciona** — el SDK solo
  inyecta en `instrumentation-client.*`. Dos: sin auth token, Sentry igual prende
  `productionBrowserSourceMaps` y después avisa que no puede subir nada; hay que apagarlas explícito.
  Tres: en un build de producción, Better Auth **se niega a arrancar sin `BETTER_AUTH_SECRET`**, y sin
  `BETTER_AUTH_URL` las cookies salen con prefijo `__Secure-` y el browser las tira sobre `http://` —
  por eso el job de E2E setea las dos. Queda **pendiente de mis credenciales**: branch `dev` en Neon,
  las env vars de Vercel (¡`DIRECT_URL` es ahora obligatoria o el deploy falla!), el dominio y el DSN.
- **Próximo:** cerrar el DoD de la Fase 0 con las acciones manuales y taggear `v0.1.0-f0`. Después,
  S1 — Alumnos (modelo `Student`, CRUD con búsqueda, alta express).

### Cierre de la Fase 0 ✅

F0.7 mergeada por PR #2, con los tres jobs en verde en `main` (lint+typecheck, Vitest contra Postgres
real, y el smoke de Playwright corriendo por primera vez en un runner). **DoD de la Fase 0 verificado
contra producción**: un usuario nuevo se registra, crea su organización y llega al dashboard con el CTA
"Creá tu primer grupo" — el mismo smoke, apuntado al deploy real, pasa en 9,6 s.

**Incidente al cerrar (para no repetirlo):** el primer intento contra producción falló con
`INVALID_ORIGIN`. Causa: `BETTER_AUTH_URL` estaba puesta en `https://ritma.com.ar`, un dominio que
todavía no resuelve, mientras la app se sirve desde `ritma-eight.vercel.app`. Better Auth compara el
origen de CADA request contra esa variable y rechaza todo si no coincide. Es la **tercera** vez que este
mismo mecanismo nos muerde (ya había pasado con el `redirect_uri` de Google y con el puerto en dev), y
el switch al dominio definitivo lo va a provocar otra vez. Pendiente de decisión: configurar
`trustedOrigins` en Better Auth para aceptar varios orígenes válidos a la vez y que el cambio de dominio
deje de ser un momento de riesgo.

**Basura en la base de producción:** el smoke deja un usuario y una organización de prueba
(`malena+<timestamp>@ritma.test`, org "Danzas Malena"), más un usuario suelto `diag-<timestamp>@ritma.test`
del diagnóstico. Se pueden borrar con Prisma Studio apuntando al branch de producción.

## Semana 8 (julio 2026) — alumnos (S1)

- **Hecho:** arranca la Fase 1. `feat/s1-students`: modelo `Student` (y su bloque de tests de
  aislamiento, que queda como **el patrón** para todo modelo nuevo: schema → `SCOPE` → tests →
  servicio → UI); servicios con búsqueda insensible a mayúsculas y acentos, y baja **lógica** (RN9);
  pantalla de Alumnos con búsqueda al tipear, filtro activos/todos y estado vacío; alta express con
  FAB + bottom sheet (HU2.1); y ficha v1 editable con baja/reactivación (HU2.2–2.3). Cinco
  componentes nuevos: sheet, toast, avatar, FAB e ítem de lista. **80 tests** (venían 53).
- **Trabado:** nada bloqueante, pero tres decisiones que valen la pena. Una: la **búsqueda sin
  acentos** no se hizo con `unaccent` de Postgres sino con una columna `searchName` normalizada,
  porque `unaccent` exige SQL crudo — y el SQL crudo se saltea `withOrg`. Es una desnormalización
  deliberada; §7 quedó versionado. Dos: **sonner no entra** (el item de shadcn depende de
  `next-themes`, que Ritma no usa a propósito) y el `sheet` del registry **no tiene cierre por
  gesto**, que §3.8 exige: se usó el Drawer de Base UI. Tres: en Tailwind v4 **no hay color de borde
  por defecto**, así que un `border` pelado se pinta del color del texto — hay que escribir
  `border-border` siempre. Verificado en un navegador real, en viewport de teléfono.
- **Próximo:** S2 — Agenda (`ClassGroup`, `ScheduleSlot`, `ClassSession`), y con ella el test que
  quedó pendiente desde F0.6: "un teacher no accede a grupos ajenos".
