"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

interface Props {
  slug: string;
  /** robô com coletor (robos.tem_coletor): só ele tem a aba Ao vivo */
  temColetor: boolean;
}

/**
 * As abas da página do robô (ficha Mesa, 25/11/2026): uma faixa de texto com um fio na cor do texto debaixo da
 * aba atual, de ponta a ponta da área de trabalho, que fica presa logo abaixo da fita de mercado ao rolar.
 * Eram pílulas dentro de um painel arredondado. Os nomes dizem o que a pessoa vai achar, não o jargão:
 * "Dia a dia" (calendário), "Quedas e risco", "Melhores horários" (faixas).
 *
 * Revisão de 25/11/2026 (DESIGN.md, seção 9), uma pergunta por aba: Resumo (vale a pena?), Ao vivo (o que ele
 * está fazendo agora?; só em robô com coletor), Dia a dia, Quedas e risco, Melhores horários e Operações.
 * Saíram Desempenho, que repetia o Resumo com filtros (o que servia foi para o Resumo), e Relatórios (os
 * arquivos de cada mês estão em Dia a dia). Os endereços antigos redirecionam (next.config.ts).
 *
 * No celular a faixa rola de lado, com a ponta esmaecendo, e abre com a aba atual no meio; o foco do
 * teclado traz a aba para fora do esmaecido. Mexe só na rolagem da faixa, não na da página.
 */
export function AbasRobo({ slug, temColetor }: Props) {
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
    { href: base, rotulo: "Resumo", exato: true },
    ...(temColetor ? [{ href: `${base}/hoje`, rotulo: "Ao vivo", exato: false }] : []),
    { href: `${base}/calendario`, rotulo: "Dia a dia", exato: false },
    { href: `${base}/risco`, rotulo: "Quedas e risco", exato: false },
    { href: `${base}/faixas`, rotulo: "Melhores horários", exato: false },
    { href: `${base}/operacoes`, rotulo: "Operações", exato: false },
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
