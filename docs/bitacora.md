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
