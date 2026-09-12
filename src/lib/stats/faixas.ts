import { formatarBRL } from "@/lib/formato";
import { dia as diaOp, diaSemana, hora, liquidoOperacao, type OperacaoCompacta } from "./operacoes";
import { mesDe } from "./periodos";

/**
 * Validação de faixas: classifica cada par (dia da semana × hora de entrada)
 * em Ligar, Cautela, Neutro ou Evitar, com um score público de 0 a 100.
 *
 *   expectativa  = média do resultado líquido por operação na faixa (R$/contrato)
 *   percentil    = posição da expectativa entre as faixas com amostra mínima (0..1)
 *   estabilidade = meses com resultado positivo / meses com operação na faixa (0..1)
 *   confiança    = min(1, operações / 100)
 *   score        = 50 × percentil + 30 × estabilidade + 20 × confiança
 *                  (expectativa ≤ 0 limita o score a 40)
 *
 *   Ligar ≥ 75 · Cautela 55–74 · Neutro 45–54 · Evitar < 45
 *   Faixa com menos de 10 operações fica sem classificação.
 */

export type ClasseFaixa = "ligar" | "cautela" | "neutro" | "evitar";

export const LOTE_POR_CLASSE: Record<ClasseFaixa, number> = {
  ligar: 1,
  cautela: 0.6,
  neutro: 0.35,
  evitar: 0,
};

export const ROTULO_CLASSE: Record<ClasseFaixa, string> = {
  ligar: "Ligar",
  cautela: "Cautela",
  neutro: "Neutro",
  evitar: "Evitar",
};

export const DESCRICAO_CLASSE: Record<ClasseFaixa, string> = {
  ligar: "Operar com confiança · lote 100%",
  cautela: "Reduzir lote · lote 60%",
  neutro: "Margem mínima · lote 35%",
  evitar: "Desligar faixa · lote 0%",
};

export const MIN_OPERACOES_FAIXA = 10;
export const DIAS_UTEIS = [1, 2, 3, 4, 5] as const;
export const HORAS = [9, 10, 11, 12, 13, 14, 15, 16, 17] as const;

const NOME_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export interface Faixa {
  diaSemana: number;
  hora: number;
  rotulo: string;
  n: number;
  nGain: number;
  acerto: number;
  total: number;
  expectativa: number;
  mesesComDados: number;
  mesesPositivos: number;
  estabilidade: number;
  confianca: number;
  percentil: number;
  score: number;
  classe: ClasseFaixa | null;
  lote: number;
}

export interface Insight {
  chave: string;
  texto: string;
}

export interface ResultadoFaixas {
  /** 45 faixas, dias úteis × horas, em ordem de dia e hora */
  faixas: Faixa[];
  comDados: Faixa[];
  nOperacoes: number;
  contagem: Record<ClasseFaixa, number>;
  /** melhores faixas classificadas como Ligar (ou as de maior score, se não houver) */
  melhores: Faixa[];
  insights: Insight[];
}

export function classificar(score: number, n: number, minimo = MIN_OPERACOES_FAIXA): ClasseFaixa | null {
  if (n < minimo) return null;
  if (score >= 75) return "ligar";
  if (score >= 55) return "cautela";
  if (score >= 45) return "neutro";
  return "evitar";
}

export function rotuloFaixa(d: number, h: number): string {
  return `${NOME_DIA[d] ?? d} ${String(h).padStart(2, "0")}:00`;
}

export function validarFaixas(
  ops: readonly OperacaoCompacta[],
  opts: { minOperacoes?: number } = {},
): ResultadoFaixas {
  const minimo = opts.minOperacoes ?? MIN_OPERACOES_FAIXA;

  interface Acc {
    n: number;
    nGain: number;
    total: number;
    meses: Map<string, number>;
  }
  const acc = new Map<string, Acc>();
  for (const d of DIAS_UTEIS) for (const h of HORAS) acc.set(`${d}-${h}`, { n: 0, nGain: 0, total: 0, meses: new Map() });

  let nOperacoes = 0;
  for (const op of ops) {
    const a = acc.get(`${diaSemana(op)}-${hora(op)}`);
    if (!a) continue; // fora de seg-sex 9h-17h
    const liq = liquidoOperacao(op);
    a.n += 1;
    a.total += liq;
    if (liq > 0) a.nGain += 1;
    const m = mesDe(diaOp(op));
    a.meses.set(m, (a.meses.get(m) ?? 0) + liq);
    nOperacoes += 1;
  }

  const parciais = [...acc.entries()].map(([chave, a]) => {
    const [d, h] = chave.split("-").map(Number);
    const mesesPositivos = [...a.meses.values()].filter((v) => v > 0).length;
    return {
      diaSemana: d,
      hora: h,
      rotulo: rotuloFaixa(d, h),
      n: a.n,
      nGain: a.nGain,
      acerto: a.n > 0 ? a.nGain / a.n : 0,
      total: a.total,
      expectativa: a.n > 0 ? a.total / a.n : 0,
      mesesComDados: a.meses.size,
      mesesPositivos,
      estabilidade: a.meses.size > 0 ? mesesPositivos / a.meses.size : 0,
      confianca: Math.min(1, a.n / 100),
    };
  });

  // percentil da expectativa entre as faixas com amostra mínima
  const elegiveis = parciais.filter((f) => f.n >= minimo).sort((a, b) => a.expectativa - b.expectativa);
  const percentil = new Map<string, number>();
  elegiveis.forEach((f, i) => {
    percentil.set(`${f.diaSemana}-${f.hora}`, elegiveis.length > 1 ? i / (elegiveis.length - 1) : f.expectativa > 0 ? 1 : 0);
  });

  const faixas: Faixa[] = parciais.map((f) => {
    const p = percentil.get(`${f.diaSemana}-${f.hora}`) ?? 0;
    let score = Math.round(50 * p + 30 * f.estabilidade + 20 * f.confianca);
    if (f.expectativa <= 0) score = Math.min(score, 40);
    const classe = classificar(score, f.n, minimo);
    return { ...f, percentil: p, score, classe, lote: classe ? LOTE_POR_CLASSE[classe] : 0 };
  });

  const comDados = faixas.filter((f) => f.classe !== null);
  const contagem: Record<ClasseFaixa, number> = { ligar: 0, cautela: 0, neutro: 0, evitar: 0 };
  for (const f of comDados) contagem[f.classe as ClasseFaixa] += 1;

  const porScore = [...comDados].sort((a, b) => b.score - a.score || b.expectativa - a.expectativa);
  const ligar = porScore.filter((f) => f.classe === "ligar");
  const melhores = (ligar.length > 0 ? ligar : porScore).slice(0, 5);

  return { faixas, comDados, nOperacoes, contagem, melhores, insights: gerarInsights(comDados, contagem, porScore) };
}

function gerarInsights(
  comDados: Faixa[],
  contagem: Record<ClasseFaixa, number>,
  porScore: Faixa[],
): Insight[] {
  const insights: Insight[] = [];
  if (comDados.length === 0) return insights;

  const top = porScore.slice(0, 3);
  const horasTop = [...new Set(top.map((f) => f.hora))].sort((a, b) => a - b);
  if (horasTop.length > 0) {
    insights.push({
      chave: "horas",
      texto: `As melhores faixas se concentram ${horasTop.length === 1 ? "às" : "em torno de"} ${horasTop.map((h) => `${h}h`).join(" e ")}.`,
    });
  }

  const porDia = new Map<number, { soma: number; n: number }>();
  for (const f of comDados) {
    const d = porDia.get(f.diaSemana) ?? { soma: 0, n: 0 };
    d.soma += f.estabilidade;
    d.n += 1;
    porDia.set(f.diaSemana, d);
  }
  const diasOrdenados = [...porDia.entries()]
    .map(([d, v]) => ({ d, media: v.n > 0 ? v.soma / v.n : 0 }))
    .sort((a, b) => b.media - a.media);
  if (diasOrdenados.length >= 2) {
    insights.push({
      chave: "dias",
      texto: `${NOME_DIA[diasOrdenados[0].d]} e ${NOME_DIA[diasOrdenados[1].d].toLowerCase()} apresentam a maior estabilidade histórica.`,
    });
  }

  insights.push({
    chave: "ligar",
    texto: `${contagem.ligar} ${contagem.ligar === 1 ? "faixa" : "faixas"} com classificação LIGAR: expectativa positiva, estabilidade e amostra suficientes.`,
  });
  insights.push({
    chave: "evitar",
    texto: `${contagem.evitar} ${contagem.evitar === 1 ? "faixa identificada" : "faixas identificadas"} como EVITAR com base no histórico.`,
  });

  const porHora = new Map<number, { soma: number; n: number }>();
  for (const f of comDados) {
    const h = porHora.get(f.hora) ?? { soma: 0, n: 0 };
    h.soma += f.total;
    h.n += f.n;
    porHora.set(f.hora, h);
  }
  const horasOrdenadas = [...porHora.entries()]
    .map(([h, v]) => ({ h, expectativa: v.n > 0 ? v.soma / v.n : 0 }))
    .sort((a, b) => a.expectativa - b.expectativa);
  if (horasOrdenadas.length > 0 && horasOrdenadas[0].expectativa < 0) {
    const pior = horasOrdenadas[0];
    insights.push({
      chave: "pior-hora",
      texto: `Entradas às ${pior.h}h têm a pior expectativa média (${formatarBRL(pior.expectativa, { sinal: true })} por operação).`,
    });
  }

  return insights;
}
