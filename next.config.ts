import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A pasta do projeto fica dentro do OneDrive, com outro package-lock acima:
  // fixa a raiz pro Turbopack não se confundir.
  turbopack: {
    root: process.cwd(),
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
