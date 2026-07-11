import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ritma",
  description: "Gestión de agenda, alumnos y cobranzas para docentes y estudios.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
