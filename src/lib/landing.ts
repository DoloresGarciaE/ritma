/**
 * A dónde entra cada quien (F0.4/F0.5): sin sesión → login; con sesión pero sin
 * organización → wizard (sin org no hay app); con org activa → dashboard.
 *
 * Es LA fuente de verdad del destino de entrada: la consumen la raíz `/` (que no
 * tiene contenido, solo enruta) y el layout de `(auth)` (un logueado que visita
 * /login rebota acá mismo). Pura a propósito: los tres casos se prueban sin base,
 * y el caso "cookie de org forjada" se prueba componiéndola con `resolveActiveOrg`,
 * que es quien decide qué `activeOrgId` trae la sesión.
 */
export function resolveLanding(
  session: { activeOrgId: string | null } | null,
): "/login" | "/crear-organizacion" | "/dashboard" {
  if (!session) return "/login";
  return session.activeOrgId ? "/dashboard" : "/crear-organizacion";
}

/**
 * Valida un `?next=` (S7: la invitación manda a login/registro y VUELVE). Solo paths
 * internos: tiene que empezar con "/" y no con "//" (que el navegador lee como
 * protocol-relative — sería un open redirect a otro dominio). Cualquier otra cosa
 * cae a null y el flujo sigue por `resolveLanding`, como siempre.
 */
export function safeInternalPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}
