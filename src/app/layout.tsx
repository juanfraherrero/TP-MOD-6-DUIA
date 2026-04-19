import "./globals.css";

export const metadata = {
  title: "Agencia de Turismo",
  description: "Sistema Inteligente de Gestión y Venta",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
