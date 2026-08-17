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
- ⚠️ **La configuración de orígenes es la trampa recurrente de esta base**: ya rompió el login de
  Google (`redirect_uri`), el dev en otro puerto, el primer deploy con el dominio definitivo antes
  de que propagara, y los previews de los PRs. Está fijada con tests en
  [`tests/auth-origins.test.ts`](tests/auth-origins.test.ts) — si tocás `auth.ts`, corrélos.
- **`baseURL` se DERIVA, no se carga a mano** ([`src/lib/auth.ts`](src/lib/auth.ts)): es
  `BETTER_AUTH_URL` si está, y si no la URL de la rama (`VERCEL_BRANCH_URL`, que Vercel inyecta
  sola en los previews). Si no se la das, **Better Auth cae a `http://localhost:3000`** y en un
  deploy eso hace que Google reciba un redirect_uri de localhost: login imposible, sin ningún error
  que lo explique.
- **`trustedOrigins`** lista el apex, el www, la URL de producción y —en preview— la de la rama
  **y** la del deploy: un preview se puede abrir por cualquiera de las dos. Si aparece un origen
  nuevo, **agregalo ahí**; no alcanza con cambiar `BETTER_AUTH_URL`.
- **Google se apaga SOLO en los previews de PR** (ticket Google, ago 2026): Google valida el
  `redirect_uri` contra una lista fija y no acepta comodines, así que el botón se ofrece donde el
  origen es estable y su URI está registrada —local, DEV y producción— y se apaga donde cambia con
  cada rama. ⚠️ `VERCEL_ENV` NO distingue DEV de un PR (los dos son `preview`): el discriminador es
  `VERCEL_GIT_COMMIT_REF === "dev"`, el mismo que el gate de migraciones. La URI a registrar es
  `<origen>/api/auth/callback/google` y el origen sale de **`BETTER_AUTH_URL`**, no de
  `trustedOrigins` — por eso en Vercel `BETTER_AUTH_URL` y `NEXT_PUBLIC_APP_URL` están acotadas a
  la rama `dev` (scope Preview + branch), o el deploy de DEV le mandaría a Google la URL fea de la
  rama.
- **Vincular cuentas: Google entra a la cuenta que ya existe.** Con el mismo email, el ingreso con
  Google aterriza en el `User` de siempre (mismo id → organizaciones y membresías intactas) y solo
  suma una fila en `Account`; nunca hay dos usuarios con un email. NO se declara `trustedProviders`:
  esa lista exime al proveedor de declarar el email verificado, que es justo la prueba que exigimos.
  Sí se baja `requireLocalEmailVerified` (decisión del ticket): el default exige que el usuario
  LOCAL tenga `emailVerified: true` y el registro con contraseña lo crea siempre en `false`, así que
  ninguna cuenta preexistente podría vincularse. ⚠️ **Deuda:** Better Auth marcó esa opción
  `@deprecated` y el gate se vuelve incondicional en el próximo minor — ahí hace falta verificación
  de email (Resend). Fijado en [`tests/google-linking.test.ts`](tests/google-linking.test.ts).
- **El aterrizaje es UNO SOLO** para contraseña y para Google: `callbackURL: "/"` y `resolveLanding`
  decide (sin org → wizard). Los errores del flujo social **no llegan por la promesa** —el navegador
  ya se fue a Google—: vuelven como `?error=<código>` al `errorCallbackURL` (la pantalla desde la
  que salió) y los traduce `toSocialError` ([`src/lib/auth-errors.ts`](src/lib/auth-errors.ts)).
  Sin `errorCallbackURL`, en producción Better Auth escupe al usuario en `/?error=…` sin decirle nada.

## Organización y shell (desde F0.5)

- **`/` es SOLO un redirect server-side** ([`src/lib/landing.ts`](src/lib/landing.ts)):
  `resolveLanding` — sin sesión → `/login`, sin org → wizard, con org → `/dashboard` — es la
  única fuente del destino de entrada y la comparten la raíz y el layout de `(auth)`. La
  landing pública de Fase 3 reemplaza la página; ese día la resolución se muda al CTA de
  entrada. ⚠️ El anónimo lo redirige el **Proxy** (matchea `/`; sin cookie → `/login`), no el
  page: el `redirect()` de un page llega tarde — el `loading.tsx` raíz ya flusheó un 200 con
  el splash y el salto queda en el cliente. Con cookie, el page decide con la sesión real.
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

## El patrón para un modelo de negocio nuevo (desde S1)

`Student` (S1) es la plantilla. Todo modelo de negocio que llegue después se construye **en este
orden**, y la seguridad va primero:

1. **Schema + migración.** Toda tabla de negocio lleva `orgId` con índice, `createdAt`/`updatedAt`.
2. **Clasificarlo en `SCOPE`** ([`src/lib/db.ts`](src/lib/db.ts)) como `orgId`. Si te lo olvidás,
   **no compila** — esa es la red de F0.6, no la desactives.
3. **Tests de aislamiento** en [`tests/isolation.test.ts`](tests/isolation.test.ts), copiando el
   bloque de `Student`: A no lee, no edita, no borra lo de B; y una escritura vía `withOrg(A)` no
   puede aterrizar en B. **No es opcional.**
4. **Servicio** en `server/services/`, que recibe `orgId` y usa `withOrg`. Nunca `db` crudo.
5. **Server actions** con `requireMember(orgId)` **cada una**: el layout de `(app)` NO las protege
   (se invocan por POST directo, sin pasar por él).
6. **UI** al final, y los componentes nuevos van a [`/dev/ui`](src/app/dev/ui/page.tsx).

- **Búsqueda de texto:** se busca contra una columna normalizada (`searchName`: minúsculas y sin
  tildes, ver [`src/lib/students.ts`](src/lib/students.ts)), no con `unaccent` de Postgres — eso
  exigiría SQL crudo, que se saltea `withOrg`.
- **Referencias cruzadas y escrituras anidadas** (los dos límites de `withOrg`, y desde S2 con
  patrón fijo): un FK no distingue tenants, así que todo id que viene del cliente y referencia
  otra tabla (`disciplineId`, `slotId`…) se **verifica contra la org vía `withOrg` ANTES de
  escribir**; y las escrituras anidadas llevan el `orgId` **explícito** en cada hijo (el hook no
  las cubre). Los dos casos tienen tests (groups/sessions).
- **Teléfonos:** se guardan en **E.164** (`+541155554433`) con `libphonenumber-js`, default AR. El
  profe tipea "11 5555-4433"; el formato lindo es cosa de la vista (`formatPhone`).
- **Bajas (RN9):** siempre **lógicas** (`active = false`). Nunca se borra una fila de negocio: el
  historial queda consultable.

## Agenda (desde S2)

- **Las sesiones NO se materializan.** Las ocurrencias se calculan al vuelo desde `ScheduleSlot`
  para el rango visible (motor puro: [`src/server/services/schedule.ts`](src/server/services/schedule.ts));
  una fila `ClassSession` existe **solo** si esa ocurrencia se desvió (cancelada / reprogramada /
  anotada). Identidad: `(slotId, date)` con `date` = fecha civil **original** — no cambia al
  reprogramar (la nueva posición vive en `movedToDate`/`movedToStartTime`, el status no se toca).
  **Restablecer = borrar la fila**: la verdad vuelve a ser la calculada. Sin crons, sin RRULE.
- **Fechas civiles como strings.** Todo el dominio de agenda maneja `"yyyy-MM-dd"` y `"HH:mm"`
  (RN10): la aritmética vive en [`src/lib/dates.ts`](src/lib/dates.ts) (pura, anclada en UTC) y
  la zona de la org interviene en UN lugar: `todayInTz`. Cero `Date` cruzando a cliente; el par
  `civilToDb`/`dbToCivil` es la única frontera con Prisma (`@db.Date`). ⚠️ No usar librerías que
  operen en el huso del servidor para fechas civiles; `@date-fns/tz` (TZDate) solo para "hoy".
- **`weekday` es 0–6 convención JS (0 = domingo)** para calzar con `Date.getDay()`; la UI es
  lunes-primero (la traducción es `(weekday + 6) % 7`, ya encapsulada donde hace falta).
- **El diff de franjas protege las excepciones** (`updateGroup`): cambiar hora/duración es update
  in place (las excepciones sobreviven); cambiar el weekday o borrar la franja es identidad nueva
  y **las excepciones se van por cascada** — deliberado, testeado, y la UI lo advierte (§3.15).
- **La franja multi-día es UI, no modelo** (ticket horarios, ago 2026): el form edita
  {días, hora, duración} y [`src/lib/franjas.ts`](src/lib/franjas.ts) la EXPANDE a un
  `ScheduleSlot` por día (cada día con su `slotId`, así el diff de `updateGroup` decide igual
  que siempre); al editar, los slots se RE-AGRUPAN por (hora, duración) — misma hora con
  distinta duración no se fusiona. Colisión interna (mismo día + misma hora) se corta en el
  Zod con mensaje que nombra el conflicto. El resumen ("Lun, Mié y Vie · 19:00 · 90 min") es
  `formatFranja` (§4.2): una sola función, editor y listas. El motor no se enteró del cambio
  (hay test de equivalencia), y las excepciones huérfanas ya las ignoraba por construcción.
- **Colores de disciplina**: tokens `discipline-1..N` (Color §4), asignación estable por orden de
  creación de la disciplina, cíclica módulo N ([`src/lib/discipline-colors.ts`](src/lib/discipline-colors.ts)).
  No existe Coral 400: reprueba el contraste (el claro usa Coral 500 — Color, changelog 1.4).
- **`ClassGroup` sin `teacherId`/`spaceId` hasta S9/S8** (nota S2 del Plan §7): en Fase 1 un
  TEACHER de estudio ve/gestiona todos los grupos de su org; el test de teacher-scope se escribe
  en S9, cuando exista la FK.

## Cobranzas (desde S3)

- **El motor de cuotas es puro** ([`src/server/services/billing.ts`](src/server/services/billing.ts)):
  `generateCharges` (RN1–RN2), `dropInCharge` (propuesta RN11) y `markOverdue` (RN3) reciben
  datos y devuelven resultados. **El monto viaja como tipo opaco** (`<A>`; Prisma Decimal en
  producción): el motor no puede hacer aritmética con él — dinero sin flotantes POR
  CONSTRUCCIÓN. Cuando una regla necesite sumar plata (S4), es con `Prisma.Decimal`, jamás
  `number`; a `number` se convierte solo al borde, para mostrar (patrón `defaultPrice` de S2).
- **Idempotencia por diseño:** la garantía dura es el unique `(enrollmentId, period)`; todo el
  que genera upsertea sobre él con `update: {}`. Correr el cron N veces deja las mismas filas y
  NO pisa una cuota editada a mano (RN2). Hay un test explícito de las dos cosas.
- **`forSystem()` es la puerta de sistema** ([`src/lib/db.ts`](src/lib/db.ts)): los crons operan
  cross-org — sin sesión, sin actor, sin un orgId — y `withOrg` no puede representarlos. ESLint
  la permite SOLO en `src/server/system/` (donde el `db` crudo sigue prohibido): así "query de
  sistema" es una categoría con nombre y lint, no un `db` crudo suelto. Los jobs iteran org por
  org, alimentan al motor puro (que no sabe de esta distinción) y escriben con el `orgId`
  explícito. Servicios de negocio, pages y actions JAMÁS la importan.
- **Períodos y relojes (RN10):** el período (`"YYYY-MM"`) y el "hoy" de cada org se calculan en
  SU zona (`periodOf(todayInTz(tz))`); `dueDate` = día `dueDay` de la org **clampeado** al largo
  real del mes (`dateInPeriod`: dueDay 31 en abril → 30). Helpers de período en
  [`src/lib/dates.ts`](src/lib/dates.ts); "Julio 2026" sale de `formatPeriod` (§4.2). Los
  schedules de [`vercel.json`](vercel.json) están en UTC corridos a madrugada argentina
  (06:00 el día 1 y 06:30 diario = 03:00/03:30 en AR).
- **`/api/cron/*` es fail-closed:** sin `CRON_SECRET` responde 401 SIEMPRE (un endpoint que
  genera deuda no queda abierto por una env olvidada); la comparación del Bearer es
  `timingSafeEqual`. Vercel manda el header solo. En local no hace falta el secreto:
  `npm run cron:dev -- <job> [período]` dispara el job contra la base de dev — así se simula el
  cambio de mes (el DoD de S3; el seed hace exactamente eso con los jobs reales).
- **Inscribir de a uno o de a varios es EL MISMO núcleo** (`enrollOne`, privado de
  [`services/enrollments.ts`](src/server/services/enrollments.ts)): `createEnrollment` lo llama
  una vez y `enrollMany` lo repite dentro de UNA `$transaction` — o entran todos o no entra
  ninguno, y cada alumno recibe exactamente la cuota que recibiría solo (cero billing nuevo).
  Una tanda comparte grupo, plan, precio y fecha; las excepciones por alumno son el flujo
  individual o editar la cuota después (RN2). Lo que puede fallar (alumno ajeno, ya inscripto)
  se valida CON EL LOTE COMPLETO antes de abrir la transacción, así el mensaje nombra a todos
  los que hay que sacar de la selección. El crédito a favor se aplica por alumno DESPUÉS,
  igual que en el individual.
- **Inscribir crea la cuota inicial en la MISMA escritura anidada** (orgId explícito en la
  cuota) y con el MISMO motor que el cron: mensual → la del período en curso si corresponde;
  clase suelta → cargo único con vencimiento a 7 días (RN11, pendiente de aprobar en Plan §8).
  **Alta retroactiva genera SOLO el período en curso** — la deuda vieja se cobró fuera de Ritma
  (caso onboarding); fabricarla sorprendería. Decisión S3.
- **Baja de inscripción = `endDate`** (RN9): el período que contiene la baja todavía genera; los
  siguientes no; las cuotas ya generadas persisten (exonerables). Dos inscripciones ABIERTAS del
  mismo alumno al mismo grupo no se puede; cerrada y re-inscribirse, sí.
- **Mutaciones manuales con reglas de estado:** editar el monto solo en PENDING/OVERDUE (RN2), y
  desde S4 **nunca por debajo de lo ya pagado**; exonerar jamás una PAID (RN3) **ni una cuota con
  imputaciones**. Las dos son de owner/admin: `assertRole` en la action, y la UI ni siquiera se
  las muestra a un teacher (§4.3) — nunca es la única guardia.

## Pagos (desde S4)

- **La aritmética de dinero vive SOLO en `services/billing.ts`** (regla dura S4): `money`,
  `sumMoney`, `allocateGreedy`, `recomputeChargeStatus` — todo `Prisma.Decimal`, jamás `number`
  (a `number` solo al borde, para mostrar). Si un módulo necesita sumar plata, importa los
  helpers; no re-implementa.
- **`recomputeChargeStatus` es LA fuente de verdad de RN3**: crear, editar o borrar un pago —o
  editar el monto de una cuota— recalcula por esa única función. Una parcial VENCIDA es OVERDUE
  (el badge no disfraza la mora); una vencida cubierta pasa DIRECTO a PAID; WAIVED no lo mueve
  nada. Está probada su coincidencia con `markOverdue`.
- **Transacción o nada:** pago + imputaciones + recálculo entran juntos (`$transaction`
  interactivo del cliente `withOrg`; el hook de scoping aplica adentro). Invariantes del motor
  (`validateAllocations`): la suma de imputaciones nunca supera el pago; una imputación nunca
  supera el remanente de su cuota. Una imputación manual inválida deja CERO filas.
- **El saldo a favor es un DERIVADO** (pagos − imputaciones), nunca una columna: imposible de
  desincronizar. `allocateGreedy` sirve los DOS consumos de RN4 con una sola función en el orden
  del caller: el pago nuevo contra las cuotas impagas (antigua-primero), y el crédito contra las
  cuotas recién generadas — lo aplica `applyStudentCredit`, llamado por el cron de generación
  (que sigue idempotente, testeado) y por la cuota inicial del alta.
- **Eliminar un pago (propuesta RN12, pendiente de aprobar en Plan §8):** solo pagos sin
  liquidación (todas en Fase 1), con confirmación que nombra monto y alumno; la transacción
  revierte imputaciones y los estados vuelven solos por calendario. La inmutabilidad llega con el
  cierre de liquidaciones (RN6, S9).
- **Adjuntos (R2, [`src/lib/r2.ts`](src/lib/r2.ts)):** bucket privado; keys SIEMPRE
  `{orgId}/payments/{paymentId}` armadas en el server desde la SESIÓN; URLs firmadas cortas (PUT
  5 min / GET 60 s) previa verificación vía `withOrg`; `confirmAttachment` valida tipo y tamaño
  contra lo que REALMENTE llegó al bucket (HeadObject). **Sin las 4 env `R2_*` el feature entero
  se apaga** (`isR2Configured`): la UI no muestra el campo y el pago sin foto es el flujo
  principal. `receiptToken` (S5) se genera SIEMPRE al crear el pago: opaco, 24 bytes aleatorios.
- **`receivedBy` (RN5):** existe siempre con default STUDIO; el selector solo aparece en una org
  STUDIO. `receivedById` (QUÉ profe) y `settlementId` llegan con S9.

## Comprobantes y recordatorios (desde S5)

- **`forPublic()` es la segunda excepción legítima al scoping** ([`src/lib/db.ts`](src/lib/db.ts)),
  hermana de `forSystem()`: el comprobante `/r/[token]` se resuelve sin sesión ni org, y la
  autorización ES el token (opaco, 192 bits, `@unique`). ESLint la permite SOLO en
  `src/server/public/` — un único accesor `getReceiptByToken` que devuelve EXACTAMENTE la pieza
  de Marca §9.1 y nada más (sin ids, adjuntos, historial ni contacto; hay un test que pinnea el
  shape campo por campo). Token desconocido → null → 404 genérico que no confirma nada.
- **Revocar = rotar el token** (`rotateReceiptToken`): el link compartido muere en el acto y nace
  uno nuevo. No hay estado "revocado" ni HMAC ni `RECEIPT_TOKEN_SECRET`: un token que ya no está
  en la base no autoriza nada. El token viaja al cliente solo al compartir (`receiptLinkAction`),
  nunca en los payloads de listas.
- **El comprobante es SOLO modo claro** (Color §5): la página fuerza `.light`, decida lo que
  decida el sistema del que abre el link. Fecha en formato documento ("12 de mayo de 2026",
  `formatDocumentDate`). El no-indexado es el `noindex` de la meta; ⚠️ [`robots.ts`](src/app/robots.ts)
  NO bloquea `/r/` a propósito — bloquear el crawl impediría LEER el noindex y la URL podría
  indexarse pelada ("indexed, though blocked by robots.txt").
- **La imagen OG se genera al vuelo** (`opengraph-image.tsx` en el segmento, `next/og`) por la
  MISMA puerta pública, y muestra org, período y monto — sin el alumno: un link reenviado no
  tiene por qué decir quién pagó. satori no lee CSS vars ni `next/font`: colores con los hex del
  modo claro de Color §8 (comentados como tokens) y TTF estáticos commiteados en `assets/fonts/`.
  ⚠️ `metadataBase` vive en el layout raíz: sin él, un path relativo en metadata es ERROR DE
  BUILD en Next 16.
- **Plantilla de recordatorio** ([`src/lib/reminders.ts`](src/lib/reminders.ts)): render puro,
  cuatro variables ({nombre} {periodo} {monto} {alias}) y ni una más; la default ES el ejemplo
  normativo de Marca §4.2 con variables — y una org SIN alias usa la default SIN la frase de la
  transferencia (jamás se manda "transferir a ."). Una variable desconocida queda VISIBLE sin
  reemplazar (se ve en la vista previa de Ajustes, §3.16). `{monto}` = deuda del PERÍODO
  COMPLETO en remanentes, agregada por alumno en `debtorsForPeriod` — el filtro de grupo de
  Deudores no la achica (la UI jamás suma plata: regla S4). El EMAIL manda la misma plantilla
  **sin emojis** (`withoutEmojis`): Marca §4 los permite solo en canales conversacionales.
- **El log es honesto por diseño:** `WHATSAPP_LINK` se registra al DISPARAR el link `wa.me`
  (mejor esfuerzo — la app no puede saber si el profe tocó "enviar"; F2 paso 3); `EMAIL` recién
  cuando Resend ACEPTÓ el envío. El botón de WhatsApp es un `<a>` con el link pre-armado en el
  server — nunca `window.open` después de un await: un popup blocker se lo comería.
- **Email detrás de guarda de env** ([`src/lib/email.ts`](src/lib/email.ts), patrón R2): sin
  `RESEND_API_KEY` la opción se muestra deshabilitada CON MOTIVO (§4.3, decisión S5) — no se
  oculta, porque es "temporalmente no disponible", no un permiso. Sin SDK: un POST a la API.
  `RESEND_FROM` define el remitente (dominio verificado); el header lleva
  `public/brand/ritma-logotipo.png` (los clientes de email no renderizan SVG).
- **`sentAt` es un INSTANTE** (evento), no fecha civil: la ficha lo convierte con `civilDateOf`
  ([`src/lib/dates.ts`](src/lib/dates.ts)) — el mismo único punto de contacto con la zona que
  `todayInTz`. El historial muestra fecha y canal, sin estados de "leído" inventados.

## Dashboard y PWA (desde S6)

- **Las métricas del Inicio salen SOLO de `services/metrics.ts`** (`dashboardMetrics`), y ese
  servicio NO inventa varas: "cobrado" = imputaciones del período (S4), "pendiente"/"deudores" =
  la MISMA llamada `debtorsForPeriod` que renderiza Cobranzas (cuadran por construcción, hay
  test), "clases de hoy" = `weekData` (S2) filtrado al día. Ninguna query agregada en
  componentes; la aritmética sigue siendo del motor (`sumMoney`).
- **PWA sin service worker** (decisión S6): manifest + íconos + instalable; cero caché offline,
  cero push. Los íconos rasterizados viven en `public/brand/ritma-app-icon-{512,192,180}.png`
  (del maestro `docs/brand/ritma-app-icon.svg`, Marca §9.2); el favicon es `src/app/icon.svg`
  (SVG theme-aware: Tinta 900 / Blanco roto) + `favicon.ico` de fallback.
- **El splash es el `loading.tsx` raíz** y anima SOLO el punto coral del isotipo
  (`RitmaIsotipo pulse` — Marca §8: el resto del logo jamás se anima); los skeletons por
  pantalla (§3.14) usan `bg-muted` + `animate-skeleton` (1.5 s). Todo con `motion-safe:`.
- **E2E = tres flujos y no más** (Plan §10): onboarding (smoke F0.7), F1 (pago → comprobante
  público sin login) y F2 (recordatorio → log). Corren SOLO en push a `main`, arman sus datos
  por la UI real (helpers en `tests/e2e/helpers.ts`). ⚠️ El origen de los links compartidos se
  hornea en el build (`NEXT_PUBLIC_APP_URL`): el spec de F1 normaliza el origen a propósito.
- ⚠️ El `AmountInput` controlado CONCATENA dígitos si le hacés `fill` con valor previo (los
  E2E no re-tipean precios pre-cargados: los verifican).

## Entornos y releases (desde el ticket DEV/PROD — ADR-003)

- **Una rama por ambiente: `dev` es DEV, `main` es producción.** `dev` es la default branch:
  TODA rama de trabajo sale de `dev` y se mergea a `dev` (una feature = UN merge; `main` no
  recibe features sueltas). Cada merge a `dev` deploya el ambiente DEV con URL estable
  (`ritma-git-dev-…` / `dev.ritma.com.ar`) contra la base dev, con la franja "DEV".
- **Release = disparar el workflow `Release`** (Actions → Release → Run workflow, escribir
  `release`). ES el "merge de dev a main": verifica CI verde en la punta de `dev` (los tres
  E2E corren en cada push a `dev`), fast-forwardea `main` y etiqueta `release-YYYYMMDD-HHmm`;
  Vercel deploya producción solo. `main` **jamás** recibe commits directos ni PRs — la mueve
  solo el workflow, así `main` es siempre un prefijo exacto de `dev`.
- **Rollback:** mover `main` al tag anterior y dejar que Vercel redeploye:
  `git fetch --tags && git push --force-with-lease origin <tag-anterior>^{commit}:refs/heads/main`
  (el force es legítimo SOLO acá: producción retrocede a un estado ya deployado). El código
  vuelve; la base NO se desmigra — por eso las migraciones son expand/contract.
- **La franja "DEV"** ([`src/components/env-banner.tsx`](src/components/env-banner.tsx)) aparece
  en todo `VERCEL_ENV=preview` (DEV y previews de PR) y nunca en producción ni en local.

## CI/CD y observabilidad (desde F0.7)

- **Un branch de Neon por entorno.** Neon `production` → Vercel Production (rama `main`);
  Neon `dev` → tu `.env.local`, el ambiente DEV (rama `dev`) **y** los previews de PR. Los
  tests **no usan Neon**: van contra el Postgres efímero de `docker-compose.test.yml`. Nunca
  compartas base entre entornos.
- **Las migraciones viajan con el deploy, con gate por entorno.** [`vercel.json`](vercel.json)
  fija el build a `npm run vercel-build` = [`scripts/vercel-build.mjs`](scripts/vercel-build.mjs):
  migra SOLO producción y los deploys de la rama `dev` (una migración se estrena en DEV al
  mergear); los previews de PR usan la base dev SIN migrar, y el build local no toca ninguna
  base. Corolario: **`DIRECT_URL` es obligatoria en Vercel en los DOS scopes** (el CLI de
  Prisma no puede hacer DDL por el pooler); sin ella, el deploy falla en el build.
- **CI sin secretos** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): en cada PR corren
  lint + typecheck + `format:check` + Vitest; al pushear a `dev`, además los tres E2E de Playwright.
  El Postgres de los tests es un `services:` container mapeado a `localhost:15432`, o sea la misma
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
  (`docker-compose.test.yml`, puerto 15432); [`tests/db.ts`](tests/db.ts) tiene una guarda de 4
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

El gestor de paquetes es **npm** (lo fija `package-lock.json`): todo script y ejemplo es
`npm run …` / `npx …`. Nunca asumir pnpm ni yarn.

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

- Ramas cortas `feat/...` que salen de **`dev`** y se mergean a **`dev`** (la default branch),
  PR propio (el diff es la revisión), merge solo con CI verde. **Un bloque del plan = una
  sesión = un commit deployable.** Nada queda a medio migrar. `main` es producción y no se
  toca a mano: solo el workflow Release (ADR-003).
- **Sesión interrumpida a mitad:** lo ÚLTIMO antes de frenar es actualizar `docs/bitacora.md`
  y el snapshot de estado (los checkboxes de `docs/plan-implementacion-ritma.md`) con el
  estado parcial **real** — qué se hizo, qué no, en qué rama quedó. Nunca un snapshot que
  diga más de lo que hay: la sesión siguiente arranca de ahí y se lo cree.
- Checklist de PR: ¿CI verde? ¿toca dinero → tiene tests? ¿toca queries → respeta `withOrg`?
  ¿toca UI → cumple componentes/color? ¿cambió una regla → se versionó la spec?
- Ideas nuevas fuera del bloque en curso → backlog, no al sprint en curso.
