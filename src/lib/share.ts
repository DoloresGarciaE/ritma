/**
 * Compartir un link (HU5.1): Web Share API en mobile (abre la hoja del sistema, con
 * WhatsApp primero en la práctica), copiar al portapapeles en desktop. Se comparte el
 * LINK, no la imagen: el preview lo arma el chat con los metadatos OG.
 *
 * Corre solo en el cliente (usa `navigator`); el caller decide qué toast mostrar según
 * el resultado — "copied" merece un "Link copiado", "shared" no necesita nada.
 */

export type ShareOutcome = "shared" | "copied" | "failed";

export async function shareLink(url: string, title?: string): Promise<ShareOutcome> {
  if (typeof navigator === "undefined") return "failed";

  if (navigator.share) {
    try {
      await navigator.share({ url, title });
      return "shared";
    } catch (error) {
      // AbortError: cerró la hoja sin elegir app — no es un error, y no se toastea.
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
      // Otros fallos (p. ej. share() presente pero sin handler): probamos el portapapeles.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
