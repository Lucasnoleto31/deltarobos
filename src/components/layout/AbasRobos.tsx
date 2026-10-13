"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { corDoRobo } from "@/lib/cores-robo";

export interface RoboDaAba {
  slug: string;
  nome: string;
  /** robos.ordem: escolhe a cor do robô (src/lib/cores-robo.ts); nunca o slug nem o nome */
  ordem: number;
}

interface Props {
  robos: RoboDaAba[];
}

// mais do que isto e o cabeçalho não fecha numa linha; o resto vai para a lista da home
const MAXIMO = 4;

/**
 * Os robôs no cabeçalho, como as abas de instrumento das plataformas de trading que o Artur mandou
 * (18/09/2026, no lugar do menu que ele achou ruim): cada robô é uma pílula dentro de uma cápsula. No
 * computador fica entre o logo e os outros links; no celular desce para a linha de baixo e rola de lado.
 * Com mais de quatro robôs, sobra um "+N" que leva à lista da home.
 * 19/09/2026: o foco do teclado traz a pílula para fora do esmaecido da faixa (o nav do Cabecalho).
 * 13/10/2026 (mídia kit da Zeve): cada robô ganha o ponto na cor dele (pela ordem do banco), e a pílula da
 * página atual sai tintada no acento, a "pílula tintada sob a ativa" do kit (bloco 7), em vez de branca. O
 * texto da ativa fica na cor do texto: o azul sobre a tinta azul dava 4,2:1 no claro. O peso não muda na
 * ativa, para a faixa não pular de largura ao trocar de robô.
 */
export function AbasRobos({ robos }: Props) {
  const pathname = usePathname();
  if (robos.length === 0) return null;
  const mostrados = robos.slice(0, MAXIMO);
  const sobra = robos.length - mostrados.length;

  return (
    <div
      role="group"
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
            style={{ "--cor-robo": corDoRobo(r.ordem) } as React.CSSProperties}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 whitespace-nowrap transition-colors",
              atual
                ? "bg-primary/12 text-foreground dark:bg-primary/25"
                : "text-muted-foreground hover:bg-(--linha-hover) hover:text-foreground",
            )}
          >
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--cor-robo)" />
            {r.nome}
          </Link>
        );
      })}
      {sobra > 0 ? (
        <Link
          href="/#robos"
          aria-label={`Mais ${sobra} ${sobra === 1 ? "robô" : "robôs"}`}
          className="inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-muted-foreground tabular-nums transition-colors hover:bg-(--linha-hover) hover:text-foreground"
        >
          +{sobra}
        </Link>
      ) : null}
    </div>
  );
}
