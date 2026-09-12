"use client";

import { cn } from "cn";

interface Props<T extends string> {
  opcoes: ReadonlyArray<{ valor: T; rotulo: string }>;
  valor: T;
  onChange: (valor: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Controle segmentado simples (radiogroup) pra filtros e toggles. */
export function Segmentado<T extends string>({ opcoes, valor, onChange, ariaLabel, className }: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5 text-xs", className)}
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
              "h-7 rounded-md px-2.5 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              ativo
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
