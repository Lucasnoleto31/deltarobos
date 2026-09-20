"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { classeItemColuna } from "./LinksNav";

export interface RoboDaAba {
  slug: string;
  nome: string;
}

interface Props {
  robos: RoboDaAba[];
  /**
   * "faixa" (padrão): as pílulas do cabeçalho de cima, até MAXIMO e um "+N" para o resto.
   * "coluna": a barra lateral a partir de xl (20/09/2026) — TODOS os robôs, um por linha, sem "+N".
   * Ali a altura é da tela inteira e cabe a lista toda; e o que o Artur cortou em 18/09/2026 foi ter
   * de abrir algo para ver os robôs, então na coluna eles ficam todos à vista.
   */
  orientacao?: "faixa" | "coluna";
}

// mais do que isto e o cabeçalho não fecha numa linha; o resto vai para a lista da home
const MAXIMO = 4;

/**
 * Os robôs na navegação. No cabeçalho de cima (até xl) são as abas de instrumento das plataformas de
 * trading que o Artur mandou (18/09/2026, no lugar do menu que ele achou ruim): cada robô é uma pílula,
 * a da página atual em branco; no celular a faixa desce para a linha de baixo e rola de lado, e com mais
 * de quatro robôs sobra um "+N" que leva à lista da home.
 * 19/09/2026: o foco do teclado traz a pílula para fora do esmaecido da faixa (o nav do Cabecalho).
 * 20/09/2026: na barra lateral viram linhas, com o fio da marca no atual (classeItemColuna).
 */
export function AbasRobos({ robos, orientacao = "faixa" }: Props) {
  const pathname = usePathname();
  if (robos.length === 0) return null;

  if (orientacao === "coluna") {
    return (
      <div role="group" aria-label="Robôs" className="flex flex-col gap-0.5">
        {robos.map((r) => {
          const atual = pathname.startsWith(`/robos/${r.slug}`);
          return (
            <Link
              key={r.slug}
              href={`/robos/${r.slug}`}
              aria-current={atual ? "page" : undefined}
              className={classeItemColuna(atual)}
            >
              {r.nome}
            </Link>
          );
        })}
      </div>
    );
  }

  const mostrados = robos.slice(0, MAXIMO);
  const sobra = robos.length - mostrados.length;

  return (
    <div
      aria-label="Robôs"
      onFocus={(e) => (e.target as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" })}
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-(--painel-fio) p-0.5"
    >
      {mostrados.map((r) => {
        const atual = pathname.startsWith(`/robos/${r.slug}`);
        return (
          <Link
            key={r.slug}
            href={`/robos/${r.slug}`}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "h-7 shrink-0 rounded-full px-3 text-sm leading-7 whitespace-nowrap transition-colors",
              atual ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:bg-(--linha-hover) hover:text-foreground",
            )}
          >
            {r.nome}
          </Link>
        );
      })}
      {sobra > 0 ? (
        <Link
          href="/#robos"
          className="h-7 shrink-0 rounded-full px-2.5 text-sm leading-7 text-muted-foreground tabular-nums transition-colors hover:bg-(--linha-hover) hover:text-foreground"
        >
          +{sobra}
        </Link>
      ) : null}
    </div>
  );
}
