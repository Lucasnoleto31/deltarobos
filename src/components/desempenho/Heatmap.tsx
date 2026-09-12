import { cn } from "cn";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarBRL, formatarPontos } from "@/lib/formato";
import type { LinhaHeatmap } from "@/lib/stats/calendario";
import type { Unidade } from "@/lib/stats/tipos";

interface Props {
  linhas: LinhaHeatmap[];
  unidade: Unidade;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function curto(v: number, unidade: Unidade): string {
  if (unidade === "pontos") return formatarPontos(v, true);
  return formatarBRL(v, { inteiro: true, sinal: true }).replace("R$", "").trim();
}

/** Heatmap ano x mês: intensidade da cor proporcional ao resultado do mês. */
export function Heatmap({ linhas, unidade }: Props) {
  if (linhas.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sem meses com operação.</p>;
  }
  const maior = Math.max(1, ...linhas.flatMap((l) => l.meses.map((m) => Math.abs(m?.total ?? 0))));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="w-12 text-left font-medium">Ano</th>
            {MESES.map((m) => (
              <th key={m} className="font-medium">
                {m}
              </th>
            ))}
            <th className="w-20 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.ano}>
              <th className="text-left font-medium tabular-nums">{l.ano}</th>
              {l.meses.map((m, i) => {
                if (!m) {
                  return <td key={i} className="h-10 rounded-md bg-muted/40" aria-label={`${MESES[i]}/${l.ano}: sem operação`} />;
                }
                const pct = 12 + Math.round((Math.abs(m.total) / maior) * 70);
                const cor = m.total >= 0 ? "var(--positivo)" : "var(--negativo)";
                return (
                  <td
                    key={i}
                    className={cn("h-10 rounded-md text-center font-medium tabular-nums", m.total >= 0 ? "text-positivo" : "text-negativo")}
                    style={{ backgroundColor: `color-mix(in oklch, ${cor} ${pct}%, transparent)` }}
                    title={`${MESES[i]}/${l.ano}: ${m.nDias} dias`}
                  >
                    {curto(m.total, unidade)}
                  </td>
                );
              })}
              <td className="text-right font-semibold">
                <Valor valor={l.total} unidade={unidade} inteiro />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
