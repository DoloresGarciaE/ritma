# Recorrido de demo — tres personas, un teléfono

> Guion para explorar el caso **estudio + docente dual** con los escenarios de
> `npm run seed:scenarios` (corridos en dev, agosto 2026). Anotá encima de cada
> ítem: `[x]` visto y OK · `[!]` visto y raro (anotá qué) · `[ ]` pendiente.
>
> ⚠️ **Antes de empezar, un aviso**: S6 (dashboard, PWA, E2E) **todavía no corrió**
> — el tag `v0.2.0-f1` no existe. La pantalla Inicio muestra el placeholder de F0
> ("Creá tu primer grupo"), no las cards de métrica. Todo lo demás de Fase 1
> (S1–S5) está completo. Los ítems marcados **(S6 pendiente)** van a verse así
> hasta que corramos ese bloque.

Entrás con tus dos cuentas de siempre; los datos ya están colgados de ellas:

| Persona | Cuenta | Organización |
|---|---|---|
| 1. Dueña del estudio | `garciaelissondo@gmail.com` | Estudio Meraki (STUDIO) |
| 2. Docente independiente | `dgarciaelissondo@gmail.com` | Clases de Folklore de Dolores |
| 3. La docente, en el estudio | `dgarciaelissondo@gmail.com` | → Estudio Meraki vía el selector de "Más" |

Ojo: las dos cuentas ya tenían organizaciones tuyas ("Estudio Grande", "Estudio
de danzas 1") — van a aparecer en el selector también. Es un buen test extra.

---

## Persona 1 — La dueña de Estudio Meraki

- [ ] **Inicio**: el nombre del estudio en la app bar. **(S6 pendiente)** — vas a
      ver el CTA de primer grupo en vez de cobrado/pendiente/deudores/clases de
      hoy, aunque el estudio ya tiene datos. Es el hueco más visible del recorrido.
- [ ] **Agenda**: la semana con los 7 grupos y los tres "salones" conviviendo.
      Mirá el **martes 18:00**: Árabe inicial (Salón A) y Contemporáneo juvenil
      (Salón B) a la misma hora — ¿se entiende que son espacios distintos, o
      parece un choque? El **sábado 11:00** repite el cruce (Folklore norteño ·
      Salón B vs Contemporáneo adultos · Salón A).
      - Anotá: ¿qué pedirías de un **filtro por salón**? ¿chips como el de grupo
        en Cobranzas? ¿color por salón? → **S8** (modelo Space + choques).
- [ ] **Alumnos**: 14 activos + Guadalupe Torres inactiva. Paula Giordano sin
      teléfono (en Deudores su botón de WhatsApp está deshabilitado con motivo).
- [ ] **Cobranzas**: el período en curso con pendientes y la vencida del mes
      pasado al navegar con `‹`. Deudores reales: Joaquín (vencida + pendiente),
      Delfina (parcial), Federica, Josefina, Abril…
- [ ] **Un pago completo**: fila de un deudor → Registrar pago → guardar →
      toast → **Compartir comprobante** → el link abre con la marca "Estudio
      Meraki" (mandátelo por WhatsApp a la otra cuenta/teléfono).
- [ ] **Ficha de Catalina Ríos**: la cuota de julio **Exonerada** (beca) y la de
      agosto pendiente. La exonerada no suma deuda.
- [ ] **Ficha de Milagros Funes**: saldo a favor de $5.000 visible en el estado
      de cuenta.
- [ ] **Recordatorio**: desde Deudores, WhatsApp a Joaquín — el mensaje sale con
      la plantilla PROPIA del estudio ("Te acercamos el resumen…") y el alias
      `meraki.estudio.mp`. El disparo queda en el historial de su ficha.
- [ ] **Ajustes**: alias y plantilla del estudio cargados; la vista previa usa
      un deudor real.

## Persona 2 — La docente en su organización

Entrá con `dgarciaelissondo@gmail.com`. Si la org activa no es "Clases de
Folklore de Dolores", cambiala en **Más → Organización**.

- [ ] Su mundo chico y completo: 2 grupos (martes y jueves 10:00), 6 alumnas
      activas + una baja, SIN nada de estudio en "Más" (ni link ni palabra).
- [ ] **Cobranzas**: Rocío al día, Micaela parcial, Sol vencida + pendiente,
      Victoria con julio pago y agosto pendiente.
- [ ] **Recordatorio a Sol**: sale con la plantilla **default** de marca y el
      alias `dolores.folklore` — comparalo con el del estudio (plantilla propia).
- [ ] Un pago y su comprobante: la marca es la de SU organización, no la del
      estudio.
- [ ] **Su agenda no choca consigo misma**: martes/jueves a la mañana acá; su
      grupo del estudio es sábado 11:00. Es la semana de una persona real.

## Persona 3 — La misma docente, adentro del estudio

En **Más → Organización**, tocá **Estudio Meraki** (Estudio · Profe).

- [ ] El cambio es total e inmediato: dashboard, agenda, alumnos y cobranzas
      pasan a ser los del estudio; el toast lo confirma.
- [ ] Su grupo "a cargo" se reconoce **solo por el nombre** ("Folklore norteño ·
      Salón B · a cargo de Dolores") — `ClassGroup` no tiene `teacherId` todavía
      (**S9**).
- [ ] ⚠️ **Observación esperada — esto es lo que hay que sentir y anotar**: como
      TEACHER ve **TODO el estudio**: los 15 alumnos, toda la plata, los
      deudores de grupos ajenos, y puede registrar pagos y mandar recordatorios
      de cualquier alumno. El scoping fino de teacher ("sus grupos y alumnos",
      Plan §4) es **S7** y no existe aún. Lo que sí está desde F0.6: no ve
      Liquidaciones (no existen) y **no ve la card de Ajustes de cobranzas**
      (owner/admin).
      - Anotá: ¿qué de lo que viste NO debería ver un profe? ¿los montos de
        otros grupos? ¿la lista completa de alumnos? ¿el total del mes?
- [ ] Volvé a su org con el selector: todo vuelve a su mundo chico, sin rastros
      del estudio.

---

## Lo que este recorrido NO puede mostrar (y a qué bloque se lo debe)

| Falta | Se ve en el recorrido como… | Bloque |
|---|---|---|
| Dashboard con métricas (HU7.1), PWA instalable, E2E F1/F2 | Inicio = placeholder de F0 | **S6 (pendiente de correr)** |
| Scoping de teacher ("sus grupos y alumnos") | La profe ve todo el estudio | **S7** |
| Selector de rol/organización pulido (invitaciones, crear org extra) | Selector mínimo por cookie, sin invitar gente | **S7** |
| Modelo `Space` (salones de verdad), filtro por salón, choques de horario | Sufijo "· Salón X" en el nombre; cruces sin validar | **S8** |
| `teacherId` en grupos, "a cargo de", liquidaciones (F3/RN6) | Convención de nombre; nada de plata por profe | **S9** |

## Notas libres

(espacio para vos)
