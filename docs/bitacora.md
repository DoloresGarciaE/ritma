# Bitácora de Ritma

Registro semanal, tres líneas por semana (hecho / trabado / próximo). Es la memoria para
retomar después de una semana sin tocar el proyecto (Plan de implementación §2.6, §11).

---

## Semana 1 (julio 2026) — arrancó Ritma

- **Hecho:** F0.1 cerrado — scaffold Next.js 16 (TS, App Router, Tailwind, ESLint, Prettier),
  estructura de carpetas de §4, README con enlaces a docs, y deploy "hola Ritma" en producción
  (ritma-eight.vercel.app). Día 0 cerrado del lado del repo: docs a `docs/`, `tools/contrast.js`,
  ADR-001, esta bitácora.
- **Trabado:** nada bloqueante. Dominio `ritma.com.ar` comprado y tablero "Ritma" creado en
  GitHub Projects. Pendiente de Día 0 fuera del repo: crear las cuentas gratuitas de
  Neon/R2/Resend/Sentry, OAuth de Google, delegar el dominio a Vercel (F0.7) y —si se quiere—
  la búsqueda de antecedentes de marca en INPI/stores.
- **Próximo:** F0.2 — tokens de color (claro/oscuro) en `globals.css`, fuentes con `next/font`
  (Inter + Space Grotesk), shadcn/ui y los primeros componentes; página `/dev/ui`.

## Semana 2 (julio 2026) — tokens y UI base

- **Hecho:** F0.1 mergeado a `main` (squash). F0.2 en `feat/f0-2-ui-tokens`: tokens de color
  claro/oscuro y escalas en Tailwind, Inter + Space Grotesk con `next/font`, shadcn/ui
  inicializado, y Botón, Campos (con el input de monto), Badge de estado y Card según la
  Especificación de componentes. `/dev/ui` muestra todo en los dos modos a la vez.
- **Trabado:** nada bloqueante. La Especificación de color pasó a 1.1: al implementar
  aparecieron tres huecos (los estados Pendiente y Exonerada no tenían token, el botón
  destructivo necesitaba un rojo que no cambie con el modo, y Neutro 400 como placeholder
  daba 2.15:1). Se resolvieron sin agregar colores nuevos.
- **Próximo:** F0.3 — Neon + Prisma, `schema.prisma` v1 (Organization, User, Membership),
  primera migración y `seed.ts`.

## Semana 3 (julio 2026) — base de datos

- **Hecho:** F0.2 mergeado a `main` (squash). F0.3 en `feat/f0-3-database`: Prisma 7 sobre Neon
  (pooled para la app vía driver adapter, directa para el CLI), `schema.prisma` v1 con
  Organization / User / Membership, primera migración aplicada, seed idempotente con las dos
  orgs de los casos de uso, y el singleton en `src/lib/db.ts`.
- **Trabado:** nada bloqueante, pero Prisma 7 no es el Prisma de los tutoriales: el driver
  adapter es obligatorio, la URL del CLI se mudó a `prisma.config.ts`, y su helper `env()`
  lanza si falta la variable — eso habría roto `npm ci` en la CI de F0.7, donde no hay
  credenciales de base. Se esquivó leyendo `process.env` y dejando el `datasource` condicional.
- **Próximo:** F0.4 — Better Auth (email+contraseña y Google), páginas de login/registro con los
  componentes de F0.2, y sesión con `activeOrgId`.
