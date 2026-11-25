import { formatarData } from "@/lib/formato";
import { acumular, maiorQueda } from "@/lib/stats/serie-casa";
import type { LinhaDiaria } from "@/lib/stats/tipos";
import type { FiltrosUrl } from "./params";

/** O que o resumo lê de cada pregão da série diária (estatisticas_publico). */
export type DiaDoResumo = Pick<
  LinhaDiaria,
  "dia" | "n_operacoes" | "resultado_brl_por_contrato" | "custos_brl_por_contrato" | "maior_loss_brl_por_contrato"
>;

export interface ResumoDoFiltro {
  /** quantas operações a série diária conta no filtro; a página só mostra a soma quando bate com a lista */
  operacoes: number;
  /** o resultado somado, em R$ para 1 contrato, com os custos de cada operação já descontados */
  soma: number;
  /** a operação que mais perdeu (valor negativo); nulo se nenhuma perdeu */
  pior: number | null;
  /**
   * A maior queda do período do filtro: do ponto mais alto ao mais baixo que veio depois, somando dia a dia
   * e partindo de zero (positivo; 0 = não recuou). A mesma conta das outras telas (maiorQueda, serie-casa):
   * sem filtro, é a maior queda do robô.
   */
  maiorQueda: number;
}

/**
 * O resultado somado das operações do filtro, para a linha de título da aba Operações (ficha Mesa,
 * 25/11/2026). A lista vem paginada (50 por vez), então a soma não sai dela: sai da série diária, que o
 * banco grava com a mesma regra da lista (migration 0025): por pregão, o resultado, os custos, quantas
 * operações ganharam e perderam e a soma de cada grupo, sempre pelo resultado já descontado do custo.
 *
 * Só cobre o filtro de período. Devolve nulo, e a tela mostra só a contagem, em dois casos:
 * - filtro de compra ou venda: a série diária não separa os lados, e a tela não arrisca número aproximado;
 * - filtro de ganho ou perda (desde a revisão de 25/11/2026): a soma só das operações que ganharam é um
 *   número de ganho sem a queda ao lado, que o leigo lê como o que o robô rendeu. Resultado é a soma de tudo.
 *
 * A soma vem sempre com a maior queda do mesmo período (DESIGN.md, seção 9: número de ganho nunca aparece
 * sem a maior queda ao lado).
 */
export function resumirFiltro(dias: ReadonlyArray<DiaDoResumo>, f: FiltrosUrl): ResumoDoFiltro | null {
  if (f.lado || f.resultado) return null;
  let operacoes = 0;
  let pior: number | null = null;
  const doPeriodo: { dia: string; valor: number }[] = [];
  for (const d of dias) {
    if (f.de && d.dia < f.de) continue;
    if (f.ate && d.dia > f.ate) continue;
    operacoes += d.n_operacoes;
    doPeriodo.push({ dia: d.dia, valor: d.resultado_brl_por_contrato - d.custos_brl_por_contrato });
    if (d.maior_loss_brl_por_contrato < 0 && (pior === null || d.maior_loss_brl_por_contrato < pior)) pior = d.maior_loss_brl_por_contrato;
  }
  // a queda se mede em ordem de data, venha a série como vier
  doPeriodo.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  const curva = acumular(doPeriodo);
  return {
    operacoes,
    soma: curva.length > 0 ? curva[curva.length - 1].acumulado : 0,
    pior,
    maiorQueda: maiorQueda(curva)?.valor ?? 0,
  };
}

/**
 * O filtro em palavras, para vir depois de "N operações": "de compra com perda, de 01/10/2026 a
 * 31/10/2026". Sem filtro devolve texto vazio.
 */
export function descreverFiltro(f: FiltrosUrl): string {
  const quais = [f.lado ? `de ${f.lado}` : "", f.resultado === "gain" ? "com ganho" : f.resultado === "loss" ? "com perda" : ""]
    .filter(Boolean)
    .join(" ");
  const quando =
    f.de && f.ate
      ? f.de === f.ate
        ? `em ${formatarData(f.de)}`
        : `de ${formatarData(f.de)} a ${formatarData(f.ate)}`
      : f.de
        ? `desde ${formatarData(f.de)}`
        : f.ate
          ? `até ${formatarData(f.ate)}`
          : "";
  return quais && quando ? `${quais}, ${quando}` : quais || quando;
}
