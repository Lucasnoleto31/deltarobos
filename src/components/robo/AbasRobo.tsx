"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

interface Props {
  slug: string;
}

/**
 * As abas da página do robô (ficha Mesa, 25/11/2026): uma faixa de texto com um fio na cor do texto debaixo da
 * aba atual, de ponta a ponta da área de trabalho, que fica presa logo abaixo da fita de mercado ao rolar.
 * Eram pílulas dentro de um painel arredondado. Os nomes dizem o que a pessoa vai achar, não o jargão:
 * "Dia a dia" (calendário), "Quedas e risco", "Melhores horários" (faixas).
 *
 * No celular a faixa rola de lado, com a ponta esmaecendo, e abre com a aba atual no meio; o foco do
 * teclado traz a aba para fora do esmaecido. Mexe só na rolagem da faixa, não na da página.
 */
export function AbasRobo({ slug }: Props) {
  const pathname = usePathname();
  const faixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const f = faixaRef.current;
    const a = f?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!f || !a) return;
    f.scrollLeft += a.getBoundingClientRect().left - f.getBoundingClientRect().left - (f.clientWidth - a.offsetWidth) / 2;
  }, [pathname]);

  const base = `/robos/${slug}`;
  const abas = [
    { href: base, rotulo: "Visão geral", exato: true },
    { href: `${base}/desempenho`, rotulo: "Desempenho", exato: false },
    { href: `${base}/calendario`, rotulo: "Dia a dia", exato: false },
    { href: `${base}/risco`, rotulo: "Quedas e risco", exato: false },
    { href: `${base}/faixas`, rotulo: "Melhores horários", exato: false },
    { href: `${base}/operacoes`, rotulo: "Operações", exato: false },
    // Relatórios é aba rara: busca no clique em vez de pré-carregar em toda visita (18/09/2026)
    { href: `${base}/relatorios`, rotulo: "Relatórios", exato: false, prefetch: false },
  ];

  return (
    <div className="sticky top-(--altura-cabecalho) z-30 mt-4 border-b bg-background">
      <nav aria-label="Seções do robô" className="conteudo">
        <div
          ref={faixaRef}
          onFocus={(e) => (e.target as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" })}
          className="borda-esmaece -mx-1 flex items-center gap-5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {abas.map((a) => {
            const ativo = a.exato ? pathname === a.href : pathname.startsWith(a.href);
            return (
              <Link
                key={a.href}
                href={a.href}
                prefetch={a.prefetch}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "-mb-px flex h-10 shrink-0 items-center border-b-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:text-foreground focus-visible:underline",
                  ativo
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {a.rotulo}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
