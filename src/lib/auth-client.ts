"use client";

import { customSessionClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "@/lib/auth";

/**
 * Cliente de Better Auth para los componentes del navegador.
 *
 * `customSessionClient<typeof auth>()` es lo que hace que `activeOrgId` llegue
 * tipado al cliente: sin él, la sesión del cliente no conoce nuestros campos.
 */
export const authClient = createAuthClient({
  plugins: [customSessionClient<typeof auth>()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
