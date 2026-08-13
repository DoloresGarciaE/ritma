import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { resolveLanding } from "@/lib/landing";

/**
 * La raíz no tiene contenido: enruta. El anónimo ni llega acá (el Proxy lo manda
 * a /login con un 307 real — ver el comentario del matcher); con cookie, ESTE es
 * el que decide con la sesión validada, vía `resolveLanding` — la misma fuente
 * que usa el layout de `(auth)` para el rebote de un logueado en /login.
 *
 * La landing pública de Fase 3 reemplaza esta página; ese día, esta resolución
 * se muda al CTA de entrada.
 */
export default async function RootPage() {
  redirect(resolveLanding(await getSession()));
}
