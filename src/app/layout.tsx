import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { ProvedorTema } from "@/components/tema/ProvedorTema";
import "./globals.css";

// Hanken Grotesk (ficha Mesa, 25/11/2026): uma família só, em três pesos, no texto e nos números. Os
// algarismos tabulares vêm ligados no body (globals.css), então coluna e valor que muda não dançam.
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Quants Robôs · Performance ao vivo",
    template: "%s · Quants Robôs",
  },
  description:
    "Resultado ao vivo dos robôs de day trade da Quants Robôs, direto do MetaTrader 5, sempre para 1 contrato.",
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
  // a barra de navegação de baixo do celular respeita a área do gesto do aparelho (safe-area-inset-bottom)
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0d" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      // par obrigatório do scroll-behavior: smooth do globals.css (19/09/2026): sem este atributo, o
      // Next 16 deixa a troca de página deslizar a tela inteira até o topo em vez de ir direto
      data-scroll-behavior="smooth"
      className={`${hanken.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ProvedorTema>{children}</ProvedorTema>
      </body>
    </html>
  );
}
