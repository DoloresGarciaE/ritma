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
  // La base de toda URL de metadatos (S5): sin esto, un path relativo en openGraph es
  // ERROR DE BUILD en Next 16. Misma fuente que los links compartidos (lib/receipts.ts).
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Ritma",
  description: "Gestión de agenda, alumnos y cobranzas para docentes y estudios.",
  // PWA (S6): iOS ignora los íconos del manifest — el de 180 va como apple-touch-icon.
  icons: {
    apple: "/brand/ritma-app-icon-180.png",
  },
  appleWebApp: {
    capable: true,
    title: "Ritma",
    statusBarStyle: "default",
  },
};

/**
 * `viewport-fit=cover` es lo que hace que `env(safe-area-inset-*)` valga algo: sin esto,
 * la bottom nav se mete abajo de la barra de gestos del teléfono (Componentes §3.6).
 * No tocamos width/initialScale: Next ya los pone, y limitar el zoom rompería el
 * requisito de usar la app al 200 % (Componentes §5.7).
 */
export const viewport: Viewport = {
  viewportFit: "cover",
  // El color del chrome del navegador acompaña al fondo de cada modo (Color §4).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#17161d" },
  ],
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
