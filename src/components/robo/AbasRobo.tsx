"use client";

import { cn } from "cn";
import { Radio } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  slug: string;
}

/** Abas da página do robô em pílulas (18/09/2026): a ativa em branco, as outras apagadas, o ao vivo à direita. */
export function AbasRobo({ slug }: Props) {
  const pathname = usePathname();
  const base = `/robos/${slug}`;
  const abas = [
    { href: base, rotulo: "Visão geral", exato: true },
    { href: `${base}/desempenho`, rotulo: "Desempenho", exato: false },
    { href: `${base}/calendario`, rotulo: "Calendário", exato: false },
    { href: `${base}/risco`, rotulo: "Risco", exato: false },
    { href: `${base}/faixas`, rotulo: "Faixas", exato: false },
    { href: `${base}/operacoes`, rotulo: "Operações", exato: false },
    { href: `${base}/relatorios`, rotulo: "Relatórios", exato: false },
  ];

  return (
    <nav
      aria-label="Seções do robô"
      className="painel flex items-center gap-1 overflow-x-auto rounded-full p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {abas.map((a) => {
        const ativo = a.exato ? pathname === a.href : pathname.startsWith(a.href);
        return (
          <Link
            key={a.href}
            href={a.href}
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
      <Link
        href={`${base}/ao-vivo`}
        className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-(--painel-fio-forte) px-3.5 text-sm whitespace-nowrap text-foreground transition-colors hover:bg-(--linha-hover)"
      >
        <Radio className="size-4" /> Ao vivo
      </Link>
    </nav>
  );
}
