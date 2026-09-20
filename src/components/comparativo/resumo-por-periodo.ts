// Os totais de cada robô por período do "Quem rendeu mais" (18/09/2026). Calculados no servidor:
// antes a página mandava a série diária inteira de cada robô (~870 KB, 85% do HTML) para o
// navegador somar 12 números. Sem "use client": só a página importa a função.

import { PERIODOS_FECHADOS, noPeriodo, type PeriodoFechado } from "@/components/robo/periodos-resumo";
import { valorDia } from "@/lib/stats/serie";
import type { LinhaDiaria } from "@/lib/stats/tipos";

export interface ResumoPeriodo {
  /** resultado líquido em R$, por 1 contrato */
  total: number;
  nOps: number;
  nDias: number;
}

export type ResumoPorPeriodo = Record<PeriodoFechado, ResumoPeriodo>;

/** Recorta a série em cada período fechado (semana, mês, ano, tudo) e soma resultado, operações e pregões. */
export function resumirPorPeriodo(linhas: readonly LinhaDiaria[], valorPonto: number, hoje: string): ResumoPorPeriodo {
  const opcoes = { base: "liquido" as const, unidade: "brl" as const, valorPonto };
  const resumo = {} as ResumoPorPeriodo;
  for (const p of PERIODOS_FECHADOS) {
    const recorte = noPeriodo(linhas, p, hoje);
    resumo[p] = {
      total: recorte.reduce((s, l) => s + valorDia(l, opcoes), 0),
      nOps: recorte.reduce((s, l) => s + l.n_operacoes, 0),
      nDias: recorte.length,
    };
  }
  return resumo;
}
