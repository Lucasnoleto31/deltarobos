import { Valor } from "@/components/compartilhados/Valor";
import { formatarDataCurta, formatarDuracao, formatarHora, formatarPreco, rotuloLado } from "@/lib/formato";
import type { OperacaoPublica } from "@/lib/tipos";
import { LinhaOperacao } from "./LinhaOperacao";
import { VAZIO_DO_PERIODO } from "./periodos-resumo";

interface Props {
  operacoes: OperacaoPublica[];
}

/**
 * As últimas operações do robô, na visão geral (ficha Mesa, 25/11/2026): tabela sem caixa, com fio entre as
 * linhas e só as colunas que respondem "o que ele fez": quando, comprou ou vendeu, por quanto entrou e saiu,
 * quanto durou e o resultado. Pontos e símbolo ficam na aba Operações. No celular, duas linhas por operação.
 * O lado é neutro: cor só no resultado (19/09/2026).
 */
export function UltimasOperacoes({ operacoes }: Props) {
  if (operacoes.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{VAZIO_DO_PERIODO.tudo}</p>;
  }

  return (
    <>
      <ul className="sm:hidden">
        {operacoes.map((o) => (
          <LinhaOperacao key={o.id} operacao={o} comData />
        ))}
      </ul>

      <div className="tbl-moldura hidden sm:block">
        <table className="tbl">
          <thead>
            <tr>
              <th>Dia</th>
              <th>Saída às</th>
              <th>Lado</th>
              <th className="num">Entrada</th>
              <th className="num">Saída</th>
              <th className="num">Duração</th>
              <th className="num">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {operacoes.map((o) => (
              <tr key={o.id}>
                <td className="text-muted-foreground">{formatarDataCurta(o.dia_pregao)}</td>
                <td>{formatarHora(o.fechamento_em)}</td>
                <td className="text-muted-foreground">{rotuloLado(o.lado)}</td>
                <td className="num text-muted-foreground">{formatarPreco(o.preco_entrada)}</td>
                <td className="num text-muted-foreground">{formatarPreco(o.preco_saida)}</td>
                <td className="num text-muted-foreground">{o.origem !== "manual" ? formatarDuracao(o.duracao_seg) : "–"}</td>
                <td className="num font-medium">
                  <Valor valor={o.resultado_brl_por_contrato - o.custos_brl_por_contrato} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
