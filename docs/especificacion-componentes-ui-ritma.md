# Ritma — Especificación de componentes UI

> Documento normativo del sistema de componentes. Se apoya en la Especificación de marca (voz, logo, tipografía) y en la Especificación de color (tokens).
> Versión 1.0 · Julio 2026 · Stack objetivo: Next.js + Tailwind CSS + shadcn/ui (Plan de proyecto §10).

---

## 1. Sobre este documento

Define los fundamentos (espaciado, radios, elevación, foco) y cada componente del MVP: propósito, anatomía, variantes, estados y reglas de uso. Los componentes se construyen sobre shadcn/ui con los tokens de la Especificación de color; este documento define el comportamiento y la apariencia final, el código los implementa. Regla general: **si un componente no está acá, primero se especifica y después se codea** — evita que la UI se degrade en variantes ad-hoc.

Principio rector heredado del Plan (§11): pulgar primero. Todo se diseña para operarse con una mano en un teléfono, entre clase y clase; desktop es la adaptación, no al revés.

## 2. Fundamentos

### 2.1 Espaciado y layout

- Escala de espaciado en múltiplos de 4: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`.
- Padding horizontal de pantalla: 16 px en mobile, 24 px en desktop.
- Separación estándar entre secciones: 24 px; entre elementos de una misma sección: 12 px.
- Breakpoints: mobile-first; `md` (768 px) reemplaza bottom nav por sidebar; `lg` (1024 px) habilita layouts de dos columnas (lista + detalle).

### 2.2 Forma y elevación

- Radios: 10 px en controles (botones, inputs), 12–16 px en cards y sheets, pill (9999) en badges y chips.
- Elevación plana por defecto: la jerarquía se construye con fondo + borde (`surface` + `border`), no con sombras.
- Única sombra permitida, para superficies flotantes (sheet, dialog, popover, FAB): `0 8px 24px rgba(23, 22, 29, 0.12)`. En modo oscuro no hay sombra: la superficie elevada se aclara (token `surface-raised`).

### 2.3 Interacción y estados universales

Todo componente interactivo define estos estados, sin excepción:

| Estado | Regla |
|---|---|
| Default | Tokens base del componente |
| Hover (solo puntero) | Un paso de énfasis: `primary-hover`, o fondo Neutro 100 |
| Pressed/active | Igual que hover + escala 0.98 en botones |
| Focus visible | Anillo de 2 px `focus-ring` con offset de 2 px. **Nunca se elimina** |
| Disabled | Opacidad 50 %, cursor default. Preferir ocultar antes que deshabilitar (ver §5.4) |
| Loading | Spinner reemplaza al ícono, el ancho del componente no cambia |

- Área táctil mínima: 44 × 44 px (aunque el dibujo sea menor), con 8 px entre objetivos.
- Transiciones: 150–250 ms, `ease-out`. Respetar `prefers-reduced-motion` en todo.
- Tipografía aplicada: cuerpo 14/16 px Inter; montos y métricas en Space Grotesk con `tabular-nums` (Marca §7).

## 3. Componentes

### 3.1 Botón

**Propósito:** ejecutar una acción con nombre de verbo ("Registrar pago", nunca "Aceptar" genérico).

| Variante | Fondo / texto | Uso |
|---|---|---|
| Primario | `primary` / `on-primary` | La acción principal — **máximo uno por vista** |
| Secundario | `surface` + borde `border-strong` / `text` | Acciones alternativas |
| Fantasma | transparente / `text-secondary` | Acciones terciarias, barras densas |
| Destructivo | Rojo 600 / blanco | Borrar, cancelar sesión, dar de baja |
| Link | transparente / `primary` | Navegación textual en línea |

Tamaños: sm 32 px, md 40 px (default), lg 48 px. En mobile, el CTA de un formulario es lg y de ancho completo, fijo al fondo del sheet. Con ícono: Lucide 16–20 px a la izquierda del texto; los botones de solo ícono llevan `aria-label`.

### 3.2 Campos de formulario

**Input de texto.** Altura 44 px, fondo `surface`, borde `border-strong`, radio 10. Label siempre visible arriba del campo (nunca placeholder como label). Texto de ayuda en `text-secondary` debajo; en error, el borde y el mensaje pasan a `danger` con texto concreto ("Ingresá un teléfono con código de área"), y el mensaje reemplaza a la ayuda — nunca conviven.

**Input de monto** (componente propio, el más usado de la app): prefijo `$` fijo, `inputmode="decimal"` para teclado numérico, cifras tabulares, formateo de miles al salir del campo (`20000` → `$20.000`). En "Registrar pago" llega pre-cargado con la deuda del alumno (Plan HU4.3).

**Select / Combobox.** Para elegir alumno, grupo o disciplina: combobox con búsqueda (shadcn Command) — a partir de 10 alumnos un select simple no sirve. En mobile abre como bottom sheet.

**Checkbox, radio y switch.** Switch solo para estados que aplican al instante (ej. "Grupo activo"); checkbox para opciones dentro de formularios que se confirman con un botón.

### 3.3 Badge de estado de cuota — componente firma

Representa los estados del Plan RN3 con las recetas exactas de Color §5. Forma pill, texto 12 px peso 500, padding 4×10, punto indicador de 6 px opcional a la izquierda. Siempre con etiqueta de texto; el color nunca comunica solo.

| Estado | Etiqueta | Receta (claro) |
|---|---|---|
| `PENDING` | Pendiente | Neutro 100 / Neutro 700 |
| `PARTIAL` | Parcial | Ámbar 100 / Ámbar 800 |
| `PAID` | Pagada | Verde 100 / Verde 800 |
| `OVERDUE` | Vencida | Rojo 100 / Rojo 700 |
| `WAIVED` | Exonerada | Violeta 100 / Violeta 700 |

Este mismo componente se usa en fichas, listas, tablas de liquidación y comprobantes (solo modo claro en comprobantes). Prohibido crear variantes locales de estos colores.

### 3.4 Card

**Card de métrica** (dashboard): label 12 px `text-secondary` arriba, valor en Space Grotesk 24 px `tabular-nums`, contexto opcional debajo ("3 deudores"). Toda la card es tappeable y navega a su detalle — cursor pointer y estado hover completos.

**Card contenedora:** fondo `surface`, borde `border`, radio 12, padding 16. No se anidan cards.

### 3.5 Ítem de lista (alumno)

Anatomía de izquierda a derecha: avatar de iniciales (ver §3.11) · nombre en `text` + subtítulo en `text-secondary` (grupos activos) · zona derecha con badge de estado o monto adeudado en `tabular-nums` · chevron. Altura 64 px, divisor `border` entre ítems. El tap navega a la ficha; las acciones rápidas (WhatsApp, registrar pago) viven dentro de la ficha, no en la lista — una lista con botones por fila se vuelve un campo minado táctil.

### 3.6 Navegación

**Bottom nav (mobile).** Cinco ítems fijos: Inicio · Agenda · Alumnos · Cobranzas · Más. Ícono Lucide 24 px + label 11 px. Activo: `primary` en ícono y label; inactivo: `text-secondary`. Altura 56 px + safe-area inferior. No se agregan ni reordenan ítems sin actualizar esta spec.

**Sidebar (≥ md).** Misma estructura y jerarquía; logotipo arriba (área de respeto de Marca §5.4), ítem activo con fondo Violeta 50 y texto `primary`.

**App bar.** Título de la pantalla (18 px, peso 500), back a la izquierda cuando hay jerarquía, una acción contextual a la derecha como máximo.

### 3.7 Bloque de sesión (agenda)

Chip de la vista semanal/diaria: barra de acento de 3 px a la izquierda con el color de la disciplina (asignado de la escala Violeta/Coral/Verde en stops 400, configurable), hora en `tabular-nums`, nombre del grupo, salón en `text-secondary` (solo estudios). Sesión cancelada: texto tachado, todo en Neutro 400, sin barra de color. El tap abre el detalle de la sesión con sus inscriptos.

### 3.8 Sheet y Dialog

**Bottom sheet (mobile)** — el contenedor de todos los formularios de acción: registrar pago, alta express, inscribir alumno. Handle superior, título, contenido scrolleable, CTA primario fijo al fondo (lg, ancho completo). Se cierra por gesto, por la X o al completar la acción; si hay cambios sin guardar, pide confirmación.

**Dialog (desktop y confirmaciones).** Ancho máximo 480 px. Las confirmaciones destructivas nombran el objeto y la consecuencia: "¿Cancelar la sesión del martes 12/05? Los alumnos no reciben aviso automático." — botón destructivo con verbo ("Cancelar sesión"), secundario "Volver".

### 3.9 Toast

Una línea, esquina superior (desktop) o sobre la bottom nav (mobile), auto-cierre a los 4 s. Puede llevar **una** acción: el toast de "Pago registrado" incluye "Compartir comprobante" — es el atajo que hace cumplir el objetivo de 15 segundos del Plan (HU4.3 + HU5.1). Los toasts de error no se auto-cierran y explican qué pasó y qué hacer (Marca §4.2).

### 3.10 Estado vacío

Ícono Lucide 48 px en Neutro 400, título corto, una línea de contexto y un CTA primario. El copy sigue la voz de marca: invita a actuar, no describe la ausencia ("Tu semana está vacía. Creá tu primer grupo y armá la agenda."). Cada pantalla del MVP define su estado vacío en el diseño, no como afterthought.

### 3.11 Avatar

Iniciales (dos letras) sobre Violeta 100 con texto Violeta 800; tamaños 32 / 40 / 56 px. Sin fotos de alumnos en el MVP: evita gestión de imágenes y cuestiones de consentimiento.

### 3.12 Tabla de datos (liquidaciones, desktop)

Header 12 px `text-secondary` en sentence case; montos alineados a la derecha en `tabular-nums`; fila hover Neutro 50; totales en peso 500. En mobile las tablas no se scrollean horizontalmente: colapsan a cards por fila (profe → bruto, retención, neto). El drill-down de una liquidación abre la lista de pagos que la componen.

### 3.13 FAB (acción flotante)

Solo existe en dos pantallas: Alumnos (alta express) y Agenda (nuevo grupo). Círculo de 56 px, `primary`, ícono plus blanco, esquina inferior derecha, 16 px por encima de la bottom nav, con la sombra flotante de §2.2. Máximo un FAB por pantalla; si la pantalla ya tiene CTA primario visible, no hay FAB.

### 3.14 Skeleton y carga

Bloques Neutro 100 (claro) / `#292833` (oscuro) con pulso de opacidad de 1.5 s, replicando la silueta real del contenido. Carga de pantalla completa (splash de PWA): isotipo con la animación del **pulso** de Marca §8 — única aparición animada del logo. Todo respeta `prefers-reduced-motion`.

## 4. Patrones

### 4.1 Formularios

Validación en `blur` y en submit, nunca al tipear la primera letra. Errores concretos y accionables junto al campo; el CTA no se deshabilita por errores — al tocarlo, lleva el foco al primer campo inválido (un botón deshabilitado no explica nada). Al guardar con éxito: cerrar el sheet + toast. Los formularios del MVP caben en una pantalla de sheet; si un formulario necesita pasos, se rediseña el formulario.

### 4.2 Montos, fechas y períodos

Formato único en toda la app: `$20.000` (miles con punto, sin decimales salvo necesidad real); fechas `mar 12/05` en listas y `12 de mayo de 2026` en documentos; períodos como "Marzo 2026". Los montos siempre en `tabular-nums`; los negativos de liquidaciones con signo explícito, no solo color.

### 4.3 Permisos en la UI

Lo que el rol no puede hacer **no se muestra** (un teacher no ve el módulo de liquidaciones ajenas ni Ajustes de la org); deshabilitado se reserva para acciones temporalmente no disponibles con motivo visible en tooltip o texto. La UI nunca es el único guardián: el server valida siempre (Plan §10).

### 4.4 Jerarquía de feedback

Confirmación breve → toast. Error de acción → toast persistente o mensaje en el campo. Estado del dominio (cuota vencida) → badge, jamás toast. Situación que requiere decisión → dialog. No se apilan dos mecanismos para el mismo evento.

## 5. Accesibilidad — checklist por componente

1. Contraste de texto ≥ 4.5:1 y de elementos UI ≥ 3:1 (recetas de Color §5–6).
2. Foco visible con `focus-ring` en todo elemento interactivo; orden de foco lógico en sheets (título → campos → CTA).
3. Todo control con label programático; íconos solos con `aria-label`.
4. Targets ≥ 44 px; gestos siempre con alternativa de botón.
5. Estados comunicados con texto además de color.
6. `prefers-reduced-motion` respetado en transiciones, skeletons y el pulso.
7. La app es usable a 200 % de zoom del navegador sin scroll horizontal.

## 6. Mapa shadcn/ui → Ritma

| Componente Ritma | Base shadcn | Ajustes principales |
|---|---|---|
| Botón | `Button` | Variantes y tamaños de §3.1; radio 10 |
| Input / Input de monto | `Input` | Altura 44; monto: prefijo, `inputmode`, formateo |
| Combobox de alumno/grupo | `Command` + `Popover` | Bottom sheet en mobile |
| Badge de estado | `Badge` | Recetas fijas de Color §5 |
| Card | `Card` | Radio 12, sin sombra |
| Sheet / Dialog | `Sheet` (o vaul) / `Dialog` | CTA fijo al fondo; sombra única de §2.2 |
| Toast | `sonner` | Acción única; error persistente |
| Tabla | `Table` | Colapso a cards en mobile |
| Avatar | `Avatar` | Iniciales, Violeta 100/800 |
| Skeleton | `Skeleton` | Pulso 1.5 s |
| Bottom nav / Bloque de sesión / FAB / Input de monto | — (propios) | Según §3.6, §3.7, §3.13, §3.2 |

## 7. Definition of done de un componente

Un componente está terminado cuando: implementa todos los estados de §2.3 en modo claro **y** oscuro; usa exclusivamente tokens de la Especificación de color; pasa el checklist de accesibilidad de §5; su copy sigue la voz de marca; está documentado con un ejemplo real del dominio (no lorem ipsum: "Sofi Herrera · Árabe intermedio · $20.000"); y quedó registrado en este documento. Cambiar un componente existente implica versionar esta spec en el mismo PR.
