import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ThemeProvider, NO_FLASH_SCRIPT } from "@/components/ui/ThemeProvider";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export const metadata: Metadata = {
  title: "Agencia de Turismo",
  description: "Sistema Inteligente de Gestión y Venta",
};

export const viewport: Viewport = {
  // El theme-color real lo gestiona el navegador via prefers-color-scheme.
  // Acá damos un default conservador.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1011" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Setea data-theme antes del paint para evitar flash de light en dark mode */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-surface-primary text-text-primary antialiased">
        <ThemeProvider>
          {children}
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
