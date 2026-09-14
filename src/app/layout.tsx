import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ProvedorTema } from "@/components/tema/ProvedorTema";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Delta Robôs · Performance ao vivo",
    template: "%s · Delta Robôs",
  },
  description:
    "Resultado ao vivo dos robôs de day trade da Delta Robôs, direto do MetaTrader 5, normalizado por contrato.",
  applicationName: "Delta Robôs",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Delta Robôs",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#00162e" },
    { media: "(prefers-color-scheme: light)", color: "#f7f5f1" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ProvedorTema>{children}</ProvedorTema>
      </body>
    </html>
  );
}
