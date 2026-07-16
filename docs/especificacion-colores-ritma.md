# Ritma — Especificación de color

> Documento normativo. Operacionaliza la paleta definida en la Especificación de marca (§6) para producto y comunicaciones.
> Versión 1.3 · Julio 2026 · Todos los ratios de contraste fueron calculados según WCAG 2.1.

> **Cambios de la 1.3** (S1, al construir el padrón de alumnos): se agregan `avatar-bg` / `avatar-text` (Componentes §3.11 solo definía el modo claro) y `scrim`, el velo de sheets y dialogs, que era un hueco de esta spec — sin él los componentes traían `bg-black/10`, o sea color suelto. Sin colores nuevos: las dos recetas reusan pares ya verificados.

> **Cambios de la 1.2** (F0.5, al construir la navegación): se agrega el par `nav-active-bg` / `nav-active-text` para el ítem activo de la navegación. Componentes §3.6 lo definía como "fondo Violeta 50 y texto `primary`", que solo funciona en modo claro: en oscuro, `primary` (Violeta 300) sobre cualquier fondo violeta reprueba AA (4.19:1 sobre Violeta 900). Sin colores nuevos.

> **Cambios de la 1.1** (F0.2, al implementar los tokens): se nombran los tokens de los cinco estados de cuota (§5 definía las recetas pero §8 solo tenía tres); se agrega el par `destructive` / `on-destructive` para superficies destructivas sólidas; se corrige el uso de Neutro 400 como placeholder (2.15:1, no pasa AA); se documenta la colisión de `accent` con shadcn/ui. No se agregó ni un color nuevo: todos los valores salen de las escalas de §3.

---

## 1. Propósito y jerarquía documental

Este documento define las escalas completas de color, los tokens semánticos de la interfaz (modo claro y oscuro), las recetas exactas de los estados de cuota y las reglas de implementación en Tailwind/shadcn. La Especificación de marca define *qué* colores son de Ritma; este documento define *cómo se usan* en el producto. Ante conflicto, la marca gana en piezas de comunicación y este documento gana dentro de la UI.

## 2. Principios

1. **El violeta es acción.** Si algo es violeta, se puede tocar (botón primario, link, navegación activa). Nada decorativo va en violeta.
2. **El coral es celebración.** Aparece en el pulso del logo y en momentos de logro (pago registrado, mes cerrado). Máximo un elemento coral por pantalla.
3. **El color nunca viaja solo.** Todo estado lleva etiqueta de texto además del color.
4. **Proporción 70 / 20 / 10.** Neutros / violeta / coral+semánticos. Una pantalla de Ritma es mayormente calma.
5. **Ningún hex suelto.** Todo color en el código sale de un token de este documento. Si un color no está acá, no existe.

## 3. Escalas

Los valores marcados ◆ provienen de la Especificación de marca y son inmutables.

### Violeta (primaria)

| Stop | Hex | Uso principal |
|---|---|---|
| 50 | `#F6F4FD` | Fondos de hover suaves |
| 100 ◆ | `#EDEAFB` | Chips, fondos de énfasis, avatar |
| 200 | `#C9C2F6` | Bordes de énfasis; texto sobre Violeta 900 (dark) |
| 300 ◆ | `#8B7FF0` | Primario en modo oscuro |
| 400 | `#7263E2` | Anillo de foco |
| 500 | `#6455DB` | Reservado (transiciones de escala) |
| 600 ◆ | `#5A4BD1` | **Primario**: botones, links, navegación activa |
| 700 ◆ | `#4A3DB8` | Hover/pressed del primario |
| 800 | `#3A2F94` | Texto violeta sobre fondos violeta claros |
| 900 | `#2A2268` | Fondos violeta profundos (dark) |

### Coral (acento)

| Stop | Hex | Uso principal |
|---|---|---|
| 50 | `#FDF0EC` | Fondo de momentos de celebración |
| 100 | `#FBDFD6` | Fondos suaves de acento |
| 300 ◆ | `#F59B85` | Pulso y acentos en modo oscuro |
| 500 ◆ | `#EE6A4D` | **El pulso**; acento gráfico (nunca texto chico) |
| 700 ◆ | `#C24327` | Coral cuando es texto |
| 900 | `#6E2616` | Texto sobre Coral 100 |

### Neutros cálidos (superficies y texto secundario)

| Stop | Hex | Uso principal |
|---|---|---|
| 0 | `#FFFFFF` | Superficies elevadas (cards, sheets) |
| 50 | `#FBFAF7` | **Fondo de la app** (modo claro) |
| 100 | `#F4F2ED` | Fondos de fila hover, badge pendiente |
| 200 | `#E8E6DE` | Bordes por defecto |
| 300 | `#D6D3C8` | Bordes fuertes, divisores marcados |
| 400 | `#B4B1A5` | Íconos deshabilitados, bordes de controles inactivos |
| 500 | `#8A877B` | Texto terciario (no crítico) |
| 600 ◆ | `#625F55` | Texto secundario **y placeholders** |
| 700 | `#4C4A42` | Texto del badge pendiente |

Neutro 400 y Neutro 500 no se usan como texto sobre fondos claros: dan 2.15:1 y 3.60:1 sobre blanco, debajo del 4.5:1 que exige el checklist de accesibilidad (Componentes §5.1). El placeholder es texto: va en `text-secondary` (Neutro 600, 6.39:1). Neutro 400 queda para elementos deshabilitados, que WCAG no exige contrastar.

### Tinta (texto y modo oscuro)

| Token | Hex | Uso |
|---|---|---|
| Tinta 900 ◆ | `#23212F` | Texto principal en modo claro |
| Tinta oscura ◆ | `#17161D` | Fondo de la app en modo oscuro |
| Superficie oscura | `#201F28` | Cards en modo oscuro |
| Superficie oscura elevada | `#292833` | Sheets, diálogos, popovers (dark) |
| Borde oscuro | `#35343F` | Bordes por defecto (dark) |
| Borde oscuro fuerte | `#45434F` | Bordes de controles (dark) |
| Blanco roto ◆ | `#EDECE6` | Texto principal (dark) |
| Texto secundario oscuro | `#A5A29A` | Texto secundario (dark) |

### Semánticos

| Escala | 100 (fondo claro) | 300 (texto dark) | 600/700/800 (texto claro) | 950 (fondo dark) |
|---|---|---|---|---|
| Verde (éxito) | `#D3EDE0` | `#7CC9A4` | 600 `#1E8E5A` · 700 ◆ `#177449` · 800 `#115A39` | `#0F3524` |
| Ámbar (atención) | `#F7E4C2` | `#EBB868` | 700 `#B26A0B` · 800 ◆ `#8F5300` | `#3B2A08` |
| Rojo (alerta) | `#F8D6D6` | `#EE9A9A` | 600 ◆ `#CC4141` · 700 `#B03030` | `#3C1414` |

## 4. Tokens semánticos de la UI

Los componentes consumen tokens, nunca stops directos. Definición por modo:

| Token | Claro | Oscuro |
|---|---|---|
| `background` | Neutro 50 | Tinta oscura |
| `surface` | Blanco | Superficie oscura `#201F28` |
| `surface-raised` | Blanco + sombra flotante | `#292833` |
| `border` | Neutro 200 | `#35343F` |
| `border-strong` | Neutro 300 | `#45434F` |
| `text` | Tinta 900 | Blanco roto |
| `text-secondary` | Gris 600 | `#A5A29A` |
| `text-muted` | Neutro 500 | Neutro 500 |
| `primary` | Violeta 600 | Violeta 300 |
| `primary-hover` | Violeta 700 | Violeta 200 |
| `on-primary` | Blanco | Tinta oscura |
| `accent` | Coral 500 | Coral 300 |
| `accent-text` | Coral 700 | Coral 300 |
| `focus-ring` | Violeta 400 | Violeta 300 |
| `success / warning / danger` | Verde 700 / Ámbar 800 / Rojo 600 | Verde 300 / Ámbar 300 / Rojo 300 |
| `destructive` / `on-destructive` | Rojo 600 / Blanco | Rojo 600 / Blanco (no cambian) |
| `nav-active-bg` / `nav-active-text` | Violeta 50 / Violeta 600 | Violeta 900 / Violeta 200 |
| `avatar-bg` / `avatar-text` | Violeta 100 / Violeta 800 | Violeta 900 / Violeta 200 |
| `scrim` | Tinta oscura al 40 % | Negro al 60 % |

Nota del botón primario en oscuro: fondo Violeta 300 con texto Tinta oscura (5.47:1) — no blanco, que quedaría por debajo de AA.

Nota de `nav-active-*`: en claro es lo que pide Componentes §3.6 (fondo Violeta 50, texto `primary`, 5.73:1). En oscuro **el texto no es `primary`**: Violeta 300 sobre Violeta 900 da 4.19:1 y no llega a AA, igual que cualquier fondo violeta translúcido. Con Violeta 200 el par da 8.21:1 y el violeta sigue siendo la señal de "seleccionado". Es el mismo patrón (fondo + texto por modo) que las recetas de §5.

Nota de `avatar-*` (S1): Componentes §3.11 pedía "Violeta 100 con texto Violeta 800", que en claro
da 8.82:1. En oscuro esa receta no sirve (el fondo claro rompería la superficie oscura), así que se
reusa el mismo par que `nav-active-*` y `state-waived-*`: Violeta 900 con Violeta 200, 8.21:1. Sin
colores nuevos.

Nota de `scrim` (S1): el velo de sheets y dialogs (Componentes §3.8). Era un hueco de esta spec —
no había token de velo— y sin él los componentes traían `bg-black/10`, que es color suelto. En
oscuro el velo es más denso porque el fondo ya es oscuro y al 40 % no separaría.

Nota de `destructive`: es el único token que no cambia entre modos. `danger` es color de **texto** y por eso sube a Rojo 300 en oscuro (§7.2); una superficie destructiva sólida no puede usarlo, porque Rojo 300 con texto blanco no llega a AA. El botón destructivo es Rojo 600 con blanco en los dos modos (4.77:1), que es lo que ya pedían Componentes §3.1 y §9.5 de este documento. Su hover es Rojo 700 (6.34:1).

## 5. Estados de cuota — recetas exactas

Correspondencia fija con los estados del Plan de proyecto (RN3). Formato badge: fondo + texto + punto indicador.

| Estado | Modo claro (fondo / texto) | Ratio | Modo oscuro (fondo / texto) | Ratio |
|---|---|---|---|---|
| Pendiente | Neutro 100 / Neutro 700 | 7.94:1 | `#292833` / `#A5A29A` | ≥ 4.5 |
| Parcial | Ámbar 100 / Ámbar 800 | 4.94:1 | Ámbar 950 / Ámbar 300 | 7.62:1 |
| Pagada | Verde 100 / Verde 800 | 6.66:1 | Verde 950 / Verde 300 | 6.91:1 |
| Vencida | Rojo 100 / Rojo 700 | 4.71:1 | Rojo 950 / Rojo 300 | 7.47:1 |
| Exonerada | Violeta 100 / Violeta 700 | 6.70:1 | Violeta 900 / **Violeta 200** | 8.21:1 |

Cada estado tiene su par de tokens `--state-<estado>-bg` / `--state-<estado>-text` (§8). El badge los lee de esta tabla y de ningún otro lado: no reutiliza `success` / `warning` / `danger`, que existen para texto y bordes y podrían cambiar sin que cambie el badge.

Estas recetas aplican también a filas de tablas, timeline de la ficha de alumno y comprobantes. En comprobantes solo se usa el modo claro.

## 6. Contraste verificado (WCAG 2.1)

Resumen de pares aprobados para texto normal (≥ 4.5:1): Tinta/blanco 15.79 · Tinta/Neutro 50 15.13 · Violeta 600/blanco 6.25 · blanco/Violeta 600 6.25 · Violeta 700/blanco 7.92 · Coral 700/blanco 5.09 · Gris 600/Neutro 50 6.12 · Verde 700/blanco 5.78 · Ámbar 800/blanco 6.17 · Rojo 600/blanco 4.77 · blanco roto/`#201F28` 13.77 · `#A5A29A`/`#17161D` 7.04 · Tinta oscura/Violeta 300 5.47 · Coral 300/`#201F28` 7.69, más las recetas de badges de §5.

Aprobados solo para texto grande, íconos y gráficos (≥ 3:1): Coral 500/blanco 3.09 · Violeta 400/blanco 4.57 (anillo de foco).

Verificados en F0.2, al implementar los componentes: blanco/Rojo 700 6.34 (hover del botón destructivo) · Neutro 600/blanco 6.39 (placeholders) · `#A5A29A`/`#292833` 5.70 (badge pendiente en oscuro, el "≥ 4.5" de §5) · Violeta 300/Tinta oscura 5.47 (anillo de foco en oscuro, ≥ 3).

Verificados en F0.5 (navegación): Violeta 600/Violeta 50 5.73 (ítem activo, claro) · Violeta 200/Violeta 900 8.21 (ítem activo, oscuro).

**Reprobados, no usar como texto sobre fondos claros:** Neutro 400/blanco 2.15 · Neutro 500/blanco 3.60.

**Reprobados en oscuro (por eso `nav-active-text` no es `primary`):** Violeta 300/Violeta 900 4.19 · Violeta 300 sobre `primary` al 10 % 4.30 · Violeta 300/`#292833` 4.42.

Regla operativa: cualquier combinación nueva se verifica antes de usarse (el script `contrast.js` vive en el repo, en `/tools`).

## 7. Modo oscuro — reglas

1. El fondo es Tinta oscura `#17161D`, nunca negro puro; las superficies se aclaran al elevarse (`#201F28` → `#292833`), no se les agrega sombra.
2. Los colores funcionales suben a sus stops 300 (violeta, coral, semánticos); los stops 500–700 no se usan como texto sobre fondos oscuros.
3. El logo usa su versión negativa (Blanco roto + pulso Coral 300).
4. Las fotos e imágenes no se oscurecen con overlays violetas.
5. El modo lo decide el sistema del usuario (`prefers-color-scheme`), con override manual en Ajustes (fase 2).

## 8. Implementación

```css
/* globals.css — fuente de verdad de tokens (extracto) */
:root {
  /* No dependen del modo */
  --destructive: #CC4141; --destructive-hover: #B03030; --on-destructive: #FFFFFF;
  --radius: 10px;
}
:root, .light {
  --background: #FBFAF7;   --surface: #FFFFFF;         --surface-raised: #FFFFFF;
  --border: #E8E6DE;       --border-strong: #D6D3C8;
  --text: #23212F;         --text-secondary: #625F55;  --text-muted: #8A877B;
  --primary: #5A4BD1;      --primary-hover: #4A3DB8;   --on-primary: #FFFFFF;
  --accent: #EE6A4D;       --accent-text: #C24327;
  --focus-ring: #7263E2;
  --success: #177449; --success-bg: #D3EDE0; --success-text: #115A39;
  --warning: #8F5300; --warning-bg: #F7E4C2; --warning-text: #8F5300;
  --danger:  #CC4141; --danger-bg:  #F8D6D6; --danger-text:  #B03030;
  /* Estados de cuota (§5) */
  --state-pending-bg: #F4F2ED; --state-pending-text: #4C4A42;
  --state-partial-bg: #F7E4C2; --state-partial-text: #8F5300;
  --state-paid-bg:    #D3EDE0; --state-paid-text:    #115A39;
  --state-overdue-bg: #F8D6D6; --state-overdue-text: #B03030;
  --state-waived-bg:  #EDEAFB; --state-waived-text:  #4A3DB8;
  /* Ítem activo de la navegación (Componentes §3.6) */
  --nav-active-bg: #F6F4FD;    --nav-active-text: #5A4BD1;
  --muted: #F4F2ED;                                    /* fondo de hover neutro */
  --elevation-float: 0 8px 24px rgba(23, 22, 29, 0.12);
}
.dark {
  --background: #17161D;   --surface: #201F28;         --surface-raised: #292833;
  --border: #35343F;       --border-strong: #45434F;
  --text: #EDECE6;         --text-secondary: #A5A29A;  --text-muted: #8A877B;
  --primary: #8B7FF0;      --primary-hover: #C9C2F6;   --on-primary: #17161D;
  --accent: #F59B85;       --accent-text: #F59B85;
  --focus-ring: #8B7FF0;
  --success: #7CC9A4; --success-bg: #0F3524; --success-text: #7CC9A4;
  --warning: #EBB868; --warning-bg: #3B2A08; --warning-text: #EBB868;
  --danger:  #EE9A9A; --danger-bg:  #3C1414; --danger-text:  #EE9A9A;
  --state-pending-bg: #292833; --state-pending-text: #A5A29A;
  --state-partial-bg: #3B2A08; --state-partial-text: #EBB868;
  --state-paid-bg:    #0F3524; --state-paid-text:    #7CC9A4;
  --state-overdue-bg: #3C1414; --state-overdue-text: #EE9A9A;
  --state-waived-bg:  #2A2268; --state-waived-text:  #C9C2F6;
  --nav-active-bg: #2A2268;    --nav-active-text: #C9C2F6;   /* NO primary: no llegaría a AA */
  --muted: #292833;
  --elevation-float: none;     /* en oscuro la superficie se aclara, no se le agrega sombra */
}
```

El modo lo decide el sistema (§7.5): los valores de `.dark` se repiten en un `@media (prefers-color-scheme: dark)` sobre `:root:not(.light)`. Las clases `.light` y `.dark` fuerzan el modo en cualquier subárbol — es lo que usa la página `/dev/ui` para mostrar los dos modos a la vez, y lo que va a usar el override manual de Ajustes (fase 2).

Mapeo a shadcn/ui: `--primary` → primario Ritma, `--destructive` → rojo sólido, `--muted` → Neutro 100 / `#292833`, `--ring` → `--focus-ring`, `--radius` → 10px, `--card` → `surface`, `--popover` → `surface-raised`, `--foreground` → `text`, `--muted-foreground` → `text-secondary`.

⚠️ **`accent` colisiona**: en shadcn `--accent` es el fondo de hover de botones y menús; en Ritma es el coral. Gana Ritma. Todo componente de shadcn que traigamos tiene que remapear sus `bg-accent` / `text-accent-foreground` a `bg-muted` / `text-text` — que es, además, el hover que pide Componentes §2.3.

En Tailwind, las escalas completas de §3 se exponen bajo `colors.violeta`, `colors.coral`, `colors.neutro`, etc., pero los componentes usan los tokens semánticos — las escalas existen para construir tokens, no para usarse sueltas en JSX.

## 9. Reglas duras

1. Coral 500 jamás como texto por debajo de 24 px — texto coral es siempre Coral 700 (claro) o Coral 300 (oscuro).
2. El violeta no se usa como color decorativo de fondos grandes: es señal de acción.
3. Nada de degradados, ni entre stops de la misma escala.
4. Los estados de cuota usan exactamente las recetas de §5 — sin variaciones por pantalla.
5. Texto blanco puro solo sobre Violeta 600/700 y semánticos sólidos; sobre fondos oscuros el texto es Blanco roto.
6. Ningún color comunica solo: siempre acompañado de etiqueta o ícono con label accesible.

## 10. Gobernanza

No se agregan colores: se usan las escalas. Si un caso real no se resuelve con los tokens de §4, la solución es proponer un token nuevo en este documento (con contraste verificado), no un hex en el código. Cada cambio incrementa la versión del documento y se refleja en `globals.css` en el mismo PR.
