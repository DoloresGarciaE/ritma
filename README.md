# Ritma

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
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## Comandos

| Comando                | Qué hace                       |
| ---------------------- | ------------------------------ |
| `npm run dev`          | Servidor de desarrollo         |
| `npm run build`        | Build de producción            |
| `npm run start`        | Servir el build                |
| `npm run lint`         | ESLint                         |
| `npm run typecheck`    | TypeScript sin emitir          |
| `npm run format`       | Formatear con Prettier         |
| `npm run format:check` | Verificar formato sin escribir |
