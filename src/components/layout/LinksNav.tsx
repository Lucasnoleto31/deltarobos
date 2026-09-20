"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Metodologia é leitura rara: sem prefetch, busca no clique em vez de em toda página (18/09/2026)
const LINKS: { href: string; rotulo: string; prefetch?: false }[] = [
  { href: "/comparativo", rotulo: "Comparativo" },
  { href: "/metodologia", rotulo: "Metodologia", prefetch: false },
  { href: "/#comunidade", rotulo: "Comunidade" },
];

/**
 * O item da barra lateral (20/09/2026): uma linha inteira, e o atual com o fio do verde da marca à
 * esquerda mais um fundo de leve — o mesmo vocabulário do índice da Metodologia (NavSecoes). Mora aqui
 * porque os robôs (AbasRobos) e os links do site são o MESMO item na coluna, e duas cópias da classe
 * divergiriam na primeira troca de cor.
 */
export function classeItemColuna(atual: boolean) {
  return cn(
    "block rounded-r-md border-l-2 px-3 py-1.5 text-sm transition-colors motion-reduce:transition-none",
    atual
      ? "border-primary bg-(--linha-hover) font-medium text-foreground"
      : "border-transparent text-muted-foreground hover:bg-(--linha-hover) hover:text-foreground",
  );
}

interface Props {
  /**
   * "faixa" (padrão): a linha do cabeçalho de cima, que rola de lado no celular.
   * "coluna": a barra lateral de navegação, a partir de xl (20/09/2026).
   */
  orientacao?: "faixa" | "coluna";
}

/**
 * Os links do site, com a página atual marcada. Na faixa rolam junto com os robôs (19/09/2026); na
 * coluna são uma linha cada.
 * A faixa é o nav do Cabecalho, que é server: daqui ela abre com a página atual no meio (link ou robô,
 * quando rola) e o foco do teclado traz o link para fora do esmaecido. Só a rolagem da faixa, não a da
 * página. O nav vem do primeiro link (closest), e não de um querySelector no documento: desde
 * 20/09/2026 existem DOIS nav "Principal" no DOM — o de cima e o da lateral —, e o seletor global
 * pegaria o outro. O que está escondido não rola (scrollWidth e clientWidth zerados) e sai no if.
 */
export function LinksNav({ orientacao = "faixa" }: Props) {
  const pathname = usePathname();
  const primeiro = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (orientacao === "coluna") return;
    const nav = primeiro.current?.closest("nav");
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const a = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!a) return;
    nav.scrollLeft += a.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - a.offsetWidth) / 2;
  }, [pathname, orientacao]);

  return (
    <>
      {LINKS.map((l, i) => {
        const atual = !l.href.includes("#") && pathname.startsWith(l.href);
        if (orientacao === "coluna") {
          return (
            <Link
              key={l.href}
              href={l.href}
              prefetch={l.prefetch}
              aria-current={atual ? "page" : undefined}
              className={classeItemColuna(atual)}
            >
              {l.rotulo}
            </Link>
          );
        }
        return (
          <Link
            key={l.href}
            ref={i === 0 ? primeiro : undefined}
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
