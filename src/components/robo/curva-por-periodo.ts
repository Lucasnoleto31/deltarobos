// A série por operação de um período fechado (semana, mês, ano, tudo), montada no servidor com o MESMO
// recorte nos dois lugares que a pedem (22/09/2026): a visão geral, que manda no HTML a série leve
// (PONTOS_LEVE pontos, que pintam na hora), e a rota /api/robos/[slug]/curva/[periodo], que devolve a
// fiel (uma operação por ponto até PONTOS_FIEL) quando o visitante abre "Por operação". Sem "use client":
// roda na página e na rota.

import { PONTOS_FIEL, seriePorDia, seriePorOperacaoCompacta, type SerieCompacta } from "@/components/graficos/series-da-curva";
import { dia as diaDaOperacao, type OperacaoCompacta } from "@/lib/stats/operacoes";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import { inicioDoPeriodo, noPeriodo, type PeriodoFechado } from "./periodos-resumo";

/** As opções da curva da visão geral: R$ líquido por 1 contrato, ao valor do ponto do robô. */
export function opcoesDaCurva(valorPonto: number): OpcoesSerie {
  return { base: "liquido", unidade: "brl", valorPonto };
}

export interface RecorteDoPeriodo {
  /** as operações do período, até hoje, na ordem de fechamento */
  ops: OperacaoCompacta[];
  /** os dias de pregão do período (da série diária): a divisão do eixo, a mesma da curva por dia */
  dias: string[];
}

/** As operações e os dias de um período fechado, até hoje: o recorte que a página e a rota usam. */
export function recorteDoPeriodo(
  ops: readonly OperacaoCompacta[],
  linhas: readonly LinhaDiaria[],
  periodo: PeriodoFechado,
  hoje: string,
  opcoes: OpcoesSerie,
): RecorteDoPeriodo {
  const inicio = inicioDoPeriodo(periodo, hoje);
  const opsDoPeriodo = ops.filter((op) => diaDaOperacao(op) <= hoje && (inicio === null || diaDaOperacao(op) >= inicio));
  const dias = seriePorDia(noPeriodo(linhas, periodo, hoje), opcoes).dias;
  return { ops: opsDoPeriodo, dias };
}

/**
 * A série por operação compacta do período, em até `maxPontos` pontos. O padrão é a resolução fiel
 * (uma operação por ponto até PONTOS_FIEL, o que a rota devolve); a página passa PONTOS_LEVE.
 */
export function curvaDoPeriodo(
  ops: readonly OperacaoCompacta[],
  linhas: readonly LinhaDiaria[],
  periodo: PeriodoFechado,
  hoje: string,
  opcoes: OpcoesSerie,
  maxPontos: number = PONTOS_FIEL,
): SerieCompacta {
  const recorte = recorteDoPeriodo(ops, linhas, periodo, hoje, opcoes);
  return seriePorOperacaoCompacta(recorte.ops, opcoes, recorte.dias, { maxPontos });
}

/**
 * A série completa que a rota devolveu é da mesma foto do banco que a leve do HTML? A página é ISR de
 * 60 s e a rota tem cache próprio: se fechou operação ou abriu pregão desde que a página foi montada (ou
 * se virou o dia, o mês ou o ano entre uma e outra), a completa não casa com a leve, com o eixo por dia
 * nem com os números ao lado, e a curva fica na leve. Mesma foto = mesmo total de operações e o mesmo
 * último ponto (posição, acumulado e dia), que as duas resoluções têm iguais por construção. Também
 * confere a forma do JSON, que vem de fora.
 */
export function mesmoRecorte(leve: SerieCompacta, completa: unknown): completa is SerieCompacta {
  if (!completa || typeof completa !== "object") return false;
  const c = completa as Partial<SerieCompacta>;
  if (!Array.isArray(c.pontos) || !Array.isArray(c.dias) || typeof c.total !== "number") return false;
  if (c.total !== leve.total || c.pontos.length === 0 || leve.pontos.length === 0) return false;
  const fimLeve = leve.pontos[leve.pontos.length - 1];
  const fimCompleta = c.pontos[c.pontos.length - 1];
  return (
    Array.isArray(fimCompleta) &&
    fimCompleta[0] === fimLeve[0] &&
    fimCompleta[1] === fimLeve[1] &&
    c.dias[fimCompleta[5]] === leve.dias[fimLeve[5]]
  );
}
