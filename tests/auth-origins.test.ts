import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La configuración de orígenes de Better Auth, que ya nos rompió cuatro veces (el redirect_uri
 * de Google, el dev en otro puerto, el dominio antes de propagar, y los previews de los PRs).
 *
 * Estos casos fijan el comportamiento por entorno. Se importa `@/lib/auth` con `resetModules`
 * porque el módulo lee `process.env` UNA vez, al importarse.
 */

const ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  // Partimos de un entorno limpio: sin BETTER_AUTH_URL ni variables de Vercel.
  delete process.env.BETTER_AUTH_URL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_BRANCH_URL;
  // La rama decide si Google se enciende: si la CI la exporta, contamina los casos.
  delete process.env.VERCEL_GIT_COMMIT_REF;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("baseURL y trustedOrigins por entorno", () => {
  it("en un PREVIEW la deriva de la URL de la rama, no de localhost", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_BRANCH_URL = "ritma-git-feat-x-loli-projects.vercel.app";
    process.env.VERCEL_URL = "ritma-abc123-loli-projects.vercel.app";

    const { auth } = await import("@/lib/auth");

    // Sin esto, Better Auth cae a http://localhost:3000 y el login es imposible en el deploy.
    expect(auth.options.baseURL).toBe("https://ritma-git-feat-x-loli-projects.vercel.app");
  });

  it("en un PREVIEW confía en la URL de la rama Y en la del deploy", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_BRANCH_URL = "ritma-git-feat-x-loli-projects.vercel.app";
    process.env.VERCEL_URL = "ritma-abc123-loli-projects.vercel.app";

    const { auth } = await import("@/lib/auth");

    // Un preview se abre por cualquiera de las dos: si falta una, da INVALID_ORIGIN.
    expect(auth.options.trustedOrigins).toContain(
      "https://ritma-git-feat-x-loli-projects.vercel.app",
    );
    expect(auth.options.trustedOrigins).toContain("https://ritma-abc123-loli-projects.vercel.app");
  });

  it("en PRODUCCIÓN manda BETTER_AUTH_URL, y el dominio propio siempre vale", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://ritma-eight.vercel.app";

    const { auth } = await import("@/lib/auth");

    expect(auth.options.baseURL).toBe("https://ritma-eight.vercel.app");
    // El dominio definitivo vale desde antes de propagar: el switch no es un salto al vacío.
    expect(auth.options.trustedOrigins).toContain("https://ritma.com.ar");
    expect(auth.options.trustedOrigins).toContain("https://www.ritma.com.ar");
  });

  it("el DEV estable (ADR-003) siempre vale: dominio custom y URL de la rama dev", async () => {
    // El deploy de la rama `dev` sale como preview (la production branch es `main`), y
    // se abre por dev.ritma.com.ar — que la derivación de baseURL no conoce: va explícito.
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_BRANCH_URL = "ritma-git-dev-loli-projects.vercel.app";

    const { auth } = await import("@/lib/auth");

    expect(auth.options.trustedOrigins).toContain("https://dev.ritma.com.ar");
    expect(auth.options.trustedOrigins).toContain("https://ritma-git-dev-loli-projects.vercel.app");
  });
});

describe("isGoogleEnabled", () => {
  it("sin credenciales, apagado", async () => {
    const { isGoogleEnabled } = await import("@/lib/auth");
    expect(isGoogleEnabled).toBe(false);
  });

  it("con credenciales en producción, encendido", async () => {
    process.env.GOOGLE_CLIENT_ID = "x";
    process.env.GOOGLE_CLIENT_SECRET = "y";
    process.env.VERCEL_ENV = "production";

    const { isGoogleEnabled } = await import("@/lib/auth");
    expect(isGoogleEnabled).toBe(true);
  });

  it("en el preview de un PR queda apagado aunque haya credenciales", async () => {
    process.env.GOOGLE_CLIENT_ID = "x";
    process.env.GOOGLE_CLIENT_SECRET = "y";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_REF = "feat/x";
    process.env.VERCEL_BRANCH_URL = "ritma-git-feat-x-loli-projects.vercel.app";

    const { isGoogleEnabled } = await import("@/lib/auth");

    // Su redirect_uri sería el de la rama, que Google no tiene autorizado: el botón fallaría.
    // No se ofrece un botón que sabemos que va a fallar.
    expect(isGoogleEnabled).toBe(false);
  });

  it("en el DEV estable queda ENCENDIDO: es preview, pero tiene dominio propio", async () => {
    // La trampa de ADR-003: el deploy de `dev` sale como preview igual que un PR, así que
    // mirar solo VERCEL_ENV lo apagaría. dev.ritma.com.ar tiene su URI registrada en Google.
    process.env.GOOGLE_CLIENT_ID = "x";
    process.env.GOOGLE_CLIENT_SECRET = "y";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_REF = "dev";
    process.env.BETTER_AUTH_URL = "https://dev.ritma.com.ar";

    const { isGoogleEnabled } = await import("@/lib/auth");

    expect(isGoogleEnabled).toBe(true);
  });

  it("en LOCAL queda encendido: localhost:3000 también está registrado en Google", async () => {
    process.env.GOOGLE_CLIENT_ID = "x";
    process.env.GOOGLE_CLIENT_SECRET = "y";

    const { isGoogleEnabled } = await import("@/lib/auth");

    expect(isGoogleEnabled).toBe(true);
  });
});

describe("vinculación de cuentas (decisión del ticket Google)", () => {
  it("vincula, y NO confía en el proveedor por lista: exige su email verificado", async () => {
    const { auth } = await import("@/lib/auth");
    const linking: Record<string, unknown> = { ...auth.options.account?.accountLinking };

    expect(linking.enabled).toBe(true);
    // `trustedProviders` EXIME al proveedor de declarar el email verificado. NO declararlo
    // es la regla dura del ticket: solo vinculamos con el email verificado por Google.
    expect(linking.trustedProviders).toBeUndefined();
    // El gate LOCAL sí se baja: Ritma no verifica emails todavía, y con el default
    // ninguna cuenta creada con contraseña podría vincularse nunca.
    expect(linking?.requireLocalEmailVerified).toBe(false);
  });
});
