"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface RoboDaAba {
  slug: string;
  nome: string;
}

interface Props {
  robos: RoboDaAba[];
}

// mais do que isto e o cabeçalho não fecha numa linha; o resto vai para a lista da home
const MAXIMO = 4;

/**
 * Os robôs no cabeçalho, como as abas de instrumento das plataformas de trading que o Artur mandou
 * (18/09/2026, no lugar do menu que ele achou ruim): cada robô é uma pílula, a da página atual em
 * branco. No computador fica entre o logo e os outros links; no celular desce para a linha de baixo e
 * rola de lado. Com mais de quatro robôs, sobra um "+N" que leva à lista da home.
 */
export function AbasRobos({ robos }: Props) {
  const pathname = usePathname();
  if (robos.length === 0) return null;
  const mostrados = robos.slice(0, MAXIMO);
  const sobra = robos.length - mostrados.length;

  return (
    <div aria-label="Robôs" className="flex shrink-0 items-center gap-0.5 rounded-full border border-(--painel-fio) p-0.5">
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
