// Stub de `server-only` para los tests. El paquete real lanza al importarse fuera de un
// React Server Component (y Vitest corre en Node), así que lo reemplazamos por un módulo
// vacío vía alias en vitest.config.ts. No afecta al build de la app: ahí se usa el real.
export {};
