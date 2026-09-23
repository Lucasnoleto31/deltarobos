"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Metodologia é leitura rara: sem prefetch, busca no clique em vez de em toda página (18/09/2026)
const LINKS: { href: string; rotulo: string; prefetch?: false }[] = [
  { href: "/comparativo", rotulo: "Comparativo" },
  { href: "/simulador", rotulo: "Simulador" },
  { href: "/metodologia", rotulo: "Metodologia", prefetch: false },
  { href: "/#comunidade", rotulo: "Comunidade" },
];

/**
 * Os links do cabeçalho, com a página atual marcada. No celular rolam junto com os robôs (19/09/2026).
 * A faixa é o nav do Cabecalho, que é server: daqui ela abre com a página atual no meio (link ou robô,
 * quando rola) e o foco do teclado traz o link para fora do esmaecido. Só a rolagem da faixa, não a da página.
 */
export function LinksNav() {
  const pathname = usePathname();

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Principal"]');
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const a = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!a) return;
    nav.scrollLeft += a.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - a.offsetWidth) / 2;
  }, [pathname]);

  return (
    <>
      {LINKS.map((l) => {
        const atual = !l.href.includes("#") && pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch={l.prefetch}
            aria-current={atual ? "page" : undefined}
            onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-full px-3 whitespace-nowrap transition-colors",
              atual ? "bg-(--linha-hover) text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.rotulo}
          </Link>
        );
      })}
    </>
  );
}
