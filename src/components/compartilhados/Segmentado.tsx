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
 * Seletor em texto (radiogroup) para período, agrupamento e filtros: as opções lado a lado e um fio debaixo
 * da escolhida (ficha Mesa, 25/11/2026). Era uma caixa com as opções em pílula.
 * 19/09/2026: quando não cabe, rola com a ponta esmaecendo, como as abas. O fio fica no div de fora e a
 * rolagem no de dentro, para a máscara não apagar o fio; o -m-0.5/p-0.5 de dentro dá espaço ao anel de
 * foco, e o foco do teclado traz o botão para fora do esmaecido.
 */
export function Segmentado<T extends string>({ opcoes, valor, onChange, ariaLabel, className }: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      // o -my-2 devolve ao layout a altura que o alvo de toque dos botões (py-2) acrescenta
      className={cn("-my-2 inline-flex max-w-full items-center text-[0.8125rem]", className)}
    >
      <div
        onFocus={(e) => (e.target as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" })}
        className="borda-esmaece -m-1 flex min-w-0 items-center gap-5 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                // o botão tem uns 36 px de altura para o dedo (25/11/2026); o fio da opção escolhida é um
                // after colado no texto, para o alvo crescer sem o fio descer junto
                "relative shrink-0 py-2 whitespace-nowrap transition-colors outline-none after:absolute after:inset-x-0 after:bottom-1 after:h-px focus-visible:ring-2 focus-visible:ring-ring/50",
                ativo ? "text-foreground after:bg-foreground" : "text-sutil hover:text-muted-foreground",
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
