import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "Ritma",
  description: "Gestión de agenda, alumnos y cobranzas para docentes y estudios.",
};

/**
 * `viewport-fit=cover` es lo que hace que `env(safe-area-inset-*)` valga algo: sin esto,
 * la bottom nav se mete abajo de la barra de gestos del teléfono (Componentes §3.6).
 * No tocamos width/initialScale: Next ya los pone, y limitar el zoom rompería el
 * requisito de usar la app al 200 % (Componentes §5.7).
 */
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
