import { cn } from "cn";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarNumero, formatarPct } from "@/lib/formato";
import type { FaixaSimbolo } from "@/lib/stats/operacoes";
import type { Unidade } from "@/lib/stats/tipos";

interface Props {
  faixas: FaixaSimbolo[];
  unidade: Unidade;
  limite?: number;
}

/**
 * Resultado por série do contrato (WINQ26, WINV26...), com barra proporcional. A numeração 01–06 da
 * frente saiu (19/09/2026): a ordem da lista e o tamanho das barras já dizem a posição.
 */
export function PorSimbolo({ faixas, unidade, limite = 6 }: Props) {
  const lista = faixas.slice(0, limite);
  if (lista.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>;
  }
  const maior = Math.max(...lista.map((f) => Math.abs(f.total)), 1);

  return (
    <ol className="space-y-3">
      {lista.map((f) => {
        const largura = Math.max(4, Math.round((Math.abs(f.total) / maior) * 100));
        const positivo = f.total >= 0;
        return (
          <li key={f.simbolo} className="text-sm">
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">
                  {f.simbolo}
                  <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                    {formatarNumero(f.n)} op. · {formatarPct(f.n > 0 ? f.nGain / f.n : 0, 0)} acerto
                  </span>
                </span>
                <Valor valor={f.total} unidade={unidade} className="font-semibold" inteiro={Math.abs(f.total) >= 1000} />
              </div>
              <div className="mt-1 h-1 w-full rounded-full bg-muted">
                <div
                  className={cn("h-1 rounded-full", positivo ? "bg-positivo" : "bg-negativo")}
                  style={{ width: `${largura}%` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
