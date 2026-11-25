import { formatarData } from "@/lib/formato";
import type { LinhaDiaria } from "@/lib/stats/tipos";
import type { FiltrosUrl } from "./params";

/** O que o resumo lê de cada pregão da série diária (estatisticas_publico). */
export type DiaDoResumo = Pick<
  LinhaDiaria,
  | "dia"
  | "n_operacoes"
  | "n_gain"
  | "n_loss"
  | "resultado_brl_por_contrato"
  | "custos_brl_por_contrato"
  | "soma_gain_brl_por_contrato"
  | "soma_loss_brl_por_contrato"
  | "maior_loss_brl_por_contrato"
>;

export interface ResumoDoFiltro {
  /** quantas operações a série diária conta no filtro; a página só mostra a soma quando bate com a lista */
  operacoes: number;
  /** o resultado somado, em R$ para 1 contrato, com os custos de cada operação já descontados */
  soma: number;
  /** a operação que mais perdeu (valor negativo); nulo se nenhuma perdeu ou se o filtro é só das que ganharam */
  pior: number | null;
}

/**
 * O resultado somado das operações do filtro, para a linha de título da aba Operações (ficha Mesa,
 * 25/11/2026). A lista vem paginada (50 por vez), então a soma não sai dela: sai da série diária, que o
 * banco grava com a mesma regra da lista (migration 0025): por pregão, o resultado, os custos, quantas
 * operações ganharam e perderam e a soma de cada grupo, sempre pelo resultado já descontado do custo.
 *
 * Cobre o período e o filtro de ganho ou perda. A série diária não separa compra de venda: com filtro de
 * lado devolve nulo, e a tela mostra só a contagem em vez de um número aproximado.
 */
export function resumirFiltro(dias: ReadonlyArray<DiaDoResumo>, f: FiltrosUrl): ResumoDoFiltro | null {
  if (f.lado) return null;
  let operacoes = 0;
  let soma = 0;
  let pior: number | null = null;
  for (const d of dias) {
    if (f.de && d.dia < f.de) continue;
    if (f.ate && d.dia > f.ate) continue;
    if (f.resultado === "gain") {
      operacoes += d.n_gain;
      soma += d.soma_gain_brl_por_contrato;
      continue;
    }
    if (f.resultado === "loss") {
      operacoes += d.n_loss;
      soma += d.soma_loss_brl_por_contrato;
    } else {
      operacoes += d.n_operacoes;
      soma += d.resultado_brl_por_contrato - d.custos_brl_por_contrato;
    }
    if (d.maior_loss_brl_por_contrato < 0 && (pior === null || d.maior_loss_brl_por_contrato < pior)) pior = d.maior_loss_brl_por_contrato;
  }
  return { operacoes, soma, pior };
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
