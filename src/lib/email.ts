/**
 * Recordatorios por email vía Resend (HU5.3), detrás de guarda de env — el MISMO patrón
 * que R2 (S4): sin `RESEND_API_KEY` el feature entero se apaga y la UI muestra la opción
 * deshabilitada con el motivo (§4.3); el resto de la app ni se entera.
 *
 * Sin SDK: mandar un email es UN POST a la API — una dependencia menos que auditar.
 * El remitente sale de `RESEND_FROM` ("Nombre <cobros@dominio>", dominio verificado en
 * Resend); sin ella cae al remitente de onboarding de Resend, que solo entrega al dueño
 * de la cuenta — suficiente para probar, inútil en producción (queda en el checklist).
 */

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

const FROM_FALLBACK = "Ritma <onboarding@resend.dev>";

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Marca §9.3: encabezado con el logotipo principal sobre blanco, cuerpo en Inter, pie
 * con datos de la organización. Un solo estilo, simple; colores del modo claro (los
 * emails no tienen modo oscuro confiable). Exportada solo para poder testearla pura.
 */
export function buildReminderEmailHtml(input: { message: string; orgName: string }): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const paragraphs = input.message
    .split(/\n+/)
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p style="margin:0 0 12px;">${escapeHtml(line)}</p>`)
    .join("");

  return (
    `<div style="background:#FFFFFF;padding:32px 24px;` +
    `font-family:Inter,system-ui,-apple-system,sans-serif;color:#23212F;">` +
    `<div style="max-width:480px;margin:0 auto;">` +
    `<img src="${base}/brand/ritma-logotipo.png" width="96" height="37" alt="Ritma" ` +
    `style="display:block;margin-bottom:24px;" />` +
    `<div style="font-size:16px;line-height:1.5;">${paragraphs}</div>` +
    `<hr style="border:none;border-top:1px solid #E8E6DE;margin:24px 0;" />` +
    `<p style="margin:0;font-size:12px;color:#625F55;">${escapeHtml(input.orgName)}</p>` +
    `</div></div>`
  );
}

/** Manda el recordatorio. Lanza si la guarda está apagada o si Resend no lo aceptó. */
export async function sendReminderEmail(input: {
  to: string;
  subject: string;
  /** El texto de la plantilla renderizada: va como cuerpo (html) y como fallback (text). */
  message: string;
  orgName: string;
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("El email no está configurado (falta RESEND_API_KEY).");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? FROM_FALLBACK,
      to: input.to,
      subject: input.subject,
      html: buildReminderEmailHtml({ message: input.message, orgName: input.orgName }),
      text: input.message,
    }),
  });

  if (!response.ok) {
    // El detalle queda en el server (Sentry lo captura); a la UI viaja un error genérico.
    throw new Error(`Resend rechazó el envío (HTTP ${response.status}).`);
  }
}
