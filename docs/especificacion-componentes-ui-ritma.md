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

*(S3)* Primer uso real (inscribir alumno, HU4.1), con un ajuste: como el formulario YA es un bottom sheet, la búsqueda filtra **en línea adentro del propio sheet** (input + lista scrolleable, insensible a tildes como la de HU2.2) en vez de abrir un segundo sheet encima — el alumno elegido colapsa a un chip con "Cambiar". Para listas cortas (grupo, disciplina, plan) siguen los chips single-select del formulario de grupo (S2): con un puñado de opciones, verlas todas gana.

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

*(S4)* **Una excepción, medida:** la fila de Deudores lleva UNA acción — "Registrar pago", botón secundario `sm` en una segunda línea, target ≥ 44 px — porque el DoD de HU4.3 (pago completo en < 15 segundos desde Deudores) no se cumple pasando por la ficha. Sigue sin ser un campo minado: una sola acción por fila, separada del área de navegación, y el tap de la fila sigue yendo a la ficha. La zona derecha muestra el REMANENTE de la cuota (una Parcial debe lo que le falta), con el monto original chico abajo como contexto.

*(S5)* **La segunda línea admite DOS acciones y ni una más:** "Registrar pago" y "WhatsApp" (HU5.2 — recordatorio en dos taps exige el botón EN la fila de Deudores, por el mismo argumento que S4). Las dos son botones secundarios `sm` en la misma línea, lejos del área de navegación. Alumno sin teléfono: "WhatsApp" deshabilitado con el motivo al lado como link — "Sin teléfono · Cargarlo" → la ficha (§4.3: deshabilitado solo con motivo visible). Cualquier tercera acción vuelve a la ficha: el límite ahora son estas dos.

### 3.6 Navegación

**Bottom nav (mobile).** Cinco ítems fijos: Inicio · Agenda · Alumnos · Cobranzas · Más. Ícono Lucide 24 px + label 11 px. Activo: `primary` en ícono y label; inactivo: `text-secondary`. Altura 56 px + safe-area inferior. No se agregan ni reordenan ítems sin actualizar esta spec.

**Sidebar (≥ md).** Misma estructura y jerarquía; logotipo arriba (área de respeto de Marca §5.4), ítem activo con los tokens `nav-active-bg` / `nav-active-text` (Color §4): fondo Violeta 50 y texto Violeta 600 en claro, fondo Violeta 900 y texto Violeta 200 en oscuro. En oscuro el texto **no** es `primary`: Violeta 300 sobre un fondo violeta no llega a AA.

"Más" es la puerta a Estudio y Ajustes (Plan §11) y se queda activo mientras estés en cualquiera de las dos.

**App bar.** Título de la pantalla (18 px, peso 500), back a la izquierda cuando hay jerarquía, una acción contextual a la derecha como máximo.

### 3.7 Bloque de sesión (agenda)

Chip de la vista semanal/diaria: barra de acento de 3 px a la izquierda con el color de la disciplina — **tokens `discipline-1..N`** (Color §4), asignación estable por orden de creación de la disciplina, cíclica —, hora en `tabular-nums`, nombre del grupo, salón en `text-secondary` (solo estudios; llega con `Space` en S8). Sesión cancelada: texto tachado, todo en `text-muted`, sin barra de color. Sesión **reprogramada**: el bloque se pinta en su NUEVA posición con la etiqueta "Reprogramada" (texto, no color); el horario original lo muestra el detalle. El tap abre el detalle de la sesión con sus inscriptos (la lista de inscriptos llega en S3). Todo el bloque es un solo target táctil ≥ 44 px.

*(S2)* Esta sección decía "stops 400 de Violeta/Coral/Verde, configurable". Dos problemas al construirla: **Coral 400 y Verde 400 no existían** en la spec de color (y el coral interpolado reprueba el contraste de no-texto — Color, changelog 1.4), y Color §8 prohíbe que un componente consuma stops — el mismo motivo por el que ya se había corregido §3.10. Los colores son ahora los tokens `discipline-*`, verificados en los dos modos. "Configurable" queda post-MVP: hoy la asignación es automática y estable.

### 3.8 Sheet y Dialog

**Bottom sheet (mobile)** — el contenedor de todos los formularios de acción: registrar pago, alta express, inscribir alumno. Handle superior, título, contenido scrolleable, CTA primario fijo al fondo (lg, ancho completo). Se cierra por gesto, por la X o al completar la acción; si hay cambios sin guardar, pide confirmación.

**Dialog (desktop y confirmaciones).** Ancho máximo 480 px. Las confirmaciones destructivas nombran el objeto y la consecuencia: "¿Cancelar la sesión del martes 12/05? Los alumnos no reciben aviso automático." — botón destructivo con verbo ("Cancelar sesión"), secundario "Volver".

### 3.9 Toast

Una línea, esquina superior (desktop) o sobre la bottom nav (mobile), auto-cierre a los 4 s. Puede llevar **una** acción: el toast de "Pago registrado" incluye "Compartir comprobante" — es el atajo que hace cumplir el objetivo de 15 segundos del Plan (HU4.3 + HU5.1). Los toasts de error no se auto-cierran y explican qué pasó y qué hacer (Marca §4.2).

**En mobile el toast NO llega hasta el borde derecho: frena antes del FAB** (S1). Este documento se contradecía: §3.9 pone el toast "sobre la bottom nav" y §3.13 pone el FAB "16 px por encima de la bottom nav" — el mismo lugar. Al probar el alta express en un teléfono, el toast tapaba el `+` durante 4 segundos y, peor, **le comía el tap**: cargar alumnos en fila (el DoD de S1) se volvía imposible. El toast termina a 84 px del borde (16 de margen + 56 del FAB + 12 de aire) y el `+` queda libre. Consecuencia para el copy: el toast de mobile es angosto, así que **el dato que identifica va primero** ("Guardaste a Sofía Herrera", no "Sofía Herrera ya está en tu padrón"); si algo se trunca, que sea la cola.

**Abrir un formulario cierra los toasts vivos** (S1): el aviso del alumno anterior no se queda flotando sobre el formulario del siguiente.

### 3.10 Estado vacío

Ícono Lucide 48 px en `text-muted`, título corto, una línea de contexto y un CTA primario. (El ícono es decorativo y va con `aria-hidden`: siempre lo acompaña el título. Antes esta línea decía "Neutro 400", que es un stop de la escala, y Color §8 prohíbe que los componentes consuman stops.) El copy sigue la voz de marca: invita a actuar, no describe la ausencia ("Tu semana está vacía. Creá tu primer grupo y armá la agenda."). Cada pantalla del MVP define su estado vacío en el diseño, no como afterthought.

### 3.11 Avatar

Iniciales (dos letras) sobre Violeta 100 con texto Violeta 800; tamaños 32 / 40 / 56 px. Sin fotos de alumnos en el MVP: evita gestión de imágenes y cuestiones de consentimiento.

### 3.12 Tabla de datos (liquidaciones, desktop)

Header 12 px `text-secondary` en sentence case; montos alineados a la derecha en `tabular-nums`; fila hover Neutro 50; totales en peso 500. En mobile las tablas no se scrollean horizontalmente: colapsan a cards por fila (profe → bruto, retención, neto). El drill-down de una liquidación abre la lista de pagos que la componen.

### 3.13 FAB (acción flotante)

Solo existe en dos pantallas: Alumnos (alta express) y Agenda (nuevo grupo). Círculo de 56 px, `primary`, ícono plus blanco, esquina inferior derecha, 16 px por encima de la bottom nav, con la sombra flotante de §2.2. Máximo un FAB por pantalla; si la pantalla ya tiene CTA primario visible, no hay FAB.

### 3.14 Skeleton y carga

Bloques `muted` con pulso de opacidad de 1.5 s, replicando la silueta real del contenido. (Nota S6: esta sección decía "Neutro 100 (claro) / `#292833` (oscuro)" — exactamente los dos valores del token `muted`; se nombra el token porque Color §8 prohíbe que los componentes consuman stops o hex, igual que la corrección previa de §3.10.) Carga de pantalla completa (splash de PWA): isotipo con la animación del **pulso** de Marca §8 — única aparición animada del logo, y SOLO el punto coral late (los trazos nunca se animan). Implementación S6: el splash es el `loading.tsx` raíz; cada pantalla del shell tiene su skeleton con su silueta. Todo respeta `prefers-reduced-motion`.

### 3.15 Editor de franjas (S2)

El editor de horarios recurrentes del formulario de grupo (HU3.1): una fila por franja, franjas agregables y eliminables. Anatomía de cada fila: **pills de día** lunes-primero (`Lu Ma Mi Ju Vi Sá Do`, single-select, `aria-pressed`, target ≥ 44 px), **hora** con `<input type="time">` estilado con los tokens de §3.2 (la rueda nativa del sistema es lo correcto para el pulgar), y **duración** como pills de valores comunes (45′ · 60′ · 90′) más "Otra", que revela un input numérico en minutos (15–480). "Agregar franja" es botón secundario; eliminar, botón fantasma por fila. Un grupo necesita al menos una franja.

En edición, el editor advierte con un helpText fijo: **si eliminás una franja o le cambiás el día, se pierden sus sesiones canceladas o movidas** — la franja con otro día es otra identidad. Cambiar solo la hora o la duración conserva las excepciones. No valida solapamientos: eso llega con los espacios (S8). Reprogramar una sesión sobre otra ocurrencia del mismo grupo está permitido a propósito, por lo mismo.

### 3.16 Editor de plantilla de recordatorio (S5)

La sección "Cobranzas" de Ajustes, solo para owner/admin (§4.3). Dos campos de §3.2 — el alias de cobro (input) y la plantilla (multilínea, mismo tratamiento visual que el input de una línea) — y debajo, **la vista previa renderizada en vivo con datos reales**: el primer deudor del período en curso o, sin deudores, el ejemplo canónico de Marca §4.2. El profe nunca guarda un mensaje que no vio.

Las variables son cuatro y se documentan en el helpText del campo: `{nombre}` (nombre de pila), `{periodo}` ("Marzo 2026"), `{monto}` (la deuda del período **completo**, en remanentes — el filtro de grupo de Deudores no la achica) y `{alias}`. Una variable desconocida o con typo queda **visible sin reemplazar** en la vista previa — un hueco silencioso sería peor. Plantilla vacía = se usa la default (el ejemplo normativo de Marca §4.2, con las variables en el lugar de los datos); el placeholder del campo la muestra. Una org **sin alias** usa la default sin la frase de la transferencia: nunca se manda "Podés transferir a .". El recordatorio por **email** sale con la misma plantilla pero sin emojis (Marca §4: solo canales conversacionales). Guardar sigue §4.1: CTA primario, toast "Ajustes guardados.".

### 3.17 Botón "Continuar con Google" (ticket Google)

**Propósito:** entrar o registrarse con la cuenta de Google, en `/login` y `/registro`.

Es el **único componente de Ritma que no usa los tokens de Ritma**: los lineamientos de marca de Google son normativos (cumplirlos es requisito para verificar la app) y prohíben recolorear el logo, redibujarlo, usarlo suelto sin el contenedor o inventar una variante. Los valores salen del configurador oficial de Google:

| Propiedad | Valor (Google) |
|---|---|
| Fondo / borde / texto — claro | `#FFFFFF` / `#747775` 1 px / `#1F1F1F` |
| Fondo / borde / texto — oscuro | `#131314` / `#8E918F` 1 px / `#E3E3E3` |
| Radio | 4 px |
| Logo G | 20 × 20, con 10 px de aire respecto del texto; los 4 colores oficiales |
| Tipografía | `Roboto, arial, sans-serif` 14 px / 500, `letter-spacing` 0.25 px |
| Hover | sombra `0 1px 2px rgba(60,64,67,.30), 0 1px 3px 1px rgba(60,64,67,.15)` |
| Disabled | opacidad 38 % |

Los tres hex de cada modo viven como tokens `--google-btn-*` en `globals.css` — la excepción a "ningún hex suelto" queda acotada y con nombre.

**Las dos licencias que se toman**, ambas amparadas por los propios lineamientos: alto **48 px y ancho completo** (Google publica 40; sus reglas exigen que el botón sea "at least as prominent as other sign-in options" y Ritma pide 44 px de target táctil), y el texto **traducido** a "Continuar con Google" ("localization of this text is permitted and encouraged"). El logo nunca se escala ni se recolorea.

**Comportamiento.** El flujo es una redirección de página completa: al tocarlo el botón deja de aceptar clics y el navegador se va a Google — no hay spinner porque no hay nada que esperar en esta pantalla. Lo que falle vuelve como `?error=` a la pantalla desde la que salió, y se muestra como mensaje concreto arriba del formulario (§4.4): cancelar el consentimiento dice "Cancelaste el ingreso con Google. Probá de nuevo o entrá con tu email.", nunca "algo salió mal". Si faltan las credenciales del entorno, el botón **no se muestra** (§4.3): no es un permiso, es que ahí no puede funcionar.

## 4. Patrones

### 4.1 Formularios

Validación en `blur` y en submit, nunca al tipear la primera letra. Errores concretos y accionables junto al campo; el CTA no se deshabilita por errores — al tocarlo, lleva el foco al primer campo inválido (un botón deshabilitado no explica nada). Al guardar con éxito: cerrar el sheet + toast. Los formularios del MVP caben en una pantalla de sheet; si un formulario necesita pasos, se rediseña el formulario.

**Única excepción a lo de los pasos: el wizard de creación de organización** (HU1.1, F0.5). No es un formulario de acción dentro de un sheet sino el onboarding, y la historia de usuario pide tres pasos explícitamente. La regla del CTA sigue valiendo igual: no se deshabilita, y al tocarlo salta al paso del primer campo inválido y le lleva el foco.

### 4.2 Montos, fechas y períodos

Formato único en toda la app: `$20.000` (miles con punto, sin decimales salvo necesidad real); fechas `mar 12/05` en listas y `12 de mayo de 2026` en documentos; períodos como "Marzo 2026". Los montos siempre en `tabular-nums`; los negativos de liquidaciones con signo explícito, no solo color.

*(S2)* Dos formatos nuevos que la agenda necesitó, fijados acá y en `lib/format.ts`: **rangos de hora** `19:00–20:30` (guion corto sin espacios; el fin sale de la duración) y **rangos de semana** `12–18 may` — cruzando mes, cada punta con su mes: `27 jul – 2 ago`. En confirmaciones que nombran el objeto (§3.8) el día va completo: `martes 12/05`.

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
| Sheet / Dialog | `Drawer` de Base UI / `Dialog` propio | CTA fijo al fondo; sombra única de §2.2. **Ver nota 1.** |
| Toast | `Toast` de Base UI | Acción única; error persistente. **Ver nota 2.** |
| Tabla | `Table` | Colapso a cards en mobile |
| Avatar | `Avatar` | Iniciales, Violeta 100/800 |
| Skeleton | `Skeleton` | Pulso 1.5 s |
| Switch | `Switch` de Base UI | Solo estados que aplican al instante (§3.2) |
| Bottom nav / Bloque de sesión / FAB / Input de monto / Editor de franjas | — (propios) | Según §3.6, §3.7, §3.13, §3.2, §3.15 |
| Botón de Google | — (de Google) | §3.17: lineamientos de marca de Google, no tokens de Ritma |

**Nota 1 (S1).** El `sheet` del registry de shadcn está construido sobre `Dialog` y **no tiene
cierre por gesto**, que §3.8 exige. Se usa el **`Drawer` de Base UI** (que sí lo trae) para mobile
y un **`Dialog` propio** para desktop, envueltos en un único `ActionSheet`. Los ítems `sheet` y
`dialog` del registry, además, dependen de `button` y lo sobrescribirían con variantes que Ritma
no tiene. `vaul` queda descartado: esta base no usa Radix.

**Nota 2 (S1).** `sonner` queda descartado: el item del registry depende de **`next-themes`**, y
Ritma no tiene theme provider a propósito (el modo lo decide el sistema, Color §7.5). El `Toast`
de Base UI da exactamente lo que pide §3.9 —`timeout` por toast (`0` = sin autocierre para los
errores), una sola acción, y límite de uno a la vez— y es unstyled, así que consume solo tokens.

## 7. Definition of done de un componente

Un componente está terminado cuando: implementa todos los estados de §2.3 en modo claro **y** oscuro; usa exclusivamente tokens de la Especificación de color; pasa el checklist de accesibilidad de §5; su copy sigue la voz de marca; está documentado con un ejemplo real del dominio (no lorem ipsum: "Sofi Herrera · Árabe intermedio · $20.000"); y quedó registrado en este documento. Cambiar un componente existente implica versionar esta spec en el mismo PR.
