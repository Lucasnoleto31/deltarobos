"use client";

import { cn } from "cn";
import { Radio } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  slug: string;
}

/** Abas da página do robô: visão geral, desempenho, operações e atalho pro ao vivo. */
export function AbasRobo({ slug }: Props) {
  const pathname = usePathname();
  const base = `/robos/${slug}`;
  const abas = [
    { href: base, rotulo: "Visão geral", exato: true },
    { href: `${base}/desempenho`, rotulo: "Desempenho", exato: false },
    { href: `${base}/operacoes`, rotulo: "Operações", exato: false },
  ];

  return (
    <nav aria-label="Seções do robô" className="flex items-center gap-1 overflow-x-auto border-b [scrollbar-width:none]">
      {abas.map((a) => {
        const ativo = a.exato ? pathname === a.href : pathname.startsWith(a.href);
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              ativo
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.rotulo}
          </Link>
        );
      })}
      <Link
        href={`${base}/ao-vivo`}
        className="ml-auto inline-flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
      >
        <Radio className="size-4" /> Ao vivo
      </Link>
    </nav>
  );
}
