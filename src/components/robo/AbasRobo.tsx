"use client";

import { cn } from "cn";
import { Radio } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

interface Props {
  slug: string;
}

/**
 * Abas da página do robô em pílulas (18/09/2026): a ativa em branco, as outras apagadas, o ao vivo à direita.
 * 19/09/2026: só as abas rolam, com a ponta esmaecendo; o "Ao vivo" fica fora da rolagem, sempre à
 * vista (no celular ele era cortado e o que aparecia na ponta era um "R" solto). O -m-1/p-1 da faixa
 * dá espaço ao anel de foco, que a rolagem cortaria.
 * No celular a faixa abre com a aba atual no meio (antes Risco ou Relatórios abriam fora da vista) e o
 * foco do teclado traz a aba para fora do esmaecido. Mexe só na rolagem da faixa, não na da página.
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
    { href: `${base}/calendario`, rotulo: "Calendário", exato: false },
    { href: `${base}/risco`, rotulo: "Risco", exato: false },
    { href: `${base}/faixas`, rotulo: "Faixas", exato: false },
    { href: `${base}/operacoes`, rotulo: "Operações", exato: false },
    // Relatórios é aba rara: busca no clique em vez de pré-carregar em toda visita (18/09/2026)
    { href: `${base}/relatorios`, rotulo: "Relatórios", exato: false, prefetch: false },
  ];

  return (
    <nav aria-label="Seções do robô" className="painel flex items-center gap-1 rounded-full p-1">
      <div
        ref={faixaRef}
        onFocus={(e) => (e.target as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" })}
        className="borda-esmaece -m-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                "h-8 shrink-0 rounded-full px-3.5 text-sm leading-8 whitespace-nowrap transition-colors",
                ativo
                  ? "bg-foreground font-medium text-background"
                  : "text-muted-foreground hover:bg-(--linha-hover) hover:text-foreground",
              )}
            >
              {a.rotulo}
            </Link>
          );
        })}
      </div>
      {/* a tela cheia do dia também é rara: sem prefetch */}
      <Link
        href={`${base}/ao-vivo`}
        prefetch={false}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-(--painel-fio-forte) px-3.5 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-(--linha-hover)"
      >
        <Radio className="size-4" /> Ao vivo
      </Link>
    </nav>
  );
}
