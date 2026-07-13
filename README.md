# Ritma

[![CI](https://github.com/DoloresGarciaE/ritma/actions/workflows/ci.yml/badge.svg)](https://github.com/DoloresGarciaE/ritma/actions/workflows/ci.yml)

Web app **mobile-first** de gestión para docentes independientes y estudios: agenda de
clases, padrón de alumnos y cobranzas. Multi-tenant desde el día 1.

> Vos marcás el ritmo.

## Documentación (fuente de verdad)

Toda la definición del producto vive en [`docs/`](docs/) y es **normativa**: si el código
contradice un documento, se corrige el código o se propone actualizar el documento — nunca
divergen en silencio.

- [Plan de implementación](docs/plan-implementacion-ritma.md) — documento operativo: fases,
  bloques con checkboxes y criterio de salida (DoD). Se trabaja en orden.
- [Plan de proyecto](docs/plan-proyecto-ritma.md) — dominio (§7), reglas de negocio RN1–RN10
  (§8) y arquitectura (§10).
- [Especificación de marca](docs/especificacion-marca-ritma.md) — voz, logo, tipografía.
- [Especificación de color](docs/especificacion-colores-ritma.md) — tokens y estados de cuota.
- [Especificación de componentes UI](docs/especificacion-componentes-ui-ritma.md) — sistema
  de componentes.
- Archivos de marca en [`docs/brand/`](docs/brand/); decisiones de arquitectura en
  [`docs/adr/`](docs/adr/).

Para las convenciones de trabajo con esta base, ver [`CLAUDE.md`](CLAUDE.md).

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Prisma + PostgreSQL (Neon) +
Better Auth. Monolito desplegado en Vercel.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completá los valores reales
npm run db:migrate           # aplica las migraciones en tu base de Neon
npm run db:seed              # dos organizaciones de ejemplo, con sus usuarios
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

`BETTER_AUTH_URL` tiene que coincidir con el origen desde el que servís la app: si no,
Better Auth rechaza los pedidos con `INVALID_ORIGIN`.

### Usuarios de desarrollo

El seed deja dos cuentas para entrar a la app. **Son solo para desarrollo**: la contraseña
está acá a propósito y no existe en producción.

| Email                | Organización             | Contraseña       |
| -------------------- | ------------------------ | ---------------- |
| `malena@example.com` | Danzas Malena (profe)    | `ritma-dev-2026` |
| `carla@example.com`  | Estudio Compás (estudio) | `ritma-dev-2026` |

## Comandos

| Comando                | Qué hace                                            |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Servidor de desarrollo                              |
| `npm run build`        | Build de producción                                 |
| `npm run start`        | Servir el build                                     |
| `npm run lint`         | ESLint                                              |
| `npm run typecheck`    | TypeScript sin emitir                               |
| `npm run format`       | Formatear con Prettier                              |
| `npm run format:check` | Verificar formato sin escribir                      |
| `npm run db:migrate`   | Crea y aplica migraciones                           |
| `npm run db:seed`      | Seed idempotente (organizaciones y dev)             |
| `npm run db:studio`    | Prisma Studio                                       |
| `npm test`             | Levanta el Postgres de test (Docker) y corre Vitest |
| `npm run test:e2e`     | Smoke E2E con Playwright (necesita un build previo) |

## Tests

- **Vitest** — aislamiento org×org, permisos por rol y servicios de dinero. Corren contra un
  **Postgres real** (contenedor efímero, `docker-compose.test.yml`), nunca mockeando Prisma.
  `npm test` levanta la base, aplica las migraciones y corre la suite.
- **Playwright** — un solo smoke: registro → wizard → dashboard. Corre contra un build de
  producción local apuntando al mismo Postgres efímero.

## Deploy

Producción: **Vercel**, desde `main`. Cada PR genera un **preview deployment**.

- El build de Vercel usa el script `vercel-build`, que corre **`prisma migrate deploy`** antes
  de `next build`: las migraciones viajan con cada deploy. Por eso `DIRECT_URL` (la conexión
  directa de Neon) es obligatoria en las variables de entorno de Vercel.
- **Un branch de Neon por entorno**: `production` para producción, `dev` para desarrollo local
  y para los previews. Nunca se comparte base entre entornos.
- **CI** (GitHub Actions): en cada PR corre lint + typecheck + formato + Vitest; al mergear a
  `main`, además el smoke de Playwright. No necesita ningún secreto: la base de los tests es
  un service container del propio job.
