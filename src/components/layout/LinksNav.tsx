"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Metodologia é leitura rara: sem prefetch, busca no clique em vez de em toda página (18/09/2026).
// `classe`: Comunidade sai da barra só entre lg e xl (13/10/2026). A Poppins é mais larga que a fonte de
// antes, e com três robôs a linha única de 1024 px não fechava: a faixa rolava e cortava os dois últimos
// links. A âncora é da home, que já mostra a seção, e o rodapé tem o mesmo link. No celular e a partir de
// xl ela continua aqui.
const LINKS: { href: string; rotulo: string; prefetch?: false; classe?: string }[] = [
  { href: "/comparativo", rotulo: "Comparativo" },
  { href: "/simulador", rotulo: "Simulador" },
  { href: "/metodologia", rotulo: "Metodologia", prefetch: false },
  { href: "/#comunidade", rotulo: "Comunidade", classe: "lg:max-xl:hidden" },
];

/**
 * Os links do cabeçalho, com a página atual marcada. No celular rolam junto com os robôs (19/09/2026).
 * A faixa é o nav do Cabecalho, que é server: daqui ela abre com a página atual no meio (link ou robô,
 * quando rola) e o foco do teclado traz o link para fora do esmaecido. Só a rolagem da faixa, não a da página.
 * 13/10/2026: a página atual na mesma pílula tintada no acento das abas de robô (AbasRobos).
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
              "inline-flex h-8 shrink-0 items-center rounded-full px-2.5 whitespace-nowrap transition-colors",
              atual
                ? "bg-primary/12 text-foreground dark:bg-primary/25"
                : "text-muted-foreground hover:bg-(--linha-hover) hover:text-foreground",
              l.classe,
            )}
          >
            {l.rotulo}
          </Link>
        );
      })}
    </>
  );
}
