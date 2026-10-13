"use client";

import { cn } from "cn";

interface Props<T extends string> {
  opcoes: ReadonlyArray<{ valor: T; rotulo: string }>;
  valor: T;
  onChange: (valor: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * Controle segmentado simples (radiogroup) pra filtros e toggles.
 * 19/09/2026: quando não cabe, rola com a ponta esmaecendo, como as abas. O fio fica no div de fora e a
 * rolagem no de dentro, para a máscara não apagar o fio; o -m-0.5/p-0.5 de dentro dá espaço ao anel de
 * foco, e o foco do teclado traz o botão para fora do esmaecido.
 * 13/10/2026 (mídia kit da Zeve): o item ativo no acento, branco sobre o azul (5,4:1 nos dois temas; antes era
 * a cor do texto invertida). O foco é um anel de 2 px por dentro do botão (a rolagem cortaria um anel de fora):
 * no acento sobre o item solto, branco sobre o item ativo, que é azul.
 */
export function Segmentado<T extends string>({ opcoes, valor, onChange, ariaLabel, className }: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex h-8 max-w-full items-center rounded-full border border-(--painel-fio) p-0.5 text-xs", className)}
    >
      <div
        onFocus={(e) => (e.target as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" })}
        className="borda-esmaece -m-0.5 flex min-w-0 items-center gap-0.5 overflow-x-auto p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {opcoes.map((o) => {
          const ativo = o.valor === valor;
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => onChange(o.valor)}
              className={cn(
                "h-[26px] shrink-0 rounded-full px-3 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset",
                ativo
                  ? "bg-primary text-primary-foreground focus-visible:ring-primary-foreground"
                  : "text-muted-foreground hover:bg-(--linha-hover) hover:text-foreground focus-visible:ring-ring",
              )}
            >
              {o.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
