import { cn } from "cn";
import { Valor } from "@/components/compartilhados/Valor";
import { escalaDeForca } from "@/components/graficos/base";
import { formatarNumero, formatarPontos } from "@/lib/formato";
import type { CelulaHeatmap, LinhaHeatmap } from "@/lib/stats/calendario";
import type { Unidade } from "@/lib/stats/tipos";
import { FIO_TINTA, TEXTO_TINTA, fundoTinta, tomDoResultado } from "./tinta";

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

/**
 * A cor e o texto do mês (13/10/2026, mídia kit da Zeve): o fundo no verde ou no vermelho, mais forte quanto
 * maior o resultado, e o número na mesma cor um tom mais fundo (tinta.ts: passa de 4,5:1 nos dois temas; até
 * 12/10/2026 o número ia na cor do texto e o fundo chegava a 64%). A régua é a escalaDeForca, a mesma das casas
 * do calendário: um mês fora da curva não apaga os outros. Mês zerado fica no cinza.
 */
function estilo(m: CelulaHeatmap, forca: (v: number) => number): { classe: string; fundo?: string } {
  const tom = tomDoResultado(m.total);
  if (tom === null) return { classe: "bg-muted text-muted-foreground ring-(--painel-fio)" };
  return { classe: cn(TEXTO_TINTA[tom], FIO_TINTA[tom]), fundo: fundoTinta(tom, forca(m.total)) };
}

/**
 * Heatmap ano x mês: intensidade da cor proporcional ao resultado do mês. 19/09/2026: abaixo de 768 px
 * cada ano vira uma grade de 4 × 3, porque na tabela de 12 colunas o valor não cabia na célula e a borda
 * da rolagem cortava "+15.513" no meio. Só leitura: o clique no mês saiu com o mapa do Desempenho, o
 * último que o usava (19/09/2026). Hoje vive na aba Calendário. 13/10/2026: a tabela só a partir de 1024 px e
 * com as doze colunas da mesma largura (antes cada mês tinha a largura do próprio número e "ago" ficava espremido
 * entre "jul" e "set"); de 640 a 1023 px cada ano vira uma grade de 6 × 2.
 */
export function Heatmap({ linhas, unidade }: Props) {
  if (linhas.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sem meses com operação.</p>;
  }
  const forca = escalaDeForca(linhas.flatMap((l) => l.meses.map((m) => m?.total ?? 0)));

  return (
    <>
      <div className="space-y-5 lg:hidden">
        {linhas.map((l) => (
          <div key={l.ano}>
            <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold tabular-nums">{l.ano}</span>
              <Valor valor={l.total} unidade={unidade} inteiro className="font-semibold" />
            </div>
            <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {l.meses.map((m, i) => {
                if (!m) {
                  return (
                    <li key={i} className="flex h-12 flex-col items-center justify-center rounded-lg bg-muted/40 text-muted-foreground" aria-label={`${MESES[i]}/${l.ano}: sem operação`}>
                      <span className="text-[11px]">{MESES[i]}</span>
                    </li>
                  );
                }
                const { classe, fundo } = estilo(m, forca);
                return (
                  <li
                    key={i}
                    className={cn("flex h-12 w-full flex-col items-center justify-center rounded-lg ring-1 ring-inset", classe)}
                    style={{ backgroundColor: fundo }}
                  >
                    {/* o mês na cor do texto a 85%: quem leva a cor é o número */}
                    <span className="text-[11px] text-foreground/85">{MESES[i]}</span>
                    <span className="text-xs font-semibold tabular-nums">{curto(m.total, unidade)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-1 text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="w-12 text-left font-medium">Ano</th>
              {MESES.map((m) => (
                <th key={m} className="font-medium">
                  {m}
                </th>
              ))}
              <th className="w-24 pr-1 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.ano}>
                <th className="text-left font-semibold tabular-nums">{l.ano}</th>
                {l.meses.map((m, i) => {
                  if (!m) {
                    return <td key={i} className="h-10 rounded-lg bg-muted/40" aria-label={`${MESES[i]}/${l.ano}: sem operação`} />;
                  }
                  const { classe, fundo } = estilo(m, forca);
                  return (
                    <td
                      key={i}
                      className={cn("h-10 rounded-lg text-center font-semibold whitespace-nowrap tabular-nums ring-1 ring-inset", classe)}
                      style={{ backgroundColor: fundo }}
                      title={`${MESES[i]}/${l.ano}: ${formatarNumero(m.nDias)} dias`}
                    >
                      {curto(m.total, unidade)}
                    </td>
                  );
                })}
                <td className="pr-1 text-right text-sm font-semibold">
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
