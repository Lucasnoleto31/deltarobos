/**
 * As contas da página inicial e da visão geral do robô (ficha Mesa, 25/11/2026): somar os robôs dia a dia,
 * recortar o período, acumular, achar a maior queda e resumir os pregões em palavras de leigo. Tudo em
 * R$ para 1 contrato, com os custos que o histórico de cada robô tem descontados: os valores chegam prontos
 * de `valorDia` (a premissa que a tela escreve vem de lib/premissa).
 *
 * 25/11/2026, revisão das telas (DESIGN.md, seção 9): a lista "Por robô" da página inicial passou a ser a
 * comparação entre os robôs, e as contas dela moram aqui: o período igual para todos, o ganho para cada R$ 1
 * da maior queda, a ordem da lista, o tamanho do histórico e as curvas no mesmo eixo de tempo ("lado a lado").
 */

import { tempoEmPalavras } from "./indicadores-robo";
import { inicioPeriodo } from "./periodos";

/** Um pregão: o resultado, quantas operações fecharam e quantas delas com ganho. */
export interface DiaResultado {
  dia: string;
  valor: number;
  n: number;
  g: number;
}

export interface DiaAcumulado {
  dia: string;
  valor: number;
  acumulado: number;
}

/**
 * A maior queda de uma curva: do ponto mais alto até o mais baixo depois dele. `iInicio` é o índice do
 * pregão do pico, ou -1 quando o pico é a partida (zero, antes do primeiro pregão). `valor` é positivo.
 */
export interface MaiorQueda {
  iInicio: number;
  iFundo: number;
  valor: number;
}

export interface ResumoDosDias {
  pregoes: number;
  comGanho: number;
  comPerda: number;
  melhor: { dia: string; valor: number } | null;
  pior: { dia: string; valor: number } | null;
  operacoes: number;
  /** fração das operações que terminou com ganho (0 a 1), ou nulo sem operação */
  acertos: number | null;
  total: number;
}

/** Soma várias séries dia a dia: a casa é todos os robôs, 1 contrato em cada. Devolve em ordem de data. */
export function somarSeries(series: ReadonlyArray<ReadonlyArray<DiaResultado>>): DiaResultado[] {
  const porDia = new Map<string, DiaResultado>();
  for (const serie of series) {
    for (const d of serie) {
      const soma = porDia.get(d.dia) ?? { dia: d.dia, valor: 0, n: 0, g: 0 };
      soma.valor += d.valor;
      soma.n += d.n;
      soma.g += d.g;
      porDia.set(d.dia, soma);
    }
  }
  return [...porDia.values()].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
}

/** O acumulado do período, pregão a pregão, partindo de zero. */
export function acumular(dias: ReadonlyArray<{ dia: string; valor: number }>): DiaAcumulado[] {
  let acumulado = 0;
  return dias.map((d) => {
    acumulado += d.valor;
    return { dia: d.dia, valor: d.valor, acumulado };
  });
}

/** A maior queda da curva (a partida, em zero, conta como pico). Nulo quando a curva nunca recuou. */
export function maiorQueda(pontos: ReadonlyArray<{ acumulado: number }>): MaiorQueda | null {
  let pico = 0;
  let iPico = -1;
  let melhor: MaiorQueda | null = null;
  pontos.forEach((p, i) => {
    if (p.acumulado > pico) {
      pico = p.acumulado;
      iPico = i;
      return;
    }
    const recuo = pico - p.acumulado;
    if (recuo > 0 && (melhor === null || recuo > melhor.valor)) melhor = { iInicio: iPico, iFundo: i, valor: recuo };
  });
  return melhor;
}

/** Quantos pregões terminaram com ganho e com perda, o melhor e o pior dia, e os acertos por operação. */
export function resumirDias(dias: ReadonlyArray<DiaResultado>): ResumoDosDias {
  const r: ResumoDosDias = { pregoes: dias.length, comGanho: 0, comPerda: 0, melhor: null, pior: null, operacoes: 0, acertos: null, total: 0 };
  let ganhos = 0;
  for (const d of dias) {
    if (d.valor > 0) r.comGanho += 1;
    else if (d.valor < 0) r.comPerda += 1;
    if (r.melhor === null || d.valor > r.melhor.valor) r.melhor = { dia: d.dia, valor: d.valor };
    if (r.pior === null || d.valor < r.pior.valor) r.pior = { dia: d.dia, valor: d.valor };
    r.operacoes += d.n;
    ganhos += d.g;
    r.total += d.valor;
  }
  r.acertos = r.operacoes > 0 ? ganhos / r.operacoes : null;
  return r;
}

// ---------------------------------------------------------------------------------------------------------
// O período da página inicial
// ---------------------------------------------------------------------------------------------------------

/** Os períodos da página inicial: os últimos 12 meses, tudo, ou os últimos 30 pregões. */
export type PeriodoDaCasa = "12m" | "tudo" | "30";

/** Quantos pregões tem o período curto. */
export const PREGOES_DO_PERIODO_CURTO = 30;

/**
 * O primeiro dia que entra no período, ou nulo quando entra tudo. É um dia só para a tela inteira: a soma e
 * cada robô são cortados na mesma data, para as linhas da lista somarem o número grande e as curvas dividirem
 * o mesmo eixo de tempo.
 * - 12 meses: a mesma definição do simulador (inicioPeriodo, em ./periodos), de hoje de um ano atrás, esse
 *   dia incluído. As duas telas escrevem "nos últimos 12 meses" e, com 1 contrato em cada robô, têm de dar
 *   o mesmo resultado nos mesmos pregões (revisão de 25/11/2026: a Visão geral deixava esse dia de fora e
 *   divergia do simulador sempre que algum robô tinha operado nele).
 * - 30 pregões: os últimos 30 pregões em que algum robô operou (`somada` é a soma dos robôs, em ordem de
 *   data). Um robô que não operou em todos eles aparece com os que operou.
 */
export function inicioDoPeriodoDaCasa(somada: ReadonlyArray<{ dia: string }>, periodo: PeriodoDaCasa, hoje: string): string | null {
  if (periodo === "tudo") return null;
  if (periodo === "12m") return inicioPeriodo("12m", hoje);
  return somada.length > PREGOES_DO_PERIODO_CURTO ? somada[somada.length - PREGOES_DO_PERIODO_CURTO].dia : null;
}

/** Os dias de `inicio` em diante (nulo devolve tudo). */
export function aPartirDe<T extends { dia: string }>(dias: readonly T[], inicio: string | null): T[] {
  return inicio === null ? [...dias] : dias.filter((d) => d.dia >= inicio);
}

// ---------------------------------------------------------------------------------------------------------
// Ganho para cada R$ 1 da maior queda
// ---------------------------------------------------------------------------------------------------------

export interface GanhoPorQueda {
  /** quantos reais o robô ganhou para cada R$ 1 da maior queda; nulo quando a conta enganaria */
  valor: number | null;
  /** o que falta para haver número: o período não terminou com ganho, ou a curva nunca recuou */
  falta: "ganho" | "queda" | null;
}

/**
 * O resultado do período dividido pela maior queda do mesmo período (`queda` positiva): com 1,10, o robô
 * ganhou R$ 1,10 para cada R$ 1 que já chegou a cair. É o que ordena a lista de robôs.
 *
 * Só existe com ganho e com queda. Resultado negativo dividido pela queda dá um número negativo que parece
 * nota e não diz nada, e sem queda a divisão não tem resposta: nos dois casos a tela mostra um traço e diz
 * qual dos dois faltou.
 */
export function ganhoPorQueda(resultado: number, queda: number): GanhoPorQueda {
  if (!(resultado > 0)) return { valor: null, falta: "ganho" };
  if (!(queda > 0)) return { valor: null, falta: "queda" };
  return { valor: resultado / queda, falta: null };
}

/** O que a ordem da lista de robôs precisa saber de cada linha. */
export interface LinhaNaOrdem {
  /** o ganho para cada R$ 1 da maior queda, ou nulo quando não há o número */
  ganhoPorQueda: number | null;
  /** o resultado do período */
  resultado: number;
  /** pregões do robô no período */
  pregoes: number;
}

/**
 * A ordem da lista de robôs: do maior ganho por queda para o menor. Quem não tem o número vai para o fim
 * (entre eles, do maior resultado para o menor), e depois de todos quem não operou no período.
 */
export function compararNaLista(a: LinhaNaOrdem, b: LinhaNaOrdem): number {
  const grupo = (l: LinhaNaOrdem) => (l.pregoes <= 0 ? 2 : l.ganhoPorQueda === null ? 1 : 0);
  const ga = grupo(a);
  const gb = grupo(b);
  if (ga !== gb) return ga - gb;
  if (ga === 0 && a.ganhoPorQueda !== b.ganhoPorQueda) return (b.ganhoPorQueda ?? 0) - (a.ganhoPorQueda ?? 0);
  return b.resultado - a.resultado;
}

// ---------------------------------------------------------------------------------------------------------
// O tamanho do histórico
// ---------------------------------------------------------------------------------------------------------

export interface TamanhoDoHistorico {
  /** o primeiro e o último pregão com operação */
  desde: string;
  ate: string;
  /** pregões com operação */
  pregoes: number;
  /** o tempo entre o primeiro e o último pregão, em palavras: "9 meses", "8 anos e 10 meses" */
  tempo: string;
}

/**
 * De quanto tempo e de quantos pregões saem os números de um robô. Resultado de 9 meses ao lado de resultado
 * de 8 anos não se compara sem dizer; por isso cada linha da lista leva isto escrito. `dias` em ordem de data.
 */
export function tamanhoDoHistorico(dias: ReadonlyArray<{ dia: string }>): TamanhoDoHistorico | null {
  if (dias.length === 0) return null;
  const desde = dias[0].dia;
  const ate = dias[dias.length - 1].dia;
  return { desde, ate, pregoes: dias.length, tempo: tempoEmPalavras(desde, ate) };
}

// ---------------------------------------------------------------------------------------------------------
// As curvas lado a lado
// ---------------------------------------------------------------------------------------------------------

/**
 * A curva de um robô no eixo comum. O eixo é todo pregão em que algum robô operou no período, em ordem e sem
 * repetir: os dias da soma dos robôs (somarSeries), que a página inicial já tem.
 */
export interface CurvaNoEixo {
  /** o acumulado do período em cada pregão do eixo; nulo onde ainda não há linha */
  acumulado: Array<number | null>;
  /** o resultado do robô em cada pregão do eixo; nulo no dia em que ele não operou */
  noDia: Array<number | null>;
  /** a maior queda, com o pico e o fundo nos índices do eixo (pico na partida = o primeiro pregão do robô) */
  queda: MaiorQueda | null;
}

/**
 * Põe a curva de um robô (o acumulado do período, partindo de zero) no eixo comum. No dia em que ele não
 * operou o acumulado fica onde estava e a linha segue reta. Antes do primeiro pregão dele no período há dois
 * casos, e `desdeOComeco` diz qual:
 * - o robô já existia quando o período começou (verdadeiro): a linha parte de zero no começo do eixo;
 * - o histórico dele começa dentro do período (falso): não há linha antes, e a curva começa no meio do
 *   gráfico, que é a verdade (ele não tinha resultado nenhum para mostrar).
 * O eixo precisa conter todos os dias da curva.
 */
export function curvaNoEixo(
  eixo: readonly string[],
  curva: readonly DiaAcumulado[],
  queda: MaiorQueda | null,
  desdeOComeco = false,
): CurvaNoEixo {
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
      acumulado.push(j > 0 ? curva[j - 1].acumulado : desdeOComeco && curva.length > 0 ? 0 : null);
      noDia.push(null);
    }
  });
  if (!queda || posicao[queda.iFundo] === undefined) return { acumulado, noDia, queda: null };
  // o pico da queda: o pregão dele; ou, quando a queda vem da partida, o ponto em zero logo antes do primeiro
  // pregão (se a linha parte do começo do eixo) ou o próprio primeiro pregão
  const iInicio = queda.iInicio >= 0 ? posicao[queda.iInicio] : desdeOComeco && posicao[0] > 0 ? posicao[0] - 1 : posicao[0];
  return { acumulado, noDia, queda: { iInicio, iFundo: posicao[queda.iFundo], valor: queda.valor } };
}
