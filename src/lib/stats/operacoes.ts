import { agoraSP } from "./periodos";
import type { Base, Lado, Unidade } from "./tipos";

/**
 * Operação compacta pra estatísticas no cliente sem carregar a tabela inteira:
 * [dia_pregao, hora de abertura em Brasília, dia da semana (0..6), pontos/ct,
 *  R$ bruto/ct, custos/ct, duração (s), lado (1 compra, -1 venda), símbolo]
 * A ordem do array é a ordem cronológica de fechamento.
 */
export type OperacaoCompacta = [string, number, number, number, number, number, number, 1 | -1, string];

export interface OpcoesOperacao {
  base: Base;
  unidade: Unidade;
  valorPonto: number;
  contratos?: number;
}

export function compactar(op: {
  dia_pregao: string;
  abertura_em: string;
  pontos_por_contrato: number;
  resultado_brl_por_contrato: number;
  custos_brl_por_contrato: number;
  duracao_seg: number;
  lado: Lado;
  simbolo: string;
}): OperacaoCompacta {
  const a = agoraSP(new Date(op.abertura_em));
  return [
    op.dia_pregao,
    a.hora,
    a.diaSemana,
    op.pontos_por_contrato,
    op.resultado_brl_por_contrato,
    op.custos_brl_por_contrato,
    op.duracao_seg,
    op.lado === "compra" ? 1 : -1,
    op.simbolo,
  ];
}

export const dia = (op: OperacaoCompacta) => op[0];
export const hora = (op: OperacaoCompacta) => op[1];
export const diaSemana = (op: OperacaoCompacta) => op[2];
export const duracao = (op: OperacaoCompacta) => op[6];
export const simbolo = (op: OperacaoCompacta) => op[8];

/** Valor da operação nas unidades pedidas. */
export function valorOperacao(op: OperacaoCompacta, o: OpcoesOperacao): number {
  const [, , , pontos, brl, custos] = op;
  const contratos = o.contratos ?? 1;
  const c = o.base === "liquido" ? custos : 0;
  if (o.unidade === "pontos") {
    return (pontos - (o.valorPonto > 0 ? c / o.valorPonto : 0)) * contratos;
  }
  return (brl - c) * contratos;
}

/** Gain/loss é sempre pelo líquido em R$ por contrato (mesma regra da série diária). */
export function liquidoOperacao(op: OperacaoCompacta): number {
  return op[4] - op[5];
}

export interface Faixa {
  chave: number;
  rotulo: string;
  total: number;
  n: number;
  nGain: number;
  nLoss: number;
  media: number;
}

const ROTULO_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function agrupar(
  ops: readonly OperacaoCompacta[],
  o: OpcoesOperacao,
  chaveDe: (op: OperacaoCompacta) => number,
  rotuloDe: (chave: number) => string,
  chavesFixas: number[],
): Faixa[] {
  const mapa = new Map<number, Faixa>();
  const garantir = (chave: number) => {
    let f = mapa.get(chave);
    if (!f) {
      f = { chave, rotulo: rotuloDe(chave), total: 0, n: 0, nGain: 0, nLoss: 0, media: 0 };
      mapa.set(chave, f);
    }
    return f;
  };
  for (const k of chavesFixas) garantir(k);
  for (const op of ops) {
    const f = garantir(chaveDe(op));
    const v = valorOperacao(op, o);
    const liq = liquidoOperacao(op);
    f.total += v;
    f.n += 1;
    if (liq > 0) f.nGain += 1;
    else if (liq < 0) f.nLoss += 1;
  }
  return [...mapa.values()]
    .sort((a, b) => a.chave - b.chave)
    .map((f) => ({ ...f, media: f.n > 0 ? f.total / f.n : 0 }));
}

/** Resultado por dia da semana (segunda a sexta sempre presentes). */
export function porDiaSemana(ops: readonly OperacaoCompacta[], o: OpcoesOperacao): Faixa[] {
  return agrupar(ops, o, diaSemana, (k) => ROTULO_DIA[k] ?? String(k), [1, 2, 3, 4, 5]);
}

/** Resultado por hora de abertura (9h às 17h sempre presentes). */
export function porHora(ops: readonly OperacaoCompacta[], o: OpcoesOperacao): Faixa[] {
  return agrupar(ops, o, hora, (k) => `${k}h`, [9, 10, 11, 12, 13, 14, 15, 16, 17]);
}

export interface FaixaSimbolo {
  simbolo: string;
  total: number;
  n: number;
  nGain: number;
}

/** Resultado por símbolo (série do contrato), do melhor pro pior. */
export function porSimbolo(ops: readonly OperacaoCompacta[], o: OpcoesOperacao): FaixaSimbolo[] {
  const mapa = new Map<string, FaixaSimbolo>();
  for (const op of ops) {
    const s = simbolo(op);
    let f = mapa.get(s);
    if (!f) {
      f = { simbolo: s, total: 0, n: 0, nGain: 0 };
      mapa.set(s, f);
    }
    f.total += valorOperacao(op, o);
    f.n += 1;
    if (liquidoOperacao(op) > 0) f.nGain += 1;
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

export interface FaixaHistograma {
  de: number;
  ate: number;
  n: number;
}

/** Histograma do resultado por operação em faixas de largura igual. */
export function histograma(
  ops: readonly OperacaoCompacta[],
  o: OpcoesOperacao,
  nFaixas = 12,
): FaixaHistograma[] {
  if (ops.length === 0) return [];
  const valores = ops.map((op) => valorOperacao(op, o));
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const largura = (max - min) / nFaixas;
  const faixas: FaixaHistograma[] = Array.from({ length: nFaixas }, (_, i) => ({
    de: min + i * largura,
    ate: min + (i + 1) * largura,
    n: 0,
  }));
  for (const v of valores) {
    let i = Math.floor((v - min) / largura);
    if (i >= nFaixas) i = nFaixas - 1;
    if (i < 0) i = 0;
    faixas[i].n += 1;
  }
  return faixas;
}

export interface Sequencias {
  maiorGains: number;
  maiorLosses: number;
  /** sequência em andamento no fim da lista */
  atual: { tipo: "gain" | "loss" | null; n: number };
}

/** Maior sequência de gains e de losses, operação a operação, em ordem cronológica. */
export function sequencias(ops: readonly OperacaoCompacta[]): Sequencias {
  let maiorGains = 0;
  let maiorLosses = 0;
  let tipo: "gain" | "loss" | null = null;
  let n = 0;
  for (const op of ops) {
    const liq = liquidoOperacao(op);
    const t: "gain" | "loss" | null = liq > 0 ? "gain" : liq < 0 ? "loss" : null;
    if (t === null) {
      tipo = null;
      n = 0;
      continue;
    }
    if (t === tipo) n += 1;
    else {
      tipo = t;
      n = 1;
    }
    if (t === "gain" && n > maiorGains) maiorGains = n;
    if (t === "loss" && n > maiorLosses) maiorLosses = n;
  }
  return { maiorGains, maiorLosses, atual: { tipo, n } };
}

export interface ResumoOperacoes {
  n: number;
  nGain: number;
  nLoss: number;
  mediaGain: number;
  mediaLoss: number;
  maiorGain: number;
  maiorLoss: number;
  duracaoMediaSeg: number;
  diasComOperacao: number;
  mediaPorDia: number;
  nCompra: number;
  nVenda: number;
}

/** Números por operação nas unidades pedidas (gain/loss classificados pelo líquido). */
export function resumoOperacoes(ops: readonly OperacaoCompacta[], o: OpcoesOperacao): ResumoOperacoes {
  let nGain = 0;
  let nLoss = 0;
  let somaGain = 0;
  let somaLoss = 0;
  let maiorGain = 0;
  let maiorLoss = 0;
  let somaDuracao = 0;
  let nCompra = 0;
  const dias = new Set<string>();
  for (const op of ops) {
    const v = valorOperacao(op, o);
    const liq = liquidoOperacao(op);
    dias.add(dia(op));
    somaDuracao += duracao(op);
    if (op[7] === 1) nCompra += 1;
    if (liq > 0) {
      nGain += 1;
      somaGain += v;
      if (v > maiorGain) maiorGain = v;
    } else if (liq < 0) {
      nLoss += 1;
      somaLoss += v;
      if (v < maiorLoss) maiorLoss = v;
    }
  }
  const n = ops.length;
  return {
    n,
    nGain,
    nLoss,
    mediaGain: nGain > 0 ? somaGain / nGain : 0,
    mediaLoss: nLoss > 0 ? somaLoss / nLoss : 0,
    maiorGain,
    maiorLoss,
    duracaoMediaSeg: n > 0 ? somaDuracao / n : 0,
    diasComOperacao: dias.size,
    mediaPorDia: dias.size > 0 ? n / dias.size : 0,
    nCompra,
    nVenda: n - nCompra,
  };
}

/** Curva acumulada operação a operação (pra curva "por operação" e pico/vale). */
export function curvaPorOperacao(
  ops: readonly OperacaoCompacta[],
  o: OpcoesOperacao,
): { indice: number; dia: string; acumulado: number }[] {
  let acumulado = 0;
  return ops.map((op, i) => {
    acumulado += valorOperacao(op, o);
    return { indice: i + 1, dia: dia(op), acumulado };
  });
}

export interface Excursao {
  /** maior valor positivo que o acumulado atingiu (0 se nunca ficou positivo) */
  mep: number;
  /** menor valor negativo que o acumulado atingiu (0 se nunca ficou negativo) */
  men: number;
  /** índice 0-based da primeira operação em que o acumulado bateu o MEP (null quando mep = 0) */
  iMep: number | null;
  /** índice 0-based da primeira operação em que o acumulado bateu o MEN (null quando men = 0) */
  iMen: number | null;
  /** acumulado no fim da sequência */
  final: number;
}

/**
 * Máxima exposição positiva e negativa de uma sequência de valores, medida a cada fechamento
 * (não acompanha o não realizado tick a tick, então é sempre igual ou menor em módulo que o MEP/MEN
 * do Profit). Em empate vale a primeira operação em que o extremo ocorreu.
 */
export function excursao(valores: readonly number[]): Excursao {
  // ruído de ponto flutuante (9,70 + (-9,70) dá -1,8e-15): abaixo disso o acumulado conta como zero e
  // um "novo" extremo só vale se passar do anterior de verdade (senão o empate iria para a errada)
  const EPS = 1e-9;
  let acumulado = 0;
  let mep = 0;
  let men = 0;
  let iMep: number | null = null;
  let iMen: number | null = null;
  valores.forEach((v, i) => {
    acumulado += v;
    if (acumulado > mep + EPS) {
      mep = acumulado;
      iMep = i;
    }
    if (acumulado < men - EPS) {
      men = acumulado;
      iMen = i;
    }
  });
  return { mep, men, iMep, iMen, final: acumulado };
}

export interface ExcursaoDoDia {
  mep: number;
  men: number;
  final: number;
  nOperacoes: number;
  /** número (1-based) da operação em que o MEP ocorreu; null quando o acumulado nunca ficou positivo */
  operacaoMep: number | null;
  /** número (1-based) da operação em que o MEN ocorreu; null quando o acumulado nunca ficou negativo */
  operacaoMen: number | null;
}

/** MEP/MEN das operações de um dia, nas mesmas base e unidade da curva (ordem recebida = ordem de fechamento). */
export function excursaoDoDia(ops: readonly OperacaoCompacta[], o: OpcoesOperacao): ExcursaoDoDia {
  const e = excursao(ops.map((op) => valorOperacao(op, o)));
  return {
    mep: e.mep,
    men: e.men,
    final: e.final,
    nOperacoes: ops.length,
    operacaoMep: e.iMep === null ? null : e.iMep + 1,
    operacaoMen: e.iMen === null ? null : e.iMen + 1,
  };
}
