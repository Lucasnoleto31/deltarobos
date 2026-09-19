import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ProvedorTema } from "@/components/tema/ProvedorTema";
import "./globals.css";

// Só a Inter: a Geist Mono do scaffold saiu em 18/09/2026, porque nada usa font-mono e ela era
// pré-carregada em toda página (23 KB). O --font-mono do globals.css aponta para a do sistema.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Quants Robôs · Performance ao vivo",
    template: "%s · Quants Robôs",
  },
  description:
    "Resultado ao vivo dos robôs de day trade da Quants Robôs, direto do MetaTrader 5, normalizado por contrato.",
  applicationName: "Quants Robôs",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Quants Robôs",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#f7f5f1" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ProvedorTema>{children}</ProvedorTema>
      </body>
    </html>
  );
}
