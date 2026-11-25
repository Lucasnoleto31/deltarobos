import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A pasta do projeto fica dentro do OneDrive, com outro package-lock acima:
  // fixa a raiz pro Turbopack não se confundir.
  turbopack: {
    root: process.cwd(),
  },
  // gerador de PDF roda em Node puro; não passa pelo bundler
  serverExternalPackages: ["@react-pdf/renderer"],
  /**
   * Telas que deixaram de existir na revisão de 25/11/2026 (DESIGN.md, seção 9): a comparação virou a lista
   * da página inicial, o Desempenho foi para o Resumo do robô e os relatórios de cada mês estão em Dia a dia.
   * Não permanentes: link antigo e favorito continuam chegando a algum lugar, sem prender o navegador.
   */
  async redirects() {
    return [
      { source: "/comparativo", destination: "/", permanent: false },
      { source: "/robos/:slug/desempenho", destination: "/robos/:slug", permanent: false },
      { source: "/robos/:slug/relatorios", destination: "/robos/:slug/calendario#mes-a-mes", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // o widget pode ser colado em iframe de qualquer site
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
