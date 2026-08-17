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

## Semana 9 (julio 2026) — agenda (S2)

- **Hecho:** `feat/s2-schedule`: los tres modelos de la agenda con sus bloques de aislamiento
  (calcados del patrón Student, + los casos nuevos de referencia cruzada: `disciplineId`/`slotId`
  ajenos rechazan ANTES de escribir); el **motor puro de ocurrencias** (`schedule.ts`) — las
  sesiones se calculan al vuelo y `ClassSession` guarda solo los desvíos, identidad
  `(slotId, fecha original)`, restablecer = borrar la fila; vistas semana/día con toggle,
  navegación por `<Link>` y "Hoy"; crear/editar grupo con editor de franjas (§3.15 nueva) y
  disciplina al vuelo; cancelar (con el copy canónico de §3.8) / reprogramar / restablecer;
  acceso "Grupos" en la app bar; seed con 7 grupos y el feriado cancelado del DoD. Antes del PR,
  una pasada de review adversarial (multi-agente) sobre el diff completo dejó un endurecimiento:
  cerrar el sheet de grupo con cambios sin guardar ahora pide confirmación (§3.8 lo exigía y ni
  S1 ni S2 lo tenían), las actions de sesión toleran datos viejos de otra pestaña (toast de error
  en vez de pantalla rota), el switch optimista tiene rollback, la tarifa tiene tope (desbordaba
  Decimal(12,2)), y el guard de `activeOrgId` nulo dejó de depender de un `!`. **168 tests**
  (venían 80).
- **Trabado:** nada bloqueante, pero tres hallazgos. Uno: **Coral 400 no puede existir** — el
  interpolado da 2.58:1 y reprueba el 3:1 de no-texto (verificado con `contrast.js`); la barra de
  disciplina clara usa Coral 500 ◆ y la spec de color quedó en v1.4 con los tokens
  `discipline-1/-2/-3`. Dos: el borrador de §7 no identificaba una ocurrencia (un grupo puede
  tener dos franjas el mismo día): `ClassSession` ganó `slotId` + `@@unique([slotId, date])` —
  nota S2 en §7. Tres: `date-fns` quedó AFUERA — la aritmética de fechas civiles es entera y una
  librería que opera en el huso del servidor ahí es riesgo, no ayuda; solo entró `@date-fns/tz`
  (TZDate, el sucesor first-party de `date-fns-tz` para "hoy" en la zona de la org). Deuda
  registrada: sin `teacherId` hasta S9, el test de teacher-scope se re-difiere y un TEACHER de
  estudio ve todos los grupos de su org; y editar/borrar una franja reescribe también las semanas
  pasadas (inherente al patrón on-the-fly; se revisita cuando RN7/F2 lo exija).
- **Próximo:** S3 — Cobranzas: inscripciones y cuotas (`Enrollment`, `Charge`), la lista de
  inscriptos en el detalle de sesión, y el primer cron (RN1).

## Semana 10 (julio 2026) — cobranzas: inscripciones y cuotas (S3)

- **Hecho:** `feat/s3-enrollments-charges`: `Enrollment` y `Charge` con sus bloques de
  aislamiento (+ el caso crítico nuevo: generar una cuota ES un upsert por
  `(enrollmentId, period)` — un upsert de A sobre la cuota de B cae al create y queda en A);
  el **motor puro de cobranzas** (`billing.ts`, RN1–RN3 con cobertura total) donde el monto es
  un **tipo opaco** que el motor no puede operar — dinero sin flotantes por construcción; la
  **puerta de sistema `forSystem()`** para los crons cross-org, permitida por ESLint solo en
  `server/system/` (ahí el `db` crudo sigue prohibido); los dos jobs (mensual + diario)
  idempotentes sobre el unique —la re-corrida no pisa una cuota editada a mano (RN2), testeado—
  detrás de `/api/cron/*` con `CRON_SECRET` **fail-closed** y comparación en tiempo constante,
  y `npm run cron:dev` para dispararlos a mano; inscribir desde la ficha y desde el detalle de
  sesión (la cuota inicial la genera EL MISMO motor: mensual del período en curso, o clase
  suelta a 7 días); baja con `endDate` (RN9); estado de cuenta en la ficha con el badge §3.3
  (su primer uso real), editar monto (RN2) y exonerar (RN3) solo owner/admin; **Deudores por
  período** con filtro por grupo y el total sumado en Decimal; seed que simula el cambio de mes
  **con los jobs reales** (dos períodos generados + vencidas marcadas + una beca exonerada),
  idempotente. **241 tests** (venían 168).
- **Trabado:** nada bloqueante, pero cuatro decisiones/hallazgos. Uno: RN10 pide la moneda "en
  cada monto" y el borrador de §7 no la tenía — `Charge.currency` se copia de la org al generar
  (nota S3 en §7). Dos: §3.2 exige combobox CON BÚSQUEDA para elegir alumno y la primera
  versión era un select nativo — quedó búsqueda en línea dentro del propio sheet (nota S3 en
  §3.2). Tres: `PlanType` nace sin `PACK` (depende de asistencia, fase 3+). Cuatro: **alta
  retroactiva genera solo el período en curso** — fabricar deuda de meses ya cobrados fuera de
  Ritma (onboarding) sorprendería; si hace falta, será acción explícita. Propuesta **RN11**
  (clase suelta: un cargo único al inscribir, vence a 7 días) elevada para aprobar en §8.
- **Próximo:** S4 — pagos e imputaciones (RN4–RN5): `Payment` + `PaymentAllocation`, el sheet
  "Registrar pago" en <15 segundos, y los estados PARTIAL/PAID que este bloque dejó listos.

## Semana 11 (julio–agosto 2026) — cobranzas: pagos e imputaciones (S4)

- **Hecho:** `feat/s4-payments`: `Payment` y `PaymentAllocation` con sus bloques de aislamiento
  (incluidos el lookup por `receiptToken` ajeno y el pisado de `attachmentKey` cross-org); el
  **motor de imputaciones** en `billing.ts` — `recomputeChargeStatus` como ÚNICA fuente de RN3
  (probada su coincidencia con `markOverdue`), `allocateGreedy` sirviendo los dos consumos de
  RN4 (pago nuevo antigua-primero, crédito contra cuotas recién generadas) y las invariantes de
  la edición manual — con la suite más exhaustiva del proyecto, centavos exactos incluidos;
  **transacción o nada** en `createPayment`/`deletePayment` (una imputación inválida deja CERO
  filas); **saldo a favor derivado** (pagos − imputaciones, jamás una columna) aplicado por el
  cron de generación (idempotencia intacta, testeada) y por la cuota inicial del alta; sheet
  "Registrar pago" con deuda pre-cargada, imputación VISIBLE y edición plegada (HU4.4),
  `receivedBy` solo en STUDIO (RN5); estado de cuenta con cuotas y pagos intercalados, crédito
  visible, detalle de pago con eliminar (propuesta RN12); Deudores con remanentes, badge
  PARTIAL estrenado y "Registrar pago" EN la fila (nota S4 en §3.5: el flujo de los 15
  segundos); adjuntos a R2 con URLs firmadas cortas y keys `{orgId}/payments/{paymentId}`,
  TODO detrás de `isR2Configured()`; seed con un mes verosímil de plata. **294 tests**
  (venían 241).
- **Trabado:** R2 sin credenciales en `.env.local` — el adjunto quedó implementado pero
  apagado; al cargar las 4 env vars se enciende solo (nada que codear). Dos guardas nuevas que
  S3 no necesitaba: el monto de una cuota no puede quedar bajo lo ya pagado, y una cuota con
  imputaciones no se exonera (primero se elimina el pago). `npm audit` trae avisos
  preexistentes (tooling de Prisma/ESLint y un advisory de Next que pide bump de versión) —
  para un housekeeping aparte, no de este bloque. Propuestas **RN11** (S3) y **RN12** (un pago
  sin liquidación puede eliminarse con confirmación; la inmutabilidad llega con RN6/S9)
  esperando aprobación para entrar a §8.
- **Próximo:** S5 — comprobantes y recordatorios: la página pública `/r/[token]` (el
  `receiptToken` ya se genera), imagen compartible, plantilla de recordatorio y `wa.me`.

## Semana 12 (agosto 2026) — comprobantes y recordatorios (S5)

- **Hecho:** `feat/s5-receipts-reminders`: **la primera cara pública del producto.**
  `ReminderLog` + `paymentAlias` (única migración del día) con su bloque de aislamiento;
  **`forPublic()`** como segunda puerta con nombre (hermana de `forSystem()`, ESLint solo en
  `server/public/`) y `getReceiptByToken` devolviendo EXACTAMENTE la pieza de Marca §9.1 — hay
  un test que pinnea el shape campo por campo, y otro que prueba que el token de una org no
  filtra nada de otra; página `/r/[token]` solo modo claro (`.light` forzado), isotipo nuevo en
  `components/brand/`, `formatDocumentDate` ("12 de mayo de 2026", §4.2), 404 genérico en voz
  de marca; **revocar = rotar el token** (el HMAC del plan quedó reemplazado: un token opaco
  revocable no necesita secretos — doc actualizado); imagen OG on-demand (`next/og`, fuentes
  TTF commiteadas, org + período + monto y SIN el alumno) + metadatos + `noindex` por meta
  (robots.ts NO bloquea `/r/`: bloquearlo impediría leer el noindex) + `metadataBase` (sin él,
  build error en Next 16); compartir con Web Share API /
  copiar link desde el toast §3.9 ("Pago registrado · Compartir comprobante"), el detalle del
  pago y el post-revocación; **plantilla de recordatorio** pura en `lib/reminders` (default =
  ejemplo normativo de Marca §4.2, variables {nombre} {periodo} {monto} {alias}, typo queda
  visible), editable en Ajustes con vista previa EN VIVO con datos reales (§3.16 nueva);
  `wa.me` en cada fila de Deudores (dos acciones por fila — §3.5 versionada) y en la ficha,
  como `<a>` pre-armado en el server (nunca window.open post-await) con log MEJOR ESFUERZO al
  disparar; email vía Resend detrás de guarda de env (patrón R2, sin SDK: un POST), con la
  misma plantilla pero SIN emojis (Marca §4: solo canales conversacionales) y log EMAIL
  recién al aceptarse; historial en la ficha (cierra HU2.2) con `sentAt` instante → fecha
  civil de la org (`civilDateOf`); seed con alias en las dos orgs, plantilla propia en el
  estudio y dos recordatorios. **333 tests** (venían 294).
- **Trabado:** Resend sin cuenta ni API key — el email quedó implementado pero apagado
  (deshabilitado CON MOTIVO, §4.3); falta crear la cuenta, verificar el dominio del remitente
  y cargar `RESEND_API_KEY` + `RESEND_FROM`. El header del email lleva
  `public/brand/ritma-logotipo.png` (los clientes de email no renderizan SVG) generado desde
  el SVG maestro. La agregación de deuda por alumno se movió a `debtorsForPeriod` (en Decimal,
  vía `sumMoney`): la UI recibe números listos y jamás suma plata — la regla S4 aguantó la
  primera tentación.
- **Próximo:** S6 — dashboard, PWA y pulido; antes, el DoD de S5 con dos teléfonos sobre el
  preview (link en WhatsApp ajeno + recordatorio pre-armado) y aprobar RN11/RN12.

## Semana 13 (agosto 2026) — sesión especial: escenarios de demo y selector de organización

- **Hecho:** `feat/demo-scenarios` — NO es un bloque del plan: preparación del testeo manual
  del caso estudio + docente dual. (1) **Selector de organización mínimo** (única feature,
  adelanto autorizado de S7): en "Más", con más de una membresía, nombre + tipo + rol y la
  activa marcada; la preferencia es una COOKIE validada en cada request por `customSession`
  contra las membresías reales (`resolveActiveOrg`, pura) — una cookie forjada se ignora y
  cae a la primera membresía. Cero migraciones; `activeOrgId` sigue siendo contexto, no
  autorización. Tests: resolver puro + caso nuevo en la suite de aislamiento (la preferencia
  ajena JAMÁS activa) + verificación en vivo (cambiar de org cambia TODOS los datos
  visibles, 6/6 checks). (2) **`npm run seed:scenarios`**: tres personas sobre los usuarios
  de testeo REALES — Estudio Meraki (STUDIO, 3 "salones" POR CONVENCIÓN de nombre hasta S8,
  7 grupos con dos cruces de horario a propósito, 15 alumnos, dos períodos por los JOBS
  reales, pagos por `createPayment` con parcial/crédito/receivedBy TEACHER, una beca por
  `waiveCharge`, recordatorios por `logReminder`), la org independiente de la docente
  (mundo chico, estados mezclados, plantilla default) y la membresía TEACHER de esa docente
  en Meraki con un grupo "a cargo de" por nombre (sin `teacherId` hasta S9), con agendas que
  no chocan entre sí. Idempotente (corrido 2×, conteos idénticos) y con cinturón: imprime
  host y base y pide confirmación (`--yes` la saltea). (3) **`docs/observaciones-demo.md`**:
  el guion checklist por persona, con la observación esperada de que un TEACHER hoy ve TODO
  el estudio (scoping S7) y el mapa de faltantes → S6/S7/S8/S9.
- **Trabado:** ⚠️ **S6 NUNCA corrió** — el brief de la sesión asumía Fase 1 cerrada
  (v0.2.0-f1), pero `main` está en S5: no hay dashboard (Inicio = placeholder de F0), ni
  PWA, ni E2E de F1/F2, ni tag. La sesión de S6 anterior quedó en la lectura de specs, sin
  código. El recorrido de demo funciona igual (S1–S5 completos) con esa limitación señalada
  en el guion. Pendiente de decidir: correr S6 antes o después del recorrido.
- **Próximo:** el recorrido de Dolores con el guion; S6 completo (dashboard + PWA + E2E);
  con lo anotado, definir S7 (roles/scoping de teacher).

## Semana 13 bis (agosto 2026) — S6: dashboard, PWA y cierre de Fase 1

- **Hecho:** `feat/demo-scenarios` squash-mergeada a `main` (CI verde, smoke incluido). S6
  completo en `feat/s6-dashboard-pwa`: (1) **Dashboard HU7.1** — `services/metrics.ts` con la
  vara existente (cobrado = imputaciones del período; pendiente/deudores = el MISMO
  `debtorsForPeriod` de Cobranzas, cuadran por construcción y hay test; clases de hoy =
  `weekData` filtrado), cards §3.4 con la `MetricCard` que esperaba desde F0.2, vacíos con
  guía. (2) **PWA sin service worker** — manifest, íconos 512/192/180 del maestro §9.2,
  favicon SVG theme-aware + .ico, splash = `loading.tsx` raíz con SOLO el punto coral
  latiendo (Marca §8), skeletons §3.14 por pantalla (token `muted`; spec anotada). (3) **E2E
  F1 y F2** + smoke: 3/3 verdes contra build de producción local; en CI corren al mergear.
  (4) Pasadas: accesibilidad §5 punto por punto (2 hallazgos, arreglados), modo oscuro §7
  (impecable; `/r/` queda claro), copy §4/§4.2 (limpio), performance (medido y atribuido:
  piso = framework+zod; sin deps muertas). (5) Correcciones permanentes: npm fijado en
  CLAUDE.md, protocolo de sesión interrumpida, cinturón anti-prod del seed (ni `--yes` lo
  saltea; test incluido, verificado contra el host real).
- **Trabado:** nada bloqueante. El origen de los links compartidos se hornea en el build
  (`NEXT_PUBLIC_APP_URL`): el E2E de F1 lo normaliza a propósito y quedó documentado.
- **Próximo:** recorrido de Dolores con el guion (preview de `feat/s6-dashboard-pwa`,
  instalando la PWA); merge → corren los 3 E2E en main → tag `v0.2.0-f1`; con lo anotado,
  definir S7.

## Semana 13 ter (agosto 2026) — ticket: ambientes DEV y PROD

- **Hecho:** S6 squash-mergeado a `main` (Fase 1 completa en el historial). Ticket de
  ambientes implementado en `feat/env-dev-prod` (ADR-003): `main` pasa a ser el ambiente
  DEV (production branch de Vercel → rama-puntero `production`, creada en el estado S6);
  producción solo por el workflow `Release` (dispatch manual con confirmación literal,
  verifica CI verde en la punta de main, fast-forward + tag `release-YYYYMMDD-HHmm`);
  rollback = mover el puntero al tag anterior. Migraciones con gate
  (`scripts/vercel-build.mjs`): prod y deploys de main migran, previews de PR no. Franja
  "DEV" en todo deploy no productivo. Cinturón del seed ahora con el endpoint de prod
  fijado en el código (funciona sin `.env.production`; test). `dev.ritma.com.ar` +
  `ritma-git-main-…` en trustedOrigins (test pineado). Inventario read-only de la base
  prod: quedó basura de pruebas (seed viejo, usuarios diag del smoke, orgs de testeo) —
  propuesta de limpieza en el reporte, para ANTES del primer release formal.
- **Trabado:** los clicks de dashboard son de Dolores (checklist en el reporte): cambiar
  la production branch a `production`, dominios (`ritma.com.ar`, `www`, `dev.` →
  branch main), env vars por scope, ruleset de `production`, y abrir el PR (sin `gh` en
  esta máquina). El cutover tiene ORDEN: primero la config de Vercel, después el merge.
- **Próximo:** cutover guiado (config → merge → ver DEV con franja → Release → ensayo de
  rollback); limpieza de prod aprobada; tag `v0.2.0-f1` sobre el primer release.

## Semana 14 (agosto 2026) — el modelo de ambientes pasa a rama-por-ambiente

- **Hecho:** a pedido de Dolores, el diseño del ticket cambió del puntero (`main`=DEV +
  `production`) al modelo por rama: **`dev` = ambiente DEV** (default branch, integra
  todas las features, deploya `dev.ritma.com.ar` con franja) y **`main` = producción**
  (solo la mueve el workflow Release por fast-forward + tag). Sin doble merge por
  feature: `main` recibe `dev` ENTERO, nunca features sueltas — main es siempre prefijo
  exacto de dev. Reacomodado: gate de migraciones (`ref === "dev"`), Release (dev→main),
  E2E al pushear a `dev`, trustedOrigins (`ritma-git-dev-…`), ADR-003 reescrito,
  CLAUDE.md/README. Dolores ya había agregado `ritma.com.ar` y `www` en Vercel y abierto
  el PR #24 (CI verde).
- **Trabado:** nada. El puntero `production` se retira cuando Vercel confirme production
  branch = `main` (nunca llegó a usarse como target de deploy).
- **Próximo:** bootstrap (merge, rama `dev`, default branch, ruleset en `main`, dominio
  `dev.` → rama `dev`), primer Release, limpieza de la base prod.

## Semana 14 bis (agosto 2026) — cutover hecho: DEV y PROD viven

- **Hecho:** Dolores completó la config (production branch = `main`, default branch =
  `dev`, dominios apex/www activos) y disparó el primer **Release**:
  `release-20260812-2012` sobre `f2baee3` — producción deployada desde `main`, sin
  franja, con `ritma.com.ar` respondiendo. La rama-puntero `production` del diseño
  descartado quedó borrada. Nota operativa: el push que CREÓ `dev` no generó deploy
  (Vercel dedupea el mismo SHA que ya compilaba para `main`); este commit lo destraba
  y estrena la URL estable de DEV.
- **Trabado:** faltan dos del checklist: el **ruleset de `main`** (hoy nada impide un
  push directo por error) y el dominio **`dev.ritma.com.ar`** (la URL de rama alcanza
  mientras tanto). PRs #20 y #24 siguen abiertos con diff vacío (cerrarlos a mano).
- **Próximo:** limpieza de la base prod (decisión pendiente: wipe total vs conservar
  las dos cuentas Gmail); tag `v0.2.0-f1`; primer bloque de Fase 2 (S7) ya sobre el
  flujo nuevo.

## Semana 14 ter (agosto 2026) — ticket favicon: identidad de pestaña

- **Hecho:** diagnóstico con causa raíz encontrada — S6 SÍ había creado `icon.svg` y
  `favicon.ico`, pero el `<link>` del SVG nunca llegaba al HTML: **declarar
  `metadata.icons` en el layout (el apple-touch de la PWA) SUPRIME el link del
  `icon.svg` file-based en Next 16**, aunque la doc diga que el file-based gana
  (verificado A/B en dev: sin el config aparecen los dos links). Encima el ICO era
  Tinta 900 sobre transparente: casi invisible en pestañas oscuras — de ahí el "globo".
  Fix: todo a convención de archivos (`apple-icon.png` reemplaza al config; comentario
  centinela en el layout para que `icons` no vuelva), `icon.svg` con margen y el pulso
  Coral 500 FIJO en ambos modos (trazos Tinta 900 → Blanco roto adentro del SVG),
  `favicon.ico` regenerado 16/32/48 con el mismo arte (legibilidad verificada a 16 px),
  y títulos con `title.template` "%s · Ritma" (13 pages exportan el corto; el
  comprobante conserva su título SIN sufijo vía `absolute` — la org es la protagonista).
  Marca §9.2 versionada con la decisión del pulso.
- **Trabado:** nada.
- **Próximo:** merge a `dev` (rama sin mergear, PR de Dolores), verificación en ventana
  privada desde su máquina, y Release cuando quiera verlo en producción.

## Semana 14 quater (agosto 2026) — ticket ver/ocultar contraseña

- **Hecho:** el favicon mergeado a `dev` (PR #25, squash de Dolores). Ticket nuevo en
  `feat/password-visibility-toggle`: componente `PasswordInput` (§3.2, variante
  contraseña) compuesto sobre el Input del sistema — toggle Lucide `Eye`/`EyeOff`
  adentro del campo, 44×44 de área táctil, `aria-label` dinámico + `aria-pressed`,
  orden de tab natural (campo → toggle → CTA), default oculto y re-oculto en cada
  submit y al desmontar. Aplicado en TODO el inventario: login y registro (el único
  campo de contraseña de la app es el `AuthForm` compartido; no hay reset ni cambio
  de contraseña todavía). Vitrina en `/dev/ui` con normal/error/disabled en ambos
  modos. Verificado con Playwright contra dev: 21/21 (foco y cursor sobreviven al
  toggle, Enter no togglea, paste libre, autocomplete intacto).
- **Trabado:** nada bloqueante. Hallazgo de navegador: al cambiar el `type` del input,
  Chrome recrea el editor interno DESPUÉS del handler y resetea el cursor a 0 — la
  restauración de la selección tiene que diferirse (`setTimeout 0`); restaurar
  sincrónico pierde contra ese reset (quedó comentado en el componente).
- **Próximo:** verificación de Dolores en el teléfono (guiada en el reporte), su PR
  `dev...feat/password-visibility-toggle`, y aprobar la entrada §3.2 propuesta para la
  Especificación de componentes (la agrega ella al doc).

## Semana 15 (agosto 2026) — la raíz enruta (ticket root-redirect)

- **Hecho:** `/` dejó de servir el placeholder "hola Ritma" de F0.1 y ahora resuelve el
  destino de entrada server-side: sin sesión → `/login`, con sesión sin org → wizard, con
  org → `/dashboard`. La regla vive en `resolveLanding` ([`src/lib/landing.ts`](../src/lib/landing.ts)),
  única fuente: el layout de `(auth)` —que rebota a un logueado que abre /login— pasó a
  llamarla en vez de repetirla. Tests del helper: los tres casos + la cookie de org forjada
  compuesta con `resolveActiveOrg` (cae en la org propia, o en el wizard si no hay ninguna).
  Verificado con un recorrido real contra el build de producción, 15/15: 307 sin HTML
  intermedio, login → dashboard, logout → login, registro → wizard, y ningún loop.
- **Trabado:** dos cosas. (1) **`dev` estaba ROJO**: el merge del toggle de contraseña
  (`8fa6d70`) rompió los tres E2E — `getByLabel("Contraseña")` matchea por SUBSTRING y el
  `aria-label` del ojo ("Mostrar contraseña") lo volvió ambiguo. Arreglado con `exact: true`
  en rama propia (`fix/e2e-password-label`) para poder destrabar `dev` sin esperar este
  ticket; 3/3 en verde. (2) El redirect de la raíz **no puede vivir en el page**: el
  `loading.tsx` raíz (splash de S6) hace que la respuesta se streamee, así que el 200 ya
  salió cuando corre el `redirect()` y el salto queda del lado del cliente. Por eso el
  anónimo lo redirige el Proxy (que ahora matchea `/`) y el page decide solo cuando hay
  cookie. **Hallazgo previo, fuera de alcance:** por la misma razón, `/r/<token-inexistente>`
  responde **200** en vez de 404 (pasa hoy en producción) — el contenido es el 404 genérico,
  pero el status miente. Verificado A/B: sacando el `loading.tsx` raíz, esa misma URL vuelve
  a responder 404. O sea que lo introdujo el splash de S6. Anotado como deuda.
- **Próximo:** mergear `fix/e2e-password-label` PRIMERO (destraba `dev`), después
  `fix/root-redirect`; y decidir si el status del comprobante inexistente se arregla en un
  ticket aparte.

## Semana 15 bis (agosto 2026) — login con Google, de verdad

- **Hecho:** diagnóstico en vivo primero — el botón de Google estaba **visible en producción
  y roto desde siempre**: Google contesta `Error 400: redirect_uri_mismatch` porque la URI
  `https://ritma.com.ar/api/auth/callback/google` nunca se registró en el cliente OAuth (que
  sí existe). En DEV ni eso: `PROVIDER_NOT_FOUND`, no hay credenciales en ese scope.
  En `feat/google-login`: guarda por RAMA (`VERCEL_GIT_COMMIT_REF === "dev"`) en lugar de
  `VERCEL_ENV`, porque el DEV de ADR-003 es "preview" igual que un PR y quedaba apagado;
  vinculación de cuentas (mismo email → misma cuenta, con sus orgs); botón nuevo siguiendo
  los lineamientos de marca de Google (§3.17, con sus hex y su logo, tokens `--google-btn-*`);
  aterrizaje unificado por `resolveLanding` (`callbackURL: "/"`, y el login con contraseña
  pasa por el mismo camino); y errores del viaje a Google con copy concreto (cancelar dice
  "Cancelaste el ingreso con Google", no "algo salió mal"). 373 Vitest + 3 E2E + 20 checks de
  un recorrido real (geometría del botón contra los lineamientos, ambos modos, aterrizaje).
- **Trabado:** el bloqueante del ticket lo decidió Dolores. Better Auth 1.6.23 tiene CUATRO
  compuertas para vincular, y la que muerde es `requireLocalEmailVerified` (default `true`):
  exige que el usuario LOCAL tenga `emailVerified: true`, y el registro con contraseña lo crea
  siempre en `false` — así que ninguna cuenta preexistente podía vincularse, ni con
  `trustedProviders`. Decisión: bajar esa compuerta (`false`), sabiendo que el riesgo es el
  pre-secuestro y que Better Auth la marcó `@deprecated` — cuando se vuelva incondicional hace
  falta verificación de email por Resend. NO se declara `trustedProviders`: esa lista exime al
  proveedor de declarar el email verificado, justo lo contrario de la regla dura del ticket.
- **Próximo:** Dolores carga las credenciales y las URIs (checklist en el reporte), incluida
  la decisión de dejar el apex `ritma.com.ar` como canónico; después la verificación guiada en
  DEV y el merge. La rama queda SIN mergear hasta que eso pase.

## Semana 16 (agosto 2026) — inscribir a varios de una vez

- **Hecho:** Google quedó mergeado (#31) y funcionando: las URIs registradas andan (producción
  ya llega a la pantalla real de Google en vez del `redirect_uri_mismatch`). Ticket nuevo en
  `feat/bulk-enrollment`: el sheet de inscripción, cuando el grupo está fijo, pasó a
  selección MÚLTIPLE — buscador insensible a tildes, lista con checkboxes (la fila entera es
  el target), contador, alta express inline para el alumno que todavía no existe (vuelve ya
  tildado) y CTA "Inscribir N alumnos" con el plural correcto. Atrás: `enrollMany`, que repite
  el MISMO núcleo del flujo individual (`enrollOne`, extraído sin cambiar comportamiento)
  dentro de una `$transaction`. Componente `Checkbox` nuevo (Base UI + tokens, §3.2) con su
  vitrina. 10 tests nuevos del servicio; suite 383 verde; recorrido real 16/16.
- **Trabado:** nada. Dos decisiones que vale registrar: (1) la validación del lote va ANTES de
  abrir la transacción —así el error nombra a todos los que hay que sacar de la selección, en
  vez de morir en el primero—, y adentro `enrollOne` igual revalida (última línea de defensa
  ante una carrera); (2) el alta express se hace DESDE la lista y no abriendo otro sheet: el
  sheet sobre sheet es justo lo que la spec del componente declara evitado.
- **Próximo:** verificación de Dolores en el teléfono (guion en el reporte) y su PR. La rama
  queda SIN mergear. Ojo: el recorrido de verificación dejó datos de prueba en la base DEV
  (una tanda de 4 en "Yoga mañanas" de Estudio Meraki, con una alumna "Nueva Alumna …").

## Semana 16 bis (agosto 2026) — franjas multi-día (ticket horarios)

- **Hecho:** la inscripción múltiple mergeada a `dev` (squash, verificación completa antes del
  push). Ticket nuevo en `feat/friendly-schedule-picker`: el editor de franjas pasó a
  **multi-día** — chips Lun…Dom con toggle, presets de duración con 120′, resumen en vivo
  ("Lun, Mié y Vie · 19:00 · 90 min", `formatFranja`, §4.2) — y la franja quedó como concepto
  de UI puro: [`src/lib/franjas.ts`](../src/lib/franjas.ts) expande a un `ScheduleSlot` por
  día (cada día con su `slotId`) y re-agrupa por (hora, duración) al editar. **Cero cambios de
  schema y cero cambios al motor**: la action expande tras el Zod y el diff de `updateGroup`
  quedó intacto. Colisión interna con mensaje que nombra el conflicto ("Lunes 19:00 está
  repetido."). 401 Vitest (18 nuevos: ida/vuelta, no-fusión por duración, colisiones,
  equivalencia con el motor, huérfana mezclada con franjas vivas) + recorrido real 10/10 con
  el guion del ticket completo, cancelación de sábado + baja del sábado incluida.
- **Trabado:** nada. La guarda de excepciones huérfanas NO exigió arreglos: el motor ya las
  ignoraba por construcción (la pasada base nunca consulta claves de slots ausentes; la de
  entrantes tiene el `if (!slot) continue`) y el cascade de la base borra las filas al borrar
  el slot — quedó pinneado con el test nuevo de huérfana mezclada. Un detalle de diseño que
  vale registrar: destildar un día y arrepentirse EN la misma edición recupera su `slotId`
  (`originalDays`), así un mal tap no cuesta excepciones.
- **Próximo:** verificación de Dolores en el teléfono y su PR; la rama SIN mergear. La org
  "Estudio Grande" de la base dev quedó con grupos de prueba DESACTIVADOS ("Debug Dos",
  "Ritmos …") y disciplinas basura ("Cumbia Debug", "Tango Debug"): si molestan, se limpian
  con un ticket de datos (borrar grupos no existe en la UI, a propósito).

## Semana 17 (agosto 2026) — arranca la Fase 2

- **Decisión registrada (Dolores):** la Fase 2 (Estudios) arranca con S7; el hito de
  validación formal (Plan de implementación §8) queda **pendiente en paralelo**, no como
  bloqueante. Primer bloque: S7 — roles, invitaciones y scoping de teacher.
