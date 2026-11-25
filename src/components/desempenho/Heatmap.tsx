import { Valor } from "@/components/compartilhados/Valor";
import { escalaDeForca } from "@/components/graficos/base";
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

/**
 * A cor da célula: verde ou vermelho chapado, mais forte quanto maior o resultado do mês. Vai de 14% a 54%
 * da cor sobre o fundo. O teto era 64%; com o verde da ficha Mesa (25/11/2026) o texto claro sobre a célula
 * mais forte dava 4,1:1 no tema escuro, e em 54% dá 5,2:1 (o vermelho e o tema claro ficam acima de 6:1).
 */
function fundo(total: number, forca: number): string {
  const pct = 14 + Math.round(forca * 40);
  const cor = total >= 0 ? "var(--positivo)" : "var(--negativo)";
  return `color-mix(in oklch, ${cor} ${pct}%, transparent)`;
}

/**
 * Mapa dos meses: um ano por linha, um mês por coluna e o total do ano no fim. Desde a ficha Mesa
 * (25/11/2026) não tem caixa nem canto arredondado: as células são retângulos chapados de verde ou vermelho,
 * como as barras, e o mês sem operação fica vazio em vez de cinza. Os números alinham à direita, como em
 * toda tabela do site, e o cabeçalho é texto cinza sem negrito.
 *
 * A força da cor usa a régua do calendário (escalaDeForca: o teto é o 9º décimo, não o maior mês): com o
 * maior mês como régua, um mês fora da curva deixava todos os outros no tom mais fraco.
 *
 * 19/09/2026: no estreito cada ano vira uma grade de 4 × 3, porque na tabela de 12 colunas o valor não cabia
 * na célula e a borda da rolagem cortava "+15.513" no meio. Desde 25/11/2026 quem decide é a largura do
 * próprio bloco, não a da janela (era 768 px de janela): com a barra lateral do sistema, ou com o mapa ao
 * lado de outra seção, a janela larga não quer dizer que as 12 colunas cabem. A tabela entra a partir de
 * 56 rem de bloco; abaixo disso a grade tem 4 colunas, ou 6 quando o bloco passa de 32 rem.
 *
 * Só leitura: o clique no mês saiu com o mapa do Desempenho, o último que o usava (19/09/2026).
 */
export function Heatmap({ linhas, unidade }: Props) {
  if (linhas.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">Sem meses com operação.</p>;
  }
  const forca = escalaDeForca(linhas.flatMap((l) => l.meses.map((m) => m?.total ?? 0)));

  return (
    <div className="@container">
      <div className="@4xl:hidden">
        {linhas.map((l) => (
          <div key={l.ano} className="border-b border-(--painel-fio) py-3 first:pt-0">
            <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{l.ano}</span>
              <Valor valor={l.total} unidade={unidade} inteiro className="font-medium" />
            </div>
            <ul className="grid grid-cols-4 gap-0.5 @lg:grid-cols-6">
              {l.meses.map((m, i) => {
                if (!m) {
                  return (
                    <li key={i} className="flex h-11 flex-col justify-center px-1.5 text-xs text-sutil" aria-label={`${MESES[i]}/${l.ano}: sem operação`}>
                      {MESES[i]}
                    </li>
                  );
                }
                return (
                  <li
                    key={i}
                    className="flex h-11 flex-col justify-center rounded-[2px] px-1.5 leading-tight text-foreground"
                    style={{ backgroundColor: fundo(m.total, forca(m.total)) }}
                  >
                    <span className="text-xs">{MESES[i]}</span>
                    <span className="text-[0.8125rem] font-medium whitespace-nowrap">{curto(m.total, unidade)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto @4xl:block">
        <table className="w-full border-separate border-spacing-0.5 text-[0.8125rem]">
          <thead>
            <tr className="text-sutil">
              <th scope="col" className="w-14 pb-1 text-left font-normal">
                Ano
              </th>
              {MESES.map((m) => (
                <th key={m} scope="col" className="px-1.5 pb-1 text-right font-normal">
                  {m}
                </th>
              ))}
              <th scope="col" className="w-28 pb-1 pl-4 text-right font-normal">
                No ano
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.ano}>
                <th scope="row" className="text-left font-medium">
                  {l.ano}
                </th>
                {l.meses.map((m, i) => {
                  if (!m) {
                    return <td key={i} className="h-9" aria-label={`${MESES[i]}/${l.ano}: sem operação`} />;
                  }
                  return (
                    <td
                      key={i}
                      // texto na cor do texto em cima da cor: verde sobre verde forte não se lia (18/09/2026)
                      className="h-9 rounded-[2px] px-1.5 text-right font-medium whitespace-nowrap text-foreground"
                      style={{ backgroundColor: fundo(m.total, forca(m.total)) }}
                      title={`${MESES[i]}/${l.ano}: ${formatarNumero(m.nDias)} ${m.nDias === 1 ? "dia de pregão" : "dias de pregão"}`}
                    >
                      {curto(m.total, unidade)}
                    </td>
                  );
                })}
                <td className="pl-4 text-right font-medium">
                  <Valor valor={l.total} unidade={unidade} inteiro />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
