import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { customSession } from "better-auth/plugins";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/lib/db";

/**
 * Better Auth maneja identidad y sesión, y nada más.
 *
 * La tenencia (qué organización, con qué rol) sale de NUESTRAS tablas
 * `Organization` y `Membership`: son la única fuente de verdad (Plan §4, §7). Por
 * eso no usamos su plugin de organizaciones.
 */

/**
 * Las URLs que Vercel inyecta sola en cada deploy (no hay que cargarlas a mano):
 * - `VERCEL_BRANCH_URL`: la URL de la RAMA (`ritma-git-<rama>-…`). Es estable mientras la
 *   rama viva, y es la que Vercel muestra como "Preview" en el PR.
 * - `VERCEL_URL`: la del DEPLOY, distinta en cada push. Sirve como origen, pero no para
 *   registrar callbacks en ningún lado.
 */
const vercelBranchUrl = process.env.VERCEL_BRANCH_URL
  ? `https://${process.env.VERCEL_BRANCH_URL}`
  : undefined;
const vercelDeployUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;

/**
 * La URL desde la que se sirve la app. Better Auth la necesita para dos cosas: validar el
 * origen de cada request y armar el `redirect_uri` de OAuth.
 *
 * **Si no se la damos, cae a `http://localhost:3000`** — y eso, en un deploy, hace que Google
 * reciba un redirect_uri de localhost y que el login sea imposible. Por eso los previews la
 * derivan de la URL de la rama en vez de depender de una variable cargada a mano.
 */
const baseURL = process.env.BETTER_AUTH_URL ?? vercelBranchUrl;

/**
 * Los orígenes desde los que la app puede servirse legítimamente.
 *
 * Better Auth compara el origen de CADA request contra esta lista y, si no coincide, rechaza
 * todo con `INVALID_ORIGIN`. Con una sola URL válida, cada cambio de dominio es un momento de
 * riesgo: ya rompió el login de Google (redirect_uri), el dev en otro puerto, el primer deploy
 * con el dominio definitivo antes de que propagara, y los previews de los PRs.
 *
 * No son secretos: son las direcciones públicas de la app.
 */
const trustedOrigins = [
  "https://ritma.com.ar",
  "https://www.ritma.com.ar",
  "https://ritma-eight.vercel.app",
  // Un preview se puede abrir por la URL de la rama O por la del deploy: las dos valen.
  ...[baseURL, vercelBranchUrl, vercelDeployUrl].filter((url) => url !== undefined),
];

/**
 * Google queda implementado pero apagado hasta que existan las credenciales.
 * La UI lo consulta para no ofrecer un botón que sabemos que va a fallar.
 *
 * En los PREVIEWS también se apaga, por la misma razón: su `redirect_uri` sería el de la rama
 * (`ritma-git-…`), que no está —ni va a estar— entre las Authorized redirect URIs de Google;
 * habría que cargar una por rama. En preview se entra con email y contraseña.
 */
export const isGoogleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.VERCEL_ENV !== "preview",
);

export const auth = betterAuth({
  baseURL,
  database: prismaAdapter(db, { provider: "postgresql" }),

  trustedOrigins,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  ...(isGoogleEnabled
    ? {
        socialProviders: {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          },
        },
      }
    : {}),

  plugins: [
    /**
     * `activeOrgId` viaja en la sesión: es la primera membresía del usuario, o
     * `null` si todavía no tiene ninguna (recién registrado — la creación de
     * organización es F0.5).
     *
     * Se recalcula en cada `getSession()`, no se cachea: así nunca queda una
     * organización vieja pegada a una sesión. El costo es una query indexada por
     * `userId` por request.
     *
     * OJO: esto es contexto, NO autorización. Que la sesión traiga un `orgId` no
     * prueba que el usuario siga siendo miembro: toda query de negocio revalida
     * la membresía (`withOrg`, F0.6).
     */
    customSession(async ({ user, session }) => {
      const membership = await db.membership.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: { orgId: true },
      });

      return { user, session, activeOrgId: membership?.orgId ?? null };
    }),

    // Deja que las server actions puedan setear la cookie de sesión.
    // Tiene que ser el último plugin.
    nextCookies(),
  ],
});

/**
 * La sesión tal como la ve el resto de la app. Es el contrato que consumen F0.5
 * (wizard de organización) y F0.6 (`withOrg` y permisos): si esto cambia, cambia
 * todo lo que cuelga.
 */
export type RitmaSession = {
  userId: string;
  name: string;
  email: string;
  /** `null` mientras el usuario no tenga ninguna organización (recién registrado). */
  activeOrgId: string | null;
};

/**
 * La sesión actual, o `null` si no hay. No redirige: úsalo cuando la sesión es opcional.
 *
 * Va con `cache()` de React porque en cada request la piden el layout y la página: sin
 * esto, cada pantalla paga dos veces la query de sesión y la de membresía. El cache es
 * por request, así que no puede servir datos viejos.
 */
export const getSession = cache(async (): Promise<RitmaSession | null> => {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) return null;

  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    activeOrgId: session.activeOrgId,
  };
});

/**
 * La sesión actual; si no hay, manda a /login. Es la guardia real de las rutas
 * privadas: el proxy solo mira si existe la cookie, no la valida (Next §Proxy).
 */
export async function requireSession(): Promise<RitmaSession> {
  const session = await getSession();

  if (!session) redirect("/login");

  return session;
}
