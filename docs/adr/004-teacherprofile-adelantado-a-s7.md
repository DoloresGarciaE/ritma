# ADR-004 — `TeacherProfile` y `ClassGroup.teacherId` se adelantan de S9 a S7

**Estado:** aceptado (agosto 2026) · **Ticket:** S7 — roles, invitaciones y scoping de teacher

## Contexto

El plan dejó un nudo de secuencia entre dos bloques de la Fase 2:

- **S7** promete "scoping de teacher aplicado: solo sus grupos, alumnos y pagos"
  (Plan de implementación §9) — la regla transversal del Plan §4.
- Pero "sus grupos" no existía como dato: `ClassGroup` nació **sin `teacherId`**
  (deuda registrada en la nota S2 del Plan §7) porque `TeacherProfile` estaba
  agendado para **S9** (acuerdos y liquidaciones).

Sin la FK, el scoping de S7 no tiene contra qué filtrar: el DoD ("la docente dual
entra al estudio y ve únicamente su mundo") es inalcanzable, o se implementa contra
un placeholder (la convención de nombre "a cargo de {nombre}" del seed) que ninguna
query puede usar.

## Decisión

**Se paga la deuda de S2 adelantando la MITAD de S9 que es identidad, no plata:**

1. Migración con `TeacherProfile` según Plan §7 — `orgId`, `membershipUserId`
   **nullable** (revocar desvincula sin borrar historia; EXTERNAL sin cuenta, S10),
   `displayName`, `kind` (`OWNER_TEACHER | STAFF | EXTERNAL`) — y `teacherId`
   (nullable) en `ClassGroup`.
2. **Backfill:** toda org existente recibe el perfil de su OWNER (kind
   `OWNER_TEACHER` — en una INDEPENDENT es el único profe implícito de la Fase 1, y
   la dueña de un estudio suele dictar también). Los **grupos** solo se asignan en
   las INDEPENDENT (todos al owner); en un STUDIO quedan "sin profe asignado" hasta
   que un admin los asigne — adivinar sería peor.
3. `createOrganizationWithOwner` crea el perfil del owner junto con la org: un grupo
   nuevo en una INDEPENDENT se auto-asigna a ese perfil (el selector ni existe ahí).

**Lo que NO se adelanta** (sigue en S9/S10, hoy ni se roza): `Agreement`,
`Settlement`, `receivedById`/`settlementId` en `Payment`, perfiles EXTERNAL sin
cuenta y toda la aritmética de liquidaciones.

## Consecuencias

- El scoping de S7 filtra contra datos reales (`teacherId = perfil del actor`), con
  la matriz rol×recurso testeada (`tests/teacher-scope.test.ts`) — el test que F0.6
  y S2 venían difiriendo por falta de modelo queda escrito.
- S9 se encuentra el modelo ya migrado y poblado: le queda agregar `Agreement`,
  `Settlement` y las FK del pago — sin tocar lo de S7.
- La convención de nombre "a cargo de {nombre}" del seed de escenarios se reemplazó
  por asignación real; el sufijo "· Salón X" sigue siendo placeholder de S8.
- `Invitation` (el otro modelo nuevo de S7) es **adición al Plan §7 propuesta en el
  reporte de la sesión**: token opaco único (patrón comprobante), vencimiento a 7
  días, un solo uso, revocar = borrar la fila.
