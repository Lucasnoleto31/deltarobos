"use client";

import { ThemeProvider } from "next-themes";

/** Tema escuro por padrão (spec §9), com claro opcional. Classe .dark no <html>. */
export function ProvedorTema({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
