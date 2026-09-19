import { Valor } from "@/components/compartilhados/Valor";
import { formatarNumero, formatarPontos } from "@/lib/formato";
import type { LinhaHeatmap } from "@/lib/stats/calendario";
import type { Unidade } from "@/lib/stats/tipos";

interface Props {
  linhas: LinhaHeatmap[];
  unidade: Unidade;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** O valor dentro da célula, sem "R$". 19/09/2026: tirar o "R$" do texto em reais deixava "+ 5.728". */
function curto(v: number, unidade: Unidade): string {
  if (unidade === "pontos") return formatarPontos(v, true);
  return formatarNumero(v, 0, true);
}

/** A cor da célula: intensidade proporcional ao resultado do mês. */
function fundo(total: number, maior: number): string {
  const pct = 14 + Math.round((Math.abs(total) / maior) * 50);
  const cor = total >= 0 ? "var(--positivo)" : "var(--negativo)";
  return `color-mix(in oklch, ${cor} ${pct}%, transparent)`;
}

/**
 * Heatmap ano x mês: intensidade da cor proporcional ao resultado do mês. 19/09/2026: abaixo de 768 px
 * cada ano vira uma grade de 4 × 3, porque na tabela de 12 colunas o valor não cabia na célula e a borda
 * da rolagem cortava "+15.513" no meio. Só leitura: o clique no mês saiu com o mapa do Desempenho, o
 * último que o usava (19/09/2026).
 */
export function Heatmap({ linhas, unidade }: Props) {
  if (linhas.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sem meses com operação.</p>;
  }
  const maior = Math.max(1, ...linhas.flatMap((l) => l.meses.map((m) => Math.abs(m?.total ?? 0))));

  return (
    <>
      <div className="space-y-4 md:hidden">
        {linhas.map((l) => (
          <div key={l.ano}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium tabular-nums">{l.ano}</span>
              <Valor valor={l.total} unidade={unidade} inteiro className="font-semibold" />
            </div>
            <ul className="grid grid-cols-4 gap-1">
              {l.meses.map((m, i) => {
                const rotulo = <span className="text-[11px]">{MESES[i]}</span>;
                if (!m) {
                  return (
                    <li key={i} className="flex h-12 flex-col items-center justify-center rounded-md bg-muted/40 text-muted-foreground" aria-label={`${MESES[i]}/${l.ano}: sem operação`}>
                      {rotulo}
                    </li>
                  );
                }
                return (
                  <li
                    key={i}
                    className="flex h-12 w-full flex-col items-center justify-center rounded-md text-foreground"
                    style={{ backgroundColor: fundo(m.total, maior) }}
                  >
                    {rotulo}
                    <span className="text-xs font-semibold tabular-nums">{curto(m.total, unidade)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
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
                  return (
                    <td
                      key={i}
                      // texto branco em cima da cor: verde sobre verde forte não se lia (18/09/2026)
                      className="h-10 rounded-md text-center font-medium whitespace-nowrap text-foreground tabular-nums"
                      style={{ backgroundColor: fundo(m.total, maior) }}
                      title={`${MESES[i]}/${l.ano}: ${formatarNumero(m.nDias)} dias`}
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
    </>
  );
}
