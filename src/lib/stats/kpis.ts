import { anoDe, mesDe } from "./periodos";
import { curvaAcumulada, drawdownMaximo, ordenarPorDia } from "./serie";
import type { Drawdown, LinhaDiaria, OpcoesSerie } from "./tipos";

export interface DiaValor {
  dia: string;
  valor: number;
}

export interface Kpis {
  /** soma de todo o período filtrado */
  acumulado: number;
  hoje: number;
  mes: number;
  ano: number;
  /** acumulado / nº de meses com pregão na série */
  mediaMensal: number;
  nMeses: number;
  nDias: number;
  drawdown: Drawdown;
  /** drawdown máximo em R$ líquido por 1 contrato / capital de referência */
  drawdownMaximoPct: number | null;
  /** 0..1. Sempre sobre o resultado líquido por operação. */
  taxaAcerto: number | null;
  /** soma dos gains / |soma dos losses|. null se não houve loss. */
  fatorLucro: number | null;
  /** média dos gains / |média dos losses|. null se não houve loss. */
  payoff: number | null;
  nOperacoes: number;
  nGain: number;
  nLoss: number;
  mediaOperacoesDia: number;
  melhorDia: DiaValor | null;
  piorDia: DiaValor | null;
  diasPositivos: number;
  diasNegativos: number;
  maiorSequenciaDiasPositivos: number;
  maiorSequenciaDiasNegativos: number;
}

export interface ContextoKpis {
  /** YYYY-MM-DD em Brasília */
  hoje: string;
  capitalReferencia?: number | null;
}

/**
 * KPIs a partir da série diária. As linhas já devem vir filtradas pelo
 * período desejado. Taxa de acerto, fator de lucro e payoff usam sempre a
 * classificação líquida por operação (é o que a série diária guarda).
 */
export function calcularKpis(
  linhas: readonly LinhaDiaria[],
  o: OpcoesSerie,
  ctx: ContextoKpis,
): Kpis {
  const ordenadas = ordenarPorDia(linhas);
  const curva = curvaAcumulada(ordenadas, o);
  const acumulado = curva.length > 0 ? curva[curva.length - 1].acumulado : 0;

  const mesAtual = mesDe(ctx.hoje);
  const anoAtual = anoDe(ctx.hoje);
  const meses = new Set<string>();

  let hoje = 0;
  let mes = 0;
  let ano = 0;
  let diasPositivos = 0;
  let diasNegativos = 0;
  let seqPos = 0;
  let seqNeg = 0;
  let maiorSeqPos = 0;
  let maiorSeqNeg = 0;
  let melhorDia: DiaValor | null = null;
  let piorDia: DiaValor | null = null;

  for (const p of curva) {
    meses.add(mesDe(p.dia));
    if (p.dia === ctx.hoje) hoje += p.valor;
    if (mesDe(p.dia) === mesAtual) mes += p.valor;
    if (anoDe(p.dia) === anoAtual) ano += p.valor;

    if (p.valor > 0) {
      diasPositivos++;
      seqPos++;
      seqNeg = 0;
    } else if (p.valor < 0) {
      diasNegativos++;
      seqNeg++;
      seqPos = 0;
    } else {
      seqPos = 0;
      seqNeg = 0;
    }
    if (seqPos > maiorSeqPos) maiorSeqPos = seqPos;
    if (seqNeg > maiorSeqNeg) maiorSeqNeg = seqNeg;

    if (melhorDia === null || p.valor > melhorDia.valor) melhorDia = { dia: p.dia, valor: p.valor };
    if (piorDia === null || p.valor < piorDia.valor) piorDia = { dia: p.dia, valor: p.valor };
  }

  let nOperacoes = 0;
  let nGain = 0;
  let nLoss = 0;
  let somaGain = 0;
  let somaLoss = 0;
  for (const l of ordenadas) {
    nOperacoes += l.n_operacoes;
    nGain += l.n_gain;
    nLoss += l.n_loss;
    somaGain += l.soma_gain_brl_por_contrato;
    somaLoss += l.soma_loss_brl_por_contrato;
  }

  // As somas estão em R$ líquido por 1 contrato: converte pras unidades pedidas
  const contratos = o.contratos ?? 1;
  const fatorUnidade = o.unidade === "pontos" ? (o.valorPonto > 0 ? 1 / o.valorPonto : 0) : 1;
  somaGain *= fatorUnidade * contratos;
  somaLoss *= fatorUnidade * contratos;

  const taxaAcerto = nOperacoes > 0 ? nGain / nOperacoes : null;
  const fatorLucro = somaLoss < 0 ? somaGain / Math.abs(somaLoss) : null;
  const mediaGain = nGain > 0 ? somaGain / nGain : 0;
  const mediaLoss = nLoss > 0 ? Math.abs(somaLoss) / nLoss : 0;
  const payoff = mediaLoss > 0 ? mediaGain / mediaLoss : null;

  const drawdown = drawdownMaximo(curva);

  // % sobre capital: sempre em R$ líquido por 1 contrato, independente do toggle
  let drawdownMaximoPct: number | null = null;
  if (ctx.capitalReferencia && ctx.capitalReferencia > 0) {
    const curvaBrl = curvaAcumulada(ordenadas, {
      base: "liquido",
      unidade: "brl",
      valorPonto: o.valorPonto,
      contratos: 1,
    });
    drawdownMaximoPct = drawdownMaximo(curvaBrl).valor / ctx.capitalReferencia;
  }

  const nDias = curva.length;
  const nMeses = meses.size;

  return {
    acumulado,
    hoje,
    mes,
    ano,
    mediaMensal: nMeses > 0 ? acumulado / nMeses : 0,
    nMeses,
    nDias,
    drawdown,
    drawdownMaximoPct,
    taxaAcerto,
    fatorLucro,
    payoff,
    nOperacoes,
    nGain,
    nLoss,
    mediaOperacoesDia: nDias > 0 ? nOperacoes / nDias : 0,
    melhorDia,
    piorDia,
    diasPositivos,
    diasNegativos,
    maiorSequenciaDiasPositivos: maiorSeqPos,
    maiorSequenciaDiasNegativos: maiorSeqNeg,
  };
}

/**
 * Capital mínimo recomendado por contrato =
 *   margem de referência + drawdown máximo (R$ líquido / contrato) x fator de segurança.
 */
export function capitalMinimoRecomendado(
  margemReferencia: number | null | undefined,
  drawdownMaximoBrl: number,
  fatorSeguranca = 1.5,
): number {
  return (margemReferencia ?? 0) + drawdownMaximoBrl * fatorSeguranca;
}
