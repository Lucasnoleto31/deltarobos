import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import { ProvedorTema } from "@/components/tema/ProvedorTema";
import "./globals.css";

// Poppins no texto (ficha padrão do mídia kit, 13/10/2026) e Inter só nos números: a Poppins não tem
// algarismos tabulares (ver a ficha no topo do globals.css). A Geist Mono do scaffold saiu em 18/09/2026.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
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
    { media: "(prefers-color-scheme: dark)", color: "#050915" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7fc" },
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
      className={`${poppins.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ProvedorTema>{children}</ProvedorTema>
      </body>
    </html>
  );
}
