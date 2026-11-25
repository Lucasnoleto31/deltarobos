/**
 * As contas da aba Resumo do robô (25/11/2026, DESIGN.md seção 9): o resumo do período que fica ao lado do
 * número grande (maior queda e se já recuperou, ganho para cada R$ 1 da maior queda, meses e dias com ganho)
 * e o bloco "Como ele opera" (acertos com o necessário para empatar, ganho e perda típicos, a maior perda
 * numa operação, resultado médio por operação com o custo considerado, fator de lucro, operações por dia,
 * duração típica e pregões em que operou).
 *
 * Tudo em R$, com 1 contrato por entrada e já descontados os custos, a partir da série diária
 * (estatisticas_publico), que guarda o histórico inteiro; só a duração precisa das operações. Funções puras:
 * quem busca no banco é a página.
 */

import {
  acertoParaEmpatar,
  contarPregoes,
  quedaAtual,
  resultadoPorMes,
  resumirMeses,
  type DiaValor,
  type ResumoDosMeses,
} from "./indicadores-robo";
import { curvaAcumulada, drawdownMaximo } from "./serie";
import type { LinhaDiaria, OpcoesSerie } from "./tipos";

// Em R$ líquido o valor do ponto não entra na conta (valorDia só o usa em pontos): fica 1 para fechar o tipo.
const EM_REAIS: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: 1 };

// ---------------------------------------------------------------------------------------------------------
// Maior queda: já recuperou?
// ---------------------------------------------------------------------------------------------------------

/**
 * Como está a maior queda do período: nunca houve, já voltou ao ponto mais alto (em quantos dias corridos, e
 * quanto o resultado está abaixo do topo agora, por outra queda menor) ou ainda não voltou.
 */
export type SituacaoDaQueda =
  | { tipo: "sem-queda" }
  | { tipo: "recuperou"; dias: number; abaixoDoTopo: number }
  | { tipo: "nao-recuperou"; abaixoDoTopo: number };

export function situacaoDaQueda(queda: { valor: number; diasAteRecuperar: number | null }, abaixoDoTopo: number): SituacaoDaQueda {
  if (!(queda.valor > 0)) return { tipo: "sem-queda" };
  const abaixo = abaixoDoTopo > 0 ? abaixoDoTopo : 0;
  if (queda.diasAteRecuperar === null) return { tipo: "nao-recuperou", abaixoDoTopo: abaixo };
  return { tipo: "recuperou", dias: queda.diasAteRecuperar, abaixoDoTopo: abaixo };
}

/**
 * Quanto o robô ganhou para cada R$ 1 que já chegou a cair: resultado ÷ maior queda. Só existe quando os
 * dois são positivos: sem queda não há o que dividir, e com prejuízo a frase "ganhou para cada R$ 1" não vale.
 */
export function ganhoPorQueda(resultado: number, maiorQueda: number): number | null {
  if (!(resultado > 0) || !(maiorQueda > 0)) return null;
  return resultado / maiorQueda;
}

// ---------------------------------------------------------------------------------------------------------
// O resumo do período, ao lado do número grande
// ---------------------------------------------------------------------------------------------------------

export interface ResumoDoPeriodo {
  /** o resultado somado do período */
  resultado: number;
  /** pregões com operação */
  pregoes: number;
  primeiroDia: string | null;
  ultimoDia: string | null;
  /** a maior queda do período, do ponto mais alto ao mais baixo que veio depois (positivo; 0 = nunca recuou) */
  maiorQueda: number;
  situacao: SituacaoDaQueda;
  ganhoPorQueda: number | null;
  /** quantos meses, quantos com ganho, o pior e o melhor */
  meses: ResumoDosMeses;
  diasComGanho: number;
  /** o pregão de pior resultado, ou nulo sem pregão */
  piorDia: DiaValor | null;
}

/** O que a aba Resumo escreve ao lado do resultado: o risco do caminho e a consistência, no mesmo recorte. */
export function resumoDoPeriodo(linhas: readonly LinhaDiaria[]): ResumoDoPeriodo {
  const curva = curvaAcumulada(linhas, EM_REAIS);
  const dias: DiaValor[] = curva.map((p) => ({ dia: p.dia, valor: p.valor }));
  const resultado = curva.length > 0 ? curva[curva.length - 1].acumulado : 0;
  const queda = drawdownMaximo(curva);
  let diasComGanho = 0;
  let piorDia: DiaValor | null = null;
  for (const d of dias) {
    if (d.valor > 0) diasComGanho += 1;
    if (piorDia === null || d.valor < piorDia.valor) piorDia = d;
  }
  return {
    resultado,
    pregoes: dias.length,
    primeiroDia: dias.length > 0 ? dias[0].dia : null,
    ultimoDia: dias.length > 0 ? dias[dias.length - 1].dia : null,
    maiorQueda: queda.valor,
    situacao: situacaoDaQueda(queda, quedaAtual(dias).valor),
    ganhoPorQueda: ganhoPorQueda(resultado, queda.valor),
    meses: resumirMeses(resultadoPorMes(dias)),
    diasComGanho,
    piorDia,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Como ele opera
// ---------------------------------------------------------------------------------------------------------

export interface ComoOpera {
  operacoes: number;
  /** pregões com operação */
  pregoes: number;
  /** fração das operações que terminou com ganho (0 a 1), ou nulo sem operação */
  acertos: number | null;
  /** fração que precisa terminar com ganho só para empatar (0 a 1), ou nulo sem ganho ou sem perda para comparar */
  paraEmpatar: number | null;
  /** o tamanho médio de uma operação com ganho (R$, positivo), ou nulo sem nenhuma */
  ganhoTipico: number | null;
  /** o tamanho médio de uma operação com perda (R$, negativo), ou nulo sem nenhuma */
  perdaTipica: number | null;
  /** a maior perda numa operação só (R$, negativo) e o pregão em que foi, ou nulo sem perda */
  maiorPerda: DiaValor | null;
  /** resultado do histórico ÷ operações, já com o custo descontado; nulo sem operação */
  resultadoPorOperacao: number | null;
  /** o custo médio descontado de cada operação (R$, positivo ou zero); nulo sem operação */
  custoPorOperacao: number | null;
  /** soma dos ganhos ÷ soma das perdas: quanto ganhou para cada R$ 1 perdido; nulo sem perda */
  fatorLucro: number | null;
  /** operações por pregão em que operou; nulo sem pregão */
  operacoesPorDia: number | null;
}

/**
 * Como o robô opera, a partir da série diária: cada linha já traz, do dia, quantas operações terminaram com
 * ganho e com perda (pelo resultado já com custos), a soma de cada lado e a maior perda numa operação.
 */
export function comoOpera(linhas: readonly LinhaDiaria[]): ComoOpera {
  let operacoes = 0;
  let pregoes = 0;
  let nGanho = 0;
  let nPerda = 0;
  let somaGanho = 0;
  let somaPerda = 0;
  let resultado = 0;
  let custos = 0;
  let maiorPerda: DiaValor | null = null;
  for (const l of linhas) {
    if (l.n_operacoes > 0) pregoes += 1;
    operacoes += l.n_operacoes;
    nGanho += l.n_gain;
    nPerda += l.n_loss;
    somaGanho += l.soma_gain_brl_por_contrato;
    somaPerda += l.soma_loss_brl_por_contrato;
    resultado += l.resultado_brl_por_contrato - l.custos_brl_por_contrato;
    custos += l.custos_brl_por_contrato;
    if (l.maior_loss_brl_por_contrato < 0 && (maiorPerda === null || l.maior_loss_brl_por_contrato < maiorPerda.valor)) {
      maiorPerda = { dia: l.dia, valor: l.maior_loss_brl_por_contrato };
    }
  }
  const ganhoTipico = nGanho > 0 && somaGanho > 0 ? somaGanho / nGanho : null;
  const perdaTipica = nPerda > 0 && somaPerda < 0 ? somaPerda / nPerda : null;
  return {
    operacoes,
    pregoes,
    acertos: operacoes > 0 ? nGanho / operacoes : null,
    paraEmpatar: ganhoTipico !== null && perdaTipica !== null ? acertoParaEmpatar(ganhoTipico, perdaTipica) : null,
    ganhoTipico,
    perdaTipica,
    maiorPerda,
    resultadoPorOperacao: operacoes > 0 ? resultado / operacoes : null,
    custoPorOperacao: operacoes > 0 ? custos / operacoes : null,
    fatorLucro: somaPerda < 0 ? somaGanho / Math.abs(somaPerda) : null,
    operacoesPorDia: pregoes > 0 ? operacoes / pregoes : null,
  };
}

/**
 * Com quantas casas escrever "acerta 83 de cada 100; precisa de 81": nenhuma, a não ser que os dois números
 * sejam diferentes e arredondem para o mesmo inteiro (80,6 e 80,9). Aí uma casa, para a tela não dizer que o
 * robô acerta exatamente o que precisa para empatar. As frações vão de 0 a 1.
 */
export function casasDosAcertos(acertos: number, paraEmpatar: number | null): 0 | 1 {
  if (paraEmpatar === null || acertos === paraEmpatar) return 0;
  return Math.round(acertos * 100) === Math.round(paraEmpatar * 100) ? 1 : 0;
}

/**
 * A duração típica de uma operação, em segundos: a mediana das durações medidas. A mediana, e não a média,
 * porque uma operação que atravessa a tarde não muda o que é "o normal". Duração zero ou inválida não conta:
 * o histórico importado não traz o horário de entrada. Nulo quando nenhuma operação foi medida.
 */
export function duracaoTipica(duracoesSeg: readonly number[]): number | null {
  const medidas = duracoesSeg.filter((s) => Number.isFinite(s) && s > 0).sort((a, b) => a - b);
  if (medidas.length === 0) return null;
  const meio = Math.floor(medidas.length / 2);
  return medidas.length % 2 === 1 ? medidas[meio] : (medidas[meio - 1] + medidas[meio]) / 2;
}

// ---------------------------------------------------------------------------------------------------------
// Pregões em que operou
// ---------------------------------------------------------------------------------------------------------

export interface PregoesOperados {
  /** pregões em que o robô fechou ao menos uma operação */
  operou: number;
  /**
   * Pregões que a bolsa teve do primeiro ao último dia do histórico. Nulo quando o calendário de feriados do
   * site não cobre todos os anos do histórico (ou não bate com ele): o que o site não sabe, não inventa.
   */
  daBolsa: number | null;
  de: string | null;
  ate: string | null;
}

/**
 * Em quantos pregões o robô operou contra quantos a bolsa teve no mesmo intervalo. A conta dos pregões da
 * bolsa (dias úteis menos feriados) só vale quando há feriado cadastrado em cada ano do intervalo: todo ano
 * tem feriado em dia útil, então um ano sem nenhum é um ano que o calendário não cobre, e os feriados dele
 * entrariam como pregão perdido pelo robô.
 */
export function pregoesOperados(dias: readonly string[], feriados: readonly string[]): PregoesOperados {
  const unicos = [...new Set(dias)].sort();
  if (unicos.length === 0) return { operou: 0, daBolsa: null, de: null, ate: null };
  const de = unicos[0];
  const ate = unicos[unicos.length - 1];
  const anosComFeriado = new Set(feriados.map((f) => f.slice(0, 4)));
  let coberto = true;
  for (let ano = Number(de.slice(0, 4)); ano <= Number(ate.slice(0, 4)); ano++) {
    if (!anosComFeriado.has(String(ano))) coberto = false;
  }
  const daBolsa = coberto ? contarPregoes(de, ate, feriados) : null;
  // operou em mais pregões do que a bolsa teve: o calendário não bate com o histórico, e a comparação não vale
  return { operou: unicos.length, daBolsa: daBolsa !== null && daBolsa >= unicos.length ? daBolsa : null, de, ate };
}
