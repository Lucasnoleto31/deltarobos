// As contas da tela "Comparar robôs" (ficha Mesa, 25/11/2026): recortar o período, resumir cada robô nele,
// pôr as curvas no mesmo eixo de tempo e achar o melhor de cada coluna. Funções puras e sem "use client",
// para o teste e para o painel. Nada de conta nova: somar, acumular, maior queda e resumo dos dias são os
// de lib/stats/serie-casa, os mesmos da página inicial, para o "Em 12 meses" de um robô ser o mesmo número
// nas duas telas.
//
// 18/09/2026: os totais por período eram somados no servidor (resumirPorPeriodo) porque a série diária
// inteira de cada robô, com as onze colunas do banco, pesava 870 KB no HTML. Desde a ficha Mesa a tela
// desenha a curva de cada robô, então a série desce ao navegador, mas na forma compacta da página inicial
// (dia, valor, operações e ganhos), e o resumo de cada período sai dela aqui.

import { inicioDoPeriodo } from "@/components/robo/periodos-resumo";
import { somarDias, somarMeses } from "@/lib/stats/periodos";
import {
  acumular,
  maiorQueda,
  resumirDias,
  type DiaAcumulado,
  type DiaResultado,
  type MaiorQueda,
  type ResumoDosDias,
} from "@/lib/stats/serie-casa";

export type PeriodoComparativo = "12m" | "tudo" | "ano" | "mes" | "semana";

/**
 * Os períodos da tela. Os quatro que o "Quem rendeu mais" tinha (semana, mês, ano, tudo) e os 12 meses, que
 * são o padrão pelo mesmo motivo da página inicial: há robô com histórico de anos e robô de meses, e "desde
 * o início" compara tempos diferentes. `coluna` é o cabeçalho da coluna de resultado na tabela.
 */
export const PERIODOS_COMPARATIVO: ReadonlyArray<{ valor: PeriodoComparativo; rotulo: string; coluna: string }> = [
  { valor: "12m", rotulo: "12 meses", coluna: "Em 12 meses" },
  { valor: "tudo", rotulo: "Desde o início", coluna: "Desde o início" },
  { valor: "ano", rotulo: "Ano", coluna: "No ano" },
  { valor: "mes", rotulo: "Mês", coluna: "No mês" },
  { valor: "semana", rotulo: "Semana", coluna: "Na semana" },
];

/**
 * O primeiro dia que entra no período, ou nulo em "desde o início". Os 12 meses seguem a página inicial
 * (o dia de hoje de um ano atrás fica de fora); semana, mês e ano são os da visão geral do robô.
 */
export function inicioNoComparativo(periodo: PeriodoComparativo, hoje: string): string | null {
  if (periodo === "12m") return somarDias(somarMeses(hoje, -12), 1);
  return inicioDoPeriodo(periodo, hoje);
}

/** Os dias do período, até hoje. */
export function recortarPeriodo<T extends { dia: string }>(dias: readonly T[], periodo: PeriodoComparativo, hoje: string): T[] {
  const inicio = inicioNoComparativo(periodo, hoje);
  return dias.filter((d) => d.dia <= hoje && (inicio === null || d.dia >= inicio));
}

/** Um robô no período: o que a linha dele na tabela e a curva dele no gráfico precisam. */
export interface RoboNoPeriodo {
  slug: string;
  /** os pregões do robô no período, em ordem */
  dias: DiaResultado[];
  /** o acumulado do período, pregão a pregão, partindo de zero */
  curva: DiaAcumulado[];
  resumo: ResumoDosDias;
  queda: MaiorQueda | null;
  /** operações fechadas por pregão em que operou; nulo sem pregão */
  operacoesPorDia: number | null;
  /**
   * O primeiro pregão de todo o histórico do robô, quando ele não cobre o período inteiro (começou depois do
   * início do período, ou o período é "desde o início"). A tela escreve a data: comparar 12 meses de um robô
   * com 3 de outro sem dizer é enganar.
   */
  historicoDesde: string | null;
}

/** `serie.dias` é o histórico inteiro do robô, em ordem de dia (como vem de carregarCasa). */
export function resumirNoPeriodo(
  serie: { slug: string; dias: readonly DiaResultado[] },
  periodo: PeriodoComparativo,
  hoje: string,
): RoboNoPeriodo {
  const dias = recortarPeriodo(serie.dias, periodo, hoje);
  const curva = acumular(dias);
  const resumo = resumirDias(dias);
  const inicio = inicioNoComparativo(periodo, hoje);
  const primeiro = serie.dias.length > 0 ? serie.dias[0].dia : null;
  return {
    slug: serie.slug,
    dias,
    curva,
    resumo,
    queda: maiorQueda(curva),
    operacoesPorDia: resumo.pregoes > 0 ? resumo.operacoes / resumo.pregoes : null,
    historicoDesde: primeiro !== null && (inicio === null || primeiro > inicio) ? primeiro : null,
  };
}

/** O eixo de tempo do gráfico: todo pregão em que algum robô operou no período, em ordem. */
export function eixoComum(robos: ReadonlyArray<{ dias: ReadonlyArray<{ dia: string }> }>): string[] {
  const dias = new Set<string>();
  for (const r of robos) for (const d of r.dias) dias.add(d.dia);
  return [...dias].sort();
}

/** A curva de um robô no eixo comum. */
export interface CurvaNoEixo {
  /** o acumulado em cada pregão do eixo; nulo antes do primeiro pregão do robô no período */
  acumulado: Array<number | null>;
  /** o resultado do robô em cada pregão do eixo; nulo no dia em que ele não operou */
  noDia: Array<number | null>;
  /** a maior queda, com o pico e o fundo nos índices do eixo (pico na partida = o primeiro pregão do robô) */
  queda: MaiorQueda | null;
}

/**
 * Põe a curva de um robô no eixo comum: no dia em que ele não operou o acumulado fica onde estava (a linha
 * segue reta), e antes do primeiro pregão dele não há linha. É o que deixa as curvas comparáveis: um robô
 * que começou no meio do período começa no meio do gráfico. O eixo precisa conter todos os dias da curva.
 */
export function curvaNoEixo(eixo: readonly string[], curva: readonly DiaAcumulado[], queda: MaiorQueda | null): CurvaNoEixo {
  const acumulado: Array<number | null> = [];
  const noDia: Array<number | null> = [];
  const posicao: number[] = [];
  let j = 0;
  eixo.forEach((dia, i) => {
    if (j < curva.length && curva[j].dia === dia) {
      acumulado.push(curva[j].acumulado);
      noDia.push(curva[j].valor);
      posicao.push(i);
      j += 1;
    } else {
      acumulado.push(j > 0 ? curva[j - 1].acumulado : null);
      noDia.push(null);
    }
  });
  const noEixo =
    queda && posicao[queda.iFundo] !== undefined
      ? { iInicio: posicao[Math.max(0, queda.iInicio)], iFundo: posicao[queda.iFundo], valor: queda.valor }
      : null;
  return { acumulado, noDia, queda: noEixo };
}

/**
 * O índice do melhor valor de uma coluna da tabela, ou nulo quando não há o que destacar: menos de dois
 * robôs com valor, ou todos iguais. `ganha` diz se o melhor é o maior (resultado, acertos) ou o menor
 * (maior queda). No empate entre os melhores vale o primeiro.
 */
export function indiceDoMelhor(valores: ReadonlyArray<number | null | undefined>, ganha: "maior" | "menor" = "maior"): number | null {
  let melhor: number | null = null;
  let valorDoMelhor = 0;
  let comValor = 0;
  let todosIguais = true;
  for (let i = 0; i < valores.length; i += 1) {
    const v = valores[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    comValor += 1;
    if (melhor === null) {
      melhor = i;
      valorDoMelhor = v;
      continue;
    }
    if (v !== valorDoMelhor) todosIguais = false;
    if (ganha === "menor" ? v < valorDoMelhor : v > valorDoMelhor) {
      melhor = i;
      valorDoMelhor = v;
    }
  }
  return comValor >= 2 && !todosIguais ? melhor : null;
}
