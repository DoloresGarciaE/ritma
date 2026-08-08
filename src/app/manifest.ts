import type { MetadataRoute } from "next";

/**
 * Manifest de la PWA (S6): instalable en Android e iOS, SIN service worker — cero caché
 * offline, cero push (decisión S6). Los íconos salen del maestro `ritma-app-icon.svg`
 * (Marca §9.2); los colores son los del modo claro de la paleta (Color §8) — el manifest
 * no sabe de modos, y el splash nativo de Android usa este fondo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ritma",
    short_name: "Ritma",
    description: "Agenda, alumnos y cobranzas para docentes y estudios.",
    lang: "es-AR",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7", // --background claro
    theme_color: "#fbfaf7",
    icons: [
      { src: "/brand/ritma-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/ritma-app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
