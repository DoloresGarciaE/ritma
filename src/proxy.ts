import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * En Next 16 el middleware se llama Proxy.
 *
 * Esto es un chequeo optimista y nada más: mira si existe la cookie de sesión, pero NO la
 * valida. **Podría** hacerlo —en Next 16 el Proxy corre en Node, no en Edge, así que
 * llegaría a la base—, pero no lo hace a propósito: corre en TODA request que matchea,
 * incluidos los prefetch de los <Link> del shell, y la guardia real (sesión Y organización)
 * ya lee la base en el layout de (app). La doc de Next lo dice igual: el proxy no es una
 * solución de autorización.
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
  // Allowlist explícita de rutas privadas: todo lo demás (/login, /registro, /api/auth,
  // /_next, /dev/ui, estáticos) ni siquiera pasa por acá.
  //
  // Ojo: tienen que ser literales. Next los analiza en build, así que una variable
  // importada de nav-items.ts se ignoraría en silencio.
  //
  // "/" está a propósito (ticket root-redirect): la raíz no tiene contenido, y el
  // redirect a /login tiene que salir de ACÁ para ser un 307 real — el `redirect()` del
  // page llega tarde porque el loading.tsx raíz (splash S6) ya flusheó el shell con 200,
  // y el salto quedaría en manos del cliente. Con cookie, "/" pasa de largo y el page
  // resuelve el destino real (dashboard o wizard) con la sesión validada.
  matcher: [
    "/",
    "/dashboard/:path*",
    "/agenda/:path*",
    "/alumnos/:path*",
    "/cobranzas/:path*",
    "/estudio/:path*",
    "/ajustes/:path*",
    "/mas/:path*",
    "/crear-organizacion/:path*",
  ],
};
