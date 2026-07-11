# Ritma — Especificación de color

> Documento normativo. Operacionaliza la paleta definida en la Especificación de marca (§6) para producto y comunicaciones.
> Versión 1.0 · Julio 2026 · Todos los ratios de contraste fueron calculados según WCAG 2.1.

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
| 400 | `#B4B1A5` | Íconos deshabilitados, placeholders |
| 500 | `#8A877B` | Texto terciario (no crítico) |
| 600 ◆ | `#625F55` | Texto secundario |
| 700 | `#4C4A42` | Texto del badge pendiente |

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

Nota del botón primario en oscuro: fondo Violeta 300 con texto Tinta oscura (5.47:1) — no blanco, que quedaría por debajo de AA.

## 5. Estados de cuota — recetas exactas

Correspondencia fija con los estados del Plan de proyecto (RN3). Formato badge: fondo + texto + punto indicador.

| Estado | Modo claro (fondo / texto) | Ratio | Modo oscuro (fondo / texto) | Ratio |
|---|---|---|---|---|
| Pendiente | Neutro 100 / Neutro 700 | 7.94:1 | `#292833` / `#A5A29A` | ≥ 4.5 |
| Parcial | Ámbar 100 / Ámbar 800 | 4.94:1 | Ámbar 950 / Ámbar 300 | 7.62:1 |
| Pagada | Verde 100 / Verde 800 | 6.66:1 | Verde 950 / Verde 300 | 6.91:1 |
| Vencida | Rojo 100 / Rojo 700 | 4.71:1 | Rojo 950 / Rojo 300 | 7.47:1 |
| Exonerada | Violeta 100 / Violeta 700 | 6.70:1 | Violeta 900 / **Violeta 200** | 8.21:1 |

Estas recetas aplican también a filas de tablas, timeline de la ficha de alumno y comprobantes. En comprobantes solo se usa el modo claro.

## 6. Contraste verificado (WCAG 2.1)

Resumen de pares aprobados para texto normal (≥ 4.5:1): Tinta/blanco 15.79 · Tinta/Neutro 50 15.13 · Violeta 600/blanco 6.25 · blanco/Violeta 600 6.25 · Violeta 700/blanco 7.92 · Coral 700/blanco 5.09 · Gris 600/Neutro 50 6.12 · Verde 700/blanco 5.78 · Ámbar 800/blanco 6.17 · Rojo 600/blanco 4.77 · blanco roto/`#201F28` 13.77 · `#A5A29A`/`#17161D` 7.04 · Tinta oscura/Violeta 300 5.47 · Coral 300/`#201F28` 7.69, más las recetas de badges de §5.

Aprobados solo para texto grande, íconos y gráficos (≥ 3:1): Coral 500/blanco 3.09 · Violeta 400/blanco 4.57 (anillo de foco).

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
  --background: #FBFAF7;   --surface: #FFFFFF;
  --border: #E8E6DE;       --border-strong: #D6D3C8;
  --text: #23212F;         --text-secondary: #625F55;  --text-muted: #8A877B;
  --primary: #5A4BD1;      --primary-hover: #4A3DB8;   --on-primary: #FFFFFF;
  --accent: #EE6A4D;       --accent-text: #C24327;
  --focus-ring: #7263E2;
  --success: #177449; --success-bg: #D3EDE0; --success-text: #115A39;
  --warning: #8F5300; --warning-bg: #F7E4C2; --warning-text: #8F5300;
  --danger:  #CC4141; --danger-bg:  #F8D6D6; --danger-text:  #B03030;
}
.dark {
  --background: #17161D;   --surface: #201F28;
  --border: #35343F;       --border-strong: #45434F;
  --text: #EDECE6;         --text-secondary: #A5A29A;
  --primary: #8B7FF0;      --primary-hover: #C9C2F6;   --on-primary: #17161D;
  --accent: #F59B85;       --accent-text: #F59B85;
  --success: #7CC9A4; --success-bg: #0F3524; --success-text: #7CC9A4;
  --warning: #EBB868; --warning-bg: #3B2A08; --warning-text: #EBB868;
  --danger:  #EE9A9A; --danger-bg:  #3C1414; --danger-text:  #EE9A9A;
}
```

Mapeo a shadcn/ui: `--primary` → primario Ritma, `--destructive` → rojo, `--muted` → Neutro 100 / `#292833`, `--ring` → `--focus-ring`, `--radius` → 10px. En Tailwind, las escalas completas de §3 se exponen bajo `colors.violeta`, `colors.coral`, `colors.neutro`, etc., pero los componentes usan los tokens semánticos — las escalas existen para construir tokens, no para usarse sueltas en JSX.

## 9. Reglas duras

1. Coral 500 jamás como texto por debajo de 24 px — texto coral es siempre Coral 700 (claro) o Coral 300 (oscuro).
2. El violeta no se usa como color decorativo de fondos grandes: es señal de acción.
3. Nada de degradados, ni entre stops de la misma escala.
4. Los estados de cuota usan exactamente las recetas de §5 — sin variaciones por pantalla.
5. Texto blanco puro solo sobre Violeta 600/700 y semánticos sólidos; sobre fondos oscuros el texto es Blanco roto.
6. Ningún color comunica solo: siempre acompañado de etiqueta o ícono con label accesible.

## 10. Gobernanza

No se agregan colores: se usan las escalas. Si un caso real no se resuelve con los tokens de §4, la solución es proponer un token nuevo en este documento (con contraste verificado), no un hex en el código. Cada cambio incrementa la versión del documento y se refleja en `globals.css` en el mismo PR.
