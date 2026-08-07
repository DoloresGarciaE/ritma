import type { MetadataRoute } from "next";

/**
 * Los comprobantes públicos NO se indexan (decisión de privacidad S5): quien tiene el
 * link ve el comprobante, pero un buscador no lo encuentra.
 *
 * ⚠️ `/r/` NO se bloquea acá a propósito: bloquear el crawl impediría que el buscador
 * LEA el `noindex` de la página, y una URL enlazada públicamente podría terminar
 * indexada igual como URL pelada ("indexed, though blocked by robots.txt"). El noindex
 * de la meta es la señal autoritativa, y necesita que el crawler pueda entrar a verla.
 * Los crawlers de previews (WhatsApp/Meta) van directo a la página, así que el unfurl
 * del chat funciona en cualquier caso.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dev/"] },
  };
}
