import { cn } from "cn";
import { Valor } from "@/components/compartilhados/Valor";
import type { FaixaSimbolo } from "@/lib/stats/operacoes";
import type { Unidade } from "@/lib/stats/tipos";

interface Props {
  faixas: FaixaSimbolo[];
  unidade: Unidade;
  limite?: number;
}

/** Resultado por série do contrato (WINQ26, WINV26...), com barra proporcional. */
export function PorSimbolo({ faixas, unidade, limite = 6 }: Props) {
  const lista = faixas.slice(0, limite);
  if (lista.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>;
  }
  const maior = Math.max(...lista.map((f) => Math.abs(f.total)), 1);

  return (
    <ol className="space-y-3">
      {lista.map((f, i) => {
        const largura = Math.max(4, Math.round((Math.abs(f.total) / maior) * 100));
        const positivo = f.total >= 0;
        return (
          <li key={f.simbolo} className="flex items-center gap-3 text-sm">
            <span className="w-6 text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">
                  {f.simbolo}
                  <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                    {f.n} op. · {f.n > 0 ? Math.round((f.nGain / f.n) * 100) : 0}% acerto
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
