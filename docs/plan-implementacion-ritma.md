# Ritma — Plan de implementación

> Documento operativo. Baja el roadmap del Plan de proyecto (§12) a tareas ejecutables.
> Versión 1.0 · Julio 2026 · Supuesto: un dev, part-time (10–15 h/semana).
> Documentos hermanos: Plan de proyecto · Especificación de marca · Especificación de color · Especificación de componentes UI.

---

## 1. Cómo usar este documento

Cada fase está desglosada en bloques con tareas (checkboxes) y un criterio de salida (DoD). Las tareas se copian como issues al tablero (§11) y se marcan acá al cerrar cada bloque. Regla de oro: **este documento define el "qué" y el "cuándo"; los otros cuatro definen el "cómo"**. Si durante la implementación aparece algo que contradice una spec, se actualiza la spec en el mismo PR — nunca se divergen en silencio.

## 2. Reglas de ejecución (solo-dev, part-time)

1. **Sesiones con un solo objetivo.** Cada sesión de trabajo (2–3 h) ataca una tarea de este plan, y termina en un commit deployable. Nada queda "a medio migrar" entre sesiones.
2. **Vertical slices.** Cada bloque entrega una porción usable de punta a punta (UI + servicio + DB + test), no capas horizontales que "después se conectan".
3. **Main siempre deployable.** Trunk-based: ramas cortas (`feat/...`), PR propio aunque no haya reviewer humano (el diff es la revisión), merge solo con CI verde.
4. **Regla de las 2 horas.** Si un problema traba más de 2 horas: se anota en el registro de decisiones, se rodea con la solución más simple o se simplifica el alcance. Los rabbit holes son el riesgo #1 de un solo-dev.
5. **El backlog no entra al sprint.** Toda idea nueva (y van a aparecer muchas) se anota como issue con label `backlog` y se revisa el viernes. La fase en curso no crece.
6. **Revisión semanal de 30 minutos** (viernes): estado del bloque, qué se posterga, riesgo de la semana, objetivo de la próxima. Se anota en `docs/bitacora.md` — tres líneas alcanzan.

## 3. Día 0 — Cuentas, servicios y decisiones previas

Antes de la primera línea de código (una sesión):

- [ ] **Verificar nombre**: disponibilidad de `ritma.app` / `ritma.com.ar` y búsqueda en INPI y en las stores (antecedente detectado: la app turca "Ritim" opera en la misma categoría). Si "Ritma" cae, se decide el nombre nuevo acá — renombrar después de F0 es barato; después de F1, no.
- [x] Crear repo privado en GitHub (`ritma`), con GitHub Projects como tablero.
- [ ] Crear cuentas/proyectos: Vercel · Neon (Postgres) · Cloudflare R2 · Resend · Sentry.
- [ ] Credenciales OAuth de Google (consent screen + client web) para el login.
- [x] Comprar el dominio elegido y delegarlo a Vercel (puede esperar a F0.7, pero conviene ya). — `ritma.com.ar` comprado; delegación a Vercel pendiente (F0.7).
- [x] Copiar los cinco documentos a `docs/` en el repo, junto con los SVG de marca en `docs/brand/` y el script `contrast.js` en `tools/`.

Decisiones ya cerradas que no se reabren durante la implementación: monolito Next.js (ADR-001, análisis vs. Go), multi-tenant por columna `orgId`, sin generalización especulativa del dominio (caso "clubes" queda en backlog), registro de pagos manual sin pasarela, alumnos sin login.

## 4. Convenciones del repo

```
ritma/
  docs/                  ← los 5 documentos + bitácora + adr/
  prisma/                ← schema.prisma, migrations/, seed.ts
  src/
    app/                 ← rutas según Plan §10 (estructura completa allí)
    components/ui/       ← componentes según Especificación de componentes
    lib/                 ← auth, db, permisos, whatsapp, receipts
    server/services/     ← lógica de negocio pura (RN1–RN10)
  tools/                 ← contrast.js y scripts de apoyo
  tests/e2e/             ← Playwright
```

- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`). Español o inglés, pero consistente (sugerido: inglés en código y commits, español en docs y UI).
- Checklist de PR (template): ¿CI verde? ¿toca dinero → tiene tests? ¿toca queries → respeta `withOrg`? ¿toca UI → cumple componentes/color? ¿cambió una regla → se versionó la spec?
- Decisiones de arquitectura: `docs/adr/NNN-titulo.md`, una página por decisión. La primera ya existe: ADR-001 monolito Next.js vs. backend Go.

## 5. Variables de entorno

| Variable | Servicio | Desde |
|---|---|---|
| `DATABASE_URL` | Neon | F0.3 |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | Auth | F0.4 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google | F0.4 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Cloudflare R2 | F1·S4 |
| `RESEND_API_KEY` | Resend | F1·S5 |
| `RECEIPT_TOKEN_SECRET` | Firma de comprobantes | F1·S5 |
| `CRON_SECRET` | Protección de endpoints de cron | F1·S3 |
| `SENTRY_DSN` | Sentry | F0.7 |
| `NEXT_PUBLIC_APP_URL` | URLs absolutas (comprobantes, emails) | F0.1 |

`.env.example` versionado desde el día 1; secretos reales solo en Vercel y en `.env.local`.

## 6. Fase 0 — Fundaciones (1–2 semanas · ~15–25 h)

**Objetivo:** registro → login → crear organización → dashboard vacío, en producción, con CI y aislamiento multi-tenant testeado.

### F0.1 — Proyecto base (1 sesión)
- [x] `create-next-app` (TS, App Router) + ESLint + Prettier + imports absolutos `@/`.
- [x] Estructura de carpetas de §4; README con enlaces a los docs.
- [x] Deploy inicial "hola Ritma" en Vercel (el deploy existe desde el día 1, no al final).

### F0.2 — Tokens y UI base (1–2 sesiones)
- [ ] `globals.css` con los tokens de Especificación de color §8 (claro y oscuro) y escalas en Tailwind.
- [ ] Fuentes con `next/font`: Inter + Space Grotesk; `tabular-nums` como utilidad.
- [ ] shadcn/ui init con mapeo de Color §8; construir Botón, Input, Badge de estado y Card según Componentes §3.
- [ ] Página interna `/dev/ui` que muestra los componentes en ambos modos (sirve de test visual permanente).

### F0.3 — Base de datos (1 sesión)
- [ ] Neon + Prisma; `schema.prisma` v1: `Organization`, `User`, `Membership` (Plan §7).
- [ ] Primera migración + `seed.ts` con las dos organizaciones de los casos de uso del Plan.

### F0.4 — Autenticación (1–2 sesiones)
- [ ] Better Auth: email+contraseña y Google; páginas login/registro con los componentes de F0.2.
- [ ] Sesión con `activeOrgId`; middleware que protege el grupo de rutas `(app)`.

### F0.5 — Organización y shell (1–2 sesiones)
- [ ] Wizard de creación de org (3 pasos, Plan HU1.1–1.2): nombre, tipo, disciplinas; defaults ARS / vencimiento 10 / zona horaria AR.
- [ ] Shell `(app)`: bottom nav de 5 ítems (Componentes §3.6), app bar, rutas placeholder, sidebar en `md`.

### F0.6 — Scoping y permisos (1 sesión, la más importante)
- [ ] Helper `withOrg` en `lib/db`: toda query de negocio pasa por él; regla de lint o convención que prohíbe `prisma.*` directo fuera de `lib` y `server`.
- [ ] Capa de permisos por rol (`owner`/`admin`/`teacher`) en `server/services`.
- [ ] **Tests de aislamiento**: un usuario de la org A no lee/escribe datos de la org B; un teacher no accede a grupos ajenos. Corren en CI para siempre.

### F0.7 — CI/CD y observabilidad (1 sesión)
- [ ] GitHub Actions: lint + typecheck + Vitest en cada PR; Playwright en `main`.
- [ ] Vercel: preview por PR, producción desde `main`, dominio conectado; Sentry client+server.

**DoD Fase 0:** una persona ajena puede registrarse en producción, crear su organización y ver el dashboard vacío con el CTA "Creá tu primer grupo"; CI verde; tests de scoping pasando.

## 7. Fase 1 — MVP profe independiente (4–6 semanas · ~50–70 h)

**Objetivo:** un profe real opera un mes completo sin su planilla. Cada bloque ≈ una semana part-time y termina deployado.

### S1 — Alumnos
- [ ] Modelo `Student` + migración; CRUD con búsqueda al tipear (Plan HU2.1–2.3).
- [ ] Alta express: FAB + bottom sheet con nombre y teléfono; validación E.164 (`libphonenumber-js`), default +54.
- [ ] Ficha de alumno v1 (datos + notas); baja lógica conservando historial.
- **DoD:** cargar 20 alumnos reales toma < 10 minutos desde el teléfono.

### S2 — Agenda
- [ ] Modelos `Discipline`, `ClassGroup`, `ScheduleSlot`, `ClassSession`; creación de grupo con múltiples franjas (HU3.1).
- [ ] Generación de sesiones on-demand para las semanas visibles (servicio puro + tests); cancelar/reprogramar sesión puntual (HU3.3).
- [ ] Vistas semana y día mobile-first con el bloque de sesión (Componentes §3.7).
- **DoD:** la semana del profe se ve correcta con feriado cancelado incluido.

### S3 — Cobranzas: inscripciones y cuotas
- [ ] Modelos `Enrollment` y `Charge`; inscribir alumno a grupo con plan y precio (HU4.1).
- [ ] Servicio `generateCharges(period)` (RN1–RN2) como función pura + tests; ídem `markOverdue` (RN3, HU4.5).
- [ ] Vercel Cron (mensual y diario) protegido con `CRON_SECRET`; pantalla Deudores por período.
- **DoD:** al simular el cambio de mes en seed, las cuotas correctas aparecen con el estado correcto.

### S4 — Cobranzas: pagos
- [ ] Modelos `Payment` y `PaymentAllocation`; servicio de imputación automática (RN4) con suite de tests exhaustiva: parciales, multi-cuota, excedente a favor.
- [ ] Sheet "Registrar pago" (HU4.3): monto pre-cargado, método, fecha, imputación editable; input de monto según Componentes §3.2.
- [ ] Adjunto de comprobante de transferencia a R2 con URL firmada.
- **DoD:** cronometrado en el teléfono, registrar un pago toma < 15 segundos; los tests de imputación cubren los casos de RN4.

### S5 — Comprobantes y recordatorios
- [ ] `receiptToken` firmado (HMAC con `RECEIPT_TOKEN_SECRET`); página pública `/r/[token]` según Marca §9.1, con pie "Generado con Ritma".
- [ ] Imagen compartible (`@vercel/og`) + Web Share API; toast "Pago registrado · Compartir comprobante".
- [ ] Plantilla de recordatorio editable en Ajustes (Marca §4.2); builder de link `wa.me`; envío por email (Resend); `ReminderLog`.
- **DoD:** el link del comprobante abre bien en WhatsApp de un teléfono ajeno; el recordatorio llega pre-armado con nombre, período, monto y alias.

### S6 — Dashboard, PWA y pulido
- [ ] Dashboard (HU7.1): cobrado, pendiente, deudores, clases de hoy — cards de métrica navegables.
- [ ] PWA: manifest + íconos desde `ritma-app-icon.svg` (512/192/180) + splash con el pulso (Marca §8, con `prefers-reduced-motion`).
- [ ] Estados vacíos de todas las pantallas (Componentes §3.10); pasada de accesibilidad con el checklist de Componentes §5.
- [ ] E2E Playwright de los flujos F1 y F2 del Plan (§9).
- **DoD Fase 1 completo = DoD del Plan §12** + E2E verdes.

## 8. Hito de validación (1–2 semanas, en paralelo al cierre de F1)

- [ ] Reclutar 2–3 profes reales de disciplinas distintas (contacto directo, no landing).
- [ ] Onboarding manual acompañado: cargar juntos sus alumnos y grupos reales en una sesión de 45 min.
- [ ] Semana 1–3: contacto cada viernes; registrar en la bitácora: ¿cargó pagos esta semana?, ¿qué preguntó?, ¿dónde se trabó?, ¿volvió a la planilla?
- [ ] Medir contra las métricas del Plan §14 (activación, cuotas registradas, tiempo de carga, recordatorios).
- [ ] **Decisión go/no-go escrita** (ADR): si los profes independientes no lo sostienen, la Fase 2 se pausa y se corrige F1 — un estudio es un multiplicador de un flujo que tiene que funcionar primero.

## 9. Fase 2 — Estudios (3–4 semanas · ~40–55 h)

### S7 — Roles e invitaciones
- [ ] Invitación por link de un solo uso (HU1.3); membresías `admin`/`teacher`; revocación sin pérdida de historial.
- [ ] Scoping de teacher aplicado a la UI: solo sus grupos, alumnos y pagos (Componentes §4.3) + ampliación de los tests de aislamiento por rol.

### S8 — Espacios y calendario del estudio
- [ ] Modelo `Space`; asignación de salón a grupos; validación de superposición (HU3.1).
- [ ] Calendario del estudio con filtro por salón y por profe (HU3.4); huecos libres visibles.

### S9 — Acuerdos y liquidaciones
- [ ] Modelos `TeacherProfile` (kind), `Agreement` (con vigencia) y `Settlement`; campo `receivedBy` en el pago (RN5).
- [ ] `computeSettlement` como función pura con la suite de tests más exhaustiva del proyecto (RN6): casos con cobro en mano mayor y menor al neto, período sin pagos, cambio de porcentaje a mitad de vigencia.
- [ ] UI de liquidaciones con drill-down a pagos, cierre (`CLOSED` congela pagos) y marca de pagada (HU6.2, HU6.4).

### S10 — Alquileres y reportes
- [ ] `RentalCharge`: acuerdos mensual y por hora/turno (RN7, calculado sobre sesiones no canceladas); marcar pagado.
- [ ] Reporte de ingresos por profe y disciplina + export CSV (HU7.2).
- **DoD Fase 2 = DoD del Plan §12:** el cierre de mes de un estudio con 3 staff y 1 externo cuadra contra su planilla histórica.

## 10. Estrategia de testing

| Capa | Qué | Herramienta | Regla |
|---|---|---|---|
| Servicios de dinero | Imputaciones, generación de cuotas, estados, liquidaciones, alquileres | Vitest | Cobertura total de RN1–RN10; se escriben junto con el servicio, no después |
| Autorización | Aislamiento org×org y rol×recurso | Vitest | Corren en cada PR, nunca se saltean |
| E2E smoke | Flujos F1, F2 y F3 del Plan §9 | Playwright | En `main`; 3 flujos, no más en MVP |
| Visual | Página `/dev/ui` en ambos modos | Manual | Revisión en la semanal |

Lo que **no** se testea en MVP: componentes de UI unitarios, snapshots, coverage % como métrica. El criterio es: los errores de plata destruyen la confianza (Plan §13) — ahí va todo el rigor; el resto se cubre con los smoke tests.

## 11. Gestión del trabajo

- **Tablero:** GitHub Projects con columnas Backlog · Fase actual · En curso (máx. 1) · Hecho. Labels: `f0`–`f2`, `bug`, `backlog`, `validacion`.
- **Bitácora:** `docs/bitacora.md`, tres líneas por semana (hecho / trabado / próximo). Es también la memoria para retomar después de una semana sin tocar el proyecto.
- **Calendario tentativo** (arrancando mediados de julio 2026, ajustable sin culpa): F0 → fin de julio · F1 → agosto a mediados de septiembre · Validación → fin de septiembre · F2 → octubre–noviembre.

## 12. Riesgos de ejecución y contramedidas

| Riesgo | Contramedida |
|---|---|
| Parálisis por perfeccionismo en F0 (tooling infinito) | F0 tiene tope duro de 2 semanas; lo que falte va a backlog |
| Rabbit holes técnicos | Regla de las 2 horas (§2.4) |
| Scope creep desde la propia cabeza | §2.5: backlog sí, sprint no; el caso "clubes" está explícitamente vedado hasta post-F2 |
| Semanas sin avance (vida real) | Bloques autocontenidos + bitácora para retomar; el calendario se corre, el orden no |
| Validación pospuesta por vergüenza del producto | El hito §8 es parte del plan, no un opcional; se agenda con fecha al cerrar S4 |

## 13. Primera sesión de trabajo

1. Completar el checklist de Día 0 (§3) — si el nombre no está verificado, eso es lo primero.
2. `npx create-next-app@latest ritma` + repo + primer deploy en Vercel (F0.1 completa).
3. Crear los issues de F0 en el tablero, copiados de §6.
4. Anotar en la bitácora: "Semana 1: arrancó Ritma."

A partir de ahí, este documento se lee de arriba hacia abajo, un checkbox a la vez.
