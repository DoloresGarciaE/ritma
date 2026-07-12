import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * En Next 16 el middleware se llama Proxy.
 *
 * Esto es un chequeo optimista y nada más: mira si existe la cookie de sesión,
 * pero NO la valida (validarla necesita la base, y acá corre el runtime Edge).
 * La guardia real es `requireSession()` en el layout de (app) — la propia doc de
 * Next dice que el proxy no es una solución de autorización.
 *
 * Cero lógica de negocio acá.
 */
export function proxy(request: NextRequest) {
  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (!hasSessionCookie) {
    const login = new URL("/login", request.url);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Solo las rutas privadas. /login y /registro no pasan por acá.
  matcher: ["/dashboard/:path*"],
};
