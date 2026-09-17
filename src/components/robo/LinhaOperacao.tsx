import { Valor } from "@/components/compartilhados/Valor";
import { formatarDataCurta, formatarDuracao, formatarHora, formatarPreco, rotuloLado } from "@/lib/formato";
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
>;

interface Props {
  operacao: Operacao;
  /** mostra o dia antes da hora (lista de vários dias) */
  comData?: boolean;
}

/**
 * Uma operação em duas linhas, para o celular (17/09/2026). A tabela de seis colunas não cabe em
 * 390 px: entrada e saída grudavam ("185.455185.600") e "pts" quebrava de linha. Em cima, a hora, o
 * lado e o resultado em R$, que é o que se procura; embaixo, em cinza, de onde saiu o número:
 * entrada, saída, duração e pontos. Fica dentro de um <ul className="painel">.
 */
export function LinhaOperacao({ operacao: o, comData = false }: Props) {
  const liquido = o.resultado_brl_por_contrato - o.custos_brl_por_contrato;
  const temPrecos = o.preco_entrada !== null && o.preco_saida !== null;
  return (
    <li className="sep [--sep:16px] flex items-center justify-between gap-3 px-4 py-2.5 tabular-nums">
      <div className="min-w-0">
        <p className="flex items-baseline gap-2 text-sm">
          <span className="font-medium">
            {comData ? `${formatarDataCurta(o.dia_pregao)} · ` : ""}
            {formatarHora(o.fechamento_em)}
          </span>
          <span className={o.lado === "compra" ? "text-positivo" : "text-negativo"}>{rotuloLado(o.lado)}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {temPrecos ? `${formatarPreco(o.preco_entrada)} → ${formatarPreco(o.preco_saida)}` : "histórico importado"}
          {o.origem !== "manual" ? ` · ${formatarDuracao(o.duracao_seg)}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold">
          <Valor valor={liquido} />
        </p>
        <p className="text-xs text-muted-foreground">
          <Valor valor={o.pontos_por_contrato} unidade="pontos" colorir={false} />
        </p>
      </div>
    </li>
  );
}
