import { Valor } from "@/components/compartilhados/Valor";
import { formatarDataCurta, formatarDuracao, formatarHora, formatarMfeMae, formatarPreco, rotuloLado } from "@/lib/formato";
import { excursaoDaOperacao } from "@/lib/stats/exposicao";
import type { OperacaoPublica } from "@/lib/tipos";

type Operacao = Pick<
  OperacaoPublica,
  | "fechamento_em"
  | "duracao_seg"
  | "lado"
  | "preco_entrada"
  | "preco_saida"
  | "pontos_por_contrato"
  | "resultado_brl_por_contrato"
  | "custos_brl_por_contrato"
  | "dia_pregao"
  | "origem"
  // MFE/MAE do EA 1.1.0 (22/09/2026), opcionais na view
  | "mfe_pontos_por_contrato"
  | "mae_pontos_por_contrato"
  | "excursao_parcial"
>;

interface Props {
  operacao: Operacao;
  /** mostra o dia antes da hora (lista de vários dias) */
  comData?: boolean;
}

/**
 * Uma operação em duas linhas (17/09/2026): em cima, a hora, o lado e o resultado em R$, que é o que se
 * procura; embaixo, em cinza, de onde saiu o número: entrada, saída e duração. Fica dentro de um <ul>; o que
 * separa uma da outra é o fio (ficha Mesa, 25/11/2026: sem caixa e sem recuo lateral). O lado é neutro desde
 * 19/09/2026: verde e vermelho ficam só no resultado. A operação medida pelo EA 1.1.0 ganha uma terceira
 * linha com o melhor e o pior momento dela (só quando há medição: a não medida não fica mais alta).
 */
export function LinhaOperacao({ operacao: o, comData = false }: Props) {
  const liquido = o.resultado_brl_por_contrato - o.custos_brl_por_contrato;
  const temPrecos = o.preco_entrada !== null && o.preco_saida !== null;
  const excursao = excursaoDaOperacao(o);
  return (
    <li className="flex items-center justify-between gap-3 border-b border-(--painel-fio) py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="flex items-baseline gap-2 text-sm">
          <span className="font-medium">
            {comData ? `${formatarDataCurta(o.dia_pregao)} · ` : ""}
            {formatarHora(o.fechamento_em)}
          </span>
          <span className="text-muted-foreground">{rotuloLado(o.lado)}</span>
        </p>
        <p className="truncate text-[0.8125rem] text-sutil">
          {temPrecos ? `${formatarPreco(o.preco_entrada)} → ${formatarPreco(o.preco_saida)}` : "histórico importado"}
          {o.origem !== "manual" ? ` · ${formatarDuracao(o.duracao_seg)}` : ""}
        </p>
        {excursao ? (
          <p className="truncate text-[0.8125rem] text-sutil" title="O máximo que o preço andou a favor e contra durante a operação, em pontos, com 1 contrato">
            melhor e pior momento {formatarMfeMae(excursao.mfe, excursao.mae)}
            {excursao.parcial ? " · parcial" : ""}
          </p>
        ) : null}
      </div>
      <p className="shrink-0 text-right text-sm font-medium">
        <Valor valor={liquido} />
      </p>
    </li>
  );
}
