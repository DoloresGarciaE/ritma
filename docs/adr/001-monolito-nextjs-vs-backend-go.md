# ADR-001 — Monolito Next.js full-stack vs. backend separado en Go

- **Estado:** Aceptada
- **Fecha:** 2026-07
- **Contexto de decisión:** cerrada antes de la primera línea de código (Día 0).

## Contexto

Ritma es una web app mobile-first de gestión (agenda, alumnos, cobranzas) construida por
**un solo dev part-time**, con un MVP acotado y sin tráfico ni carga que justifiquen
infraestructura distribuida. La duda de arranque fue si separar la lógica de negocio en un
backend propio (por ejemplo, un servicio en Go con su API) o resolver todo dentro de una
única aplicación Next.js.

Restricciones que pesan en la decisión:

- Recurso humano mínimo: cada pieza de infraestructura extra es tiempo que no va al producto.
- El MVP no necesita colas, workers ni una API pública (ver Plan de proyecto §5, fuera de MVP).
- La lógica sensible (RN1–RN10: cuotas, imputaciones, liquidaciones) tiene que ser testeable
  con rigor, independientemente de dónde corra.

## Decisión

Se adopta un **monolito Next.js full-stack** (App Router, TypeScript), desplegado en Vercel:

- **Server Actions** para las mutaciones y **Route Handlers** para lo público (comprobantes
  `/r/[token]`) y los cron (`/api/cron/*`).
- La **lógica de negocio vive aislada en `src/server/services/` como funciones puras** que
  reciben datos y devuelven resultados, sin acoplarse a Next ni a la base de datos.

No se separa un backend Express ni un servicio en Go para el MVP.

## Consecuencias

**A favor**

- Un solo despliegue, un solo lenguaje, un solo pipeline: máxima velocidad de desarrollo para
  un dev part-time.
- Sin latencia de red entre "frontend" y "backend" ni contrato de API que mantener.
- La capa de servicios pura se testea con Vitest sin levantar infraestructura (RN1–RN10).

**En contra / a vigilar**

- Vercel impone límites de ejecución (funciones serverless) que hay que respetar; nada de
  trabajos largos dentro de un request.
- Si algún día aparecen colas, workers o una API pública, habrá que extraer parte de la
  lógica a un servicio aparte.

**Mitigación de la contra:** al mantener la lógica de negocio como **módulos puros** en
`src/server/services/`, esa extracción futura es un movimiento de código, no una
re-arquitectura. La decisión es reversible al costo de mover archivos, no de reescribir.

## Referencias

- Plan de proyecto §10 (Arquitectura y stack técnico) — principio rector del monolito.
- Plan de implementación §3 (Día 0) — decisiones cerradas que no se reabren.
