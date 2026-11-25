import { agoraSP } from "./periodos";
import type { Base, Lado, Unidade } from "./tipos";

/**
 * Operação compacta pra estatísticas no cliente sem carregar a tabela inteira:
 * [dia_pregao, hora de abertura em Brasília, dia da semana (0..6), pontos/ct,
 *  R$ bruto/ct, custos/ct, duração (s), lado (1 compra, -1 venda), símbolo,
 *  MFE em pontos/ct?, MAE em pontos/ct?]
 * A ordem do array é a ordem cronológica de fechamento.
 * As posições 9 e 10 (22/09/2026) são o MFE e o MAE medidos pelo EA 1.1.0 tick a tick enquanto a
 * posição viveu (migration 0021). São OPCIONAIS: ausentes ou null querem dizer "não medido" (operação
 * anterior ao EA 1.1.0, importada do histórico, ou conta com o EA antigo). Quem escreve a tupla na mão
 * (testes, fixtures) pode continuar com as 9 posições de sempre; leia pelos acessores `mfe` e `mae`.
 */
export type OperacaoCompacta = [
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  1 | -1,
  string,
  (number | null)?,
  (number | null)?,
];

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
  /** MFE/MAE em pontos por contrato (operacoes_publico desde a migration 0021); null ou ausente = não medido */
  mfe_pontos_por_contrato?: number | null;
  mae_pontos_por_contrato?: number | null;
}): OperacaoCompacta {
  const a = agoraSP(new Date(op.abertura_em));
  const base: OperacaoCompacta = [
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
  // as posições 9 e 10 só existem quando há medição: a maior parte do histórico não tem, e duas
  // posições a mais em cada uma das ~15 mil tuplas não pode custar payload à toa
  const mfe = numeroOuNulo(op.mfe_pontos_por_contrato);
  const mae = numeroOuNulo(op.mae_pontos_por_contrato);
  if (mfe === null && mae === null) return base;
  base.push(mfe, mae);
  return base;
}

function numeroOuNulo(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export const dia = (op: OperacaoCompacta) => op[0];
export const hora = (op: OperacaoCompacta) => op[1];
export const diaSemana = (op: OperacaoCompacta) => op[2];
export const duracao = (op: OperacaoCompacta) => op[6];
/** MFE em pontos por contrato (>= 0), ou null quando a operação não foi medida pelo EA. */
export const mfe = (op: OperacaoCompacta): number | null => op[9] ?? null;
/** MAE em pontos por contrato (<= 0), ou null quando a operação não foi medida pelo EA. */
export const mae = (op: OperacaoCompacta): number | null => op[10] ?? null;
/** A operação tem MFE/MAE medidos pelo EA? */
export const temExcursao = (op: OperacaoCompacta): boolean => mfe(op) !== null || mae(op) !== null;

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

// 25/11/2026, revisão das telas (DESIGN.md, seção 9): saíram as contas que ficaram sem tela nenhuma
// (resultado por dia da semana, por hora e por série do contrato, o histograma, as sequências de operações e
// o resumo por operação). O que a aba Melhores horários usa mora em ./faixas, e os números de "Como ele
// opera" em ./como-opera.

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
