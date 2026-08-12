# ADR-003 — Entornos por rama: `dev` = DEV, `main` = producción, release explícito

**Estado:** aceptado (agosto 2026) · **Ticket:** "Crear ambiente DEV y ambiente PROD"

## Contexto

Hasta F0.7, la production branch de Vercel era `main`: cada merge deployaba producción en
el acto. Sirvió para la Fase 0–1, pero mezcla dos cosas que queremos separadas: **probar
lo mergeado en un ambiente estable** y **decidir cuándo eso llega a los usuarios**.
Además, el build migraba la base en TODOS los deploys (previews incluidos), así que una
rama podía estrenar una migración sobre la base dev antes de estar mergeada.

Se evaluó primero un modelo de rama-puntero (`main` = DEV + puntero `production`), pero
se eligió el modelo por rama: que **cada ambiente sea una rama con nombre propio** es más
legible para operar el día a día.

## Decisión

1. **Una rama por ambiente.** **`dev`** es la rama de integración y el ambiente DEV:
   TODA feature se mergea a `dev` (y solo a `dev`), que deploya automático con URL
   estable (`ritma-git-dev-…` / `dev.ritma.com.ar`) contra la base **dev** de Neon, con
   la franja "DEV" visible. **`main`** es producción: la production branch de Vercel,
   contra la base prod. `dev` es la default branch del repo (los PRs nacen apuntando ahí).
2. **Sin doble merge por feature.** La objeción clásica a git-flow no aplica: una feature
   se mergea UNA vez (a `dev`); `main` no recibe features sueltas sino **`dev` entero**,
   por fast-forward. Así `main` es siempre un prefijo exacto de `dev`: nunca divergen,
   no hay merge commits cruzados, y "qué hay en cada ambiente" se responde comparando
   las dos ramas.
3. **Producción = promoción explícita.** El workflow **`Release`**
   (`workflow_dispatch` con confirmación literal; el disparo manual ES la aprobación)
   verifica CI verde en la punta de `dev` (Vitest + lint + los tres E2E, que corren en
   cada push a `dev`), fast-forwardea `main` y etiqueta `release-YYYYMMDD-HHmm`.
   **`main` jamás recibe commits directos ni PRs**: la mueve solo el workflow (ruleset).
4. **Un branch de Neon por entorno** (sigue de F0.7): `main` → Neon prod; `dev` y los
   previews de PR → scope Preview de Vercel → Neon dev. **Migraciones**
   (`scripts/vercel-build.mjs`): solo producción y los deploys de `dev` migran; un
   preview de PR usa la base dev SIN migrar — una migración se estrena en DEV al
   mergear, nunca desde un preview.
5. **Rollback = mover `main`** al tag anterior (ver CLAUDE.md). Las migraciones ya
   corrieron: un rollback de código NO desmigra la base — por eso las migraciones son
   compatibles hacia atrás (expand/contract), regla que ya veníamos siguiendo.

## Consecuencias

- La verdad de "qué corre en producción" es `main` (y su tag `release-*`); la de "qué
  está por salir" es `dev`. `git log main..dev` = lo pendiente de release.
- Los crons de `vercel.json` corren SOLO en producción (Vercel no cronea previews): en
  DEV se simulan con `npm run cron:dev -- <job>`, como siempre.
- Google login sigue apagado fuera de producción (`VERCEL_ENV=preview`): en DEV se entra
  con email y contraseña.
- La franja "DEV" (`src/components/env-banner.tsx`) marca todo deploy no productivo.
- El protocolo de sesiones cambia UNA palabra: las ramas de trabajo salen de `dev` y se
  mergean a `dev`. El release es una ceremonia aparte, cuando se decide.
