# ADR-003 — Entornos y promoción: main = DEV, producción por release explícito

**Estado:** aceptado (agosto 2026) · **Ticket:** "Crear ambiente DEV y ambiente PROD"

## Contexto

Hasta F0.7, la production branch de Vercel era `main`: cada merge deployaba producción en
el acto. Sirvió para la Fase 0–1 (un solo dev, main siempre deployable), pero mezcla dos
cosas que queremos separadas: **probar lo mergeado en un ambiente estable** y **decidir
cuándo eso llega a los usuarios**. Además, el build migraba la base en TODOS los deploys
(previews incluidos), así que una rama podía estrenar una migración sobre la base dev
antes de estar mergeada.

## Decisión

1. **Trunk-based se queda.** Ni rama `dev` de trabajo ni doble merge por feature: se
   sigue trabajando en ramas cortas contra `main`. El protocolo de sesiones no cambia.
2. **`main` = ambiente DEV.** Con la production branch de Vercel apuntada a `production`,
   cada merge a `main` deploya automático como *preview* con URL estable
   (`ritma-git-main-…` / `dev.ritma.com.ar`) contra la base **dev** de Neon.
3. **Producción = promoción explícita.** La rama-puntero **`production`** solo se mueve
   por fast-forward desde el workflow **`Release`** (`workflow_dispatch` con confirmación
   literal; el disparo manual ES la aprobación). El workflow verifica CI verde en la punta
   de `main` (Vitest + lint + los tres E2E que corren en cada push a `main`), hace el
   fast-forward y etiqueta `release-YYYYMMDD-HHmm`. Vercel deploya producción solo.
4. **Un branch de Neon por entorno** (sigue de F0.7): Production → Neon prod; `main` y
   previews de PR → scope Preview de Vercel → Neon dev. **Migraciones**
   (`scripts/vercel-build.mjs`): solo producción y los deploys de `main` migran; un
   preview de PR usa la base dev SIN migrar — una migración se estrena en DEV al
   mergear, nunca desde un preview.
5. **Rollback = mover el puntero** al tag anterior (ver CLAUDE.md). Como las migraciones
   ya corrieron, un rollback de código NO desmigra la base: las migraciones tienen que
   ser compatibles hacia atrás (expand/contract) — regla que ya veníamos siguiendo.

## Por qué no git-flow

Una rama `dev` de trabajo duplica cada merge (feature→dev→main), desincroniza los dos
historiales a la primera excepción, y no agrega ninguna garantía que el par
main-DEV + puntero-`production` no dé: acá **el historial es uno solo** y "qué hay en
cada ambiente" es una pregunta de punteros (`main` vs `production`), no de merges. Para
un equipo de una persona, cada merge extra es fricción pura.

## Consecuencias

- La verdad de "qué corre en producción" es la rama `production` (y su tag `release-*`).
- Los crons de `vercel.json` corren SOLO en producción (Vercel no cronea previews): en
  DEV se simulan con `npm run cron:dev -- <job>`, como siempre.
- Google login sigue apagado fuera de producción (`VERCEL_ENV=preview`): en DEV se entra
  con email y contraseña.
- La franja "DEV" (`src/components/env-banner.tsx`) marca todo deploy no-productivo.
- `production` queda protegida en GitHub (ruleset): solo el workflow la mueve.
