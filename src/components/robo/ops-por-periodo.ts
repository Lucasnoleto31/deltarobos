// Cálculo por operação feito no servidor, um por período (18/09/2026). Faixas e Risco mandavam
// as ~15 mil operações ao navegador só para recalcular a cada troca de Mês | Ano | Tudo; agora a
// página calcula os três e manda o resultado. Sem "use client": roda na página.

import { dia as diaOp, type OperacaoCompacta } from "@/lib/stats/operacoes";
import { dentroDoIntervalo } from "@/lib/stats/periodos";
import { inicioDoPeriodo, type PeriodoFechado } from "./periodos-resumo";

/** Os períodos das abas Faixas e Risco; "semana" fica de fora (pouca amostra para esses números). */
export type PeriodoPainel = Exclude<PeriodoFechado, "semana">;

export const PERIODOS_PAINEL: readonly PeriodoPainel[] = ["mes", "ano", "tudo"];

/**
 * `calcular` sobre as operações de cada período, até hoje (o mesmo recorte que o painel fazia).
 * Os períodos são encaixados (mês ⊂ ano ⊂ tudo): quando um cobre as mesmas operações do maior,
 * o cálculo não se repete e o resultado é o MESMO objeto, que o Flight do React manda uma vez só.
 */
export function calcularPorPeriodo<T>(ops: readonly OperacaoCompacta[], hoje: string, calcular: (ops: OperacaoCompacta[]) => T): Record<PeriodoPainel, T> {
  const r = {} as Record<PeriodoPainel, T>;
  let maior: { n: number; valor: T } | null = null;
  // do maior para o menor: subconjunto com o mesmo tamanho é o mesmo conjunto
  for (const p of [...PERIODOS_PAINEL].reverse()) {
    const intervalo = { de: inicioDoPeriodo(p, hoje), ate: hoje };
    const opsP = ops.filter((op) => dentroDoIntervalo(diaOp(op), intervalo));
    const valor: T = maior !== null && maior.n === opsP.length ? maior.valor : calcular(opsP);
    r[p] = valor;
    maior = { n: opsP.length, valor };
  }
  return r;
}
