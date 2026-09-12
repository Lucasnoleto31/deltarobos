import { formatarBRL } from "@/lib/formato";
import { dia as diaOp, diaSemana, hora, liquidoOperacao, type OperacaoCompacta } from "./operacoes";
import { mesDe } from "./periodos";

/**
 * Validação cruzada de faixas (dia da semana × hora de entrada).
 *
 * Por faixa:
 *   consistência = taxa de acerto (gains ÷ operações, pelo líquido)
 *   recuperação  = resultado líquido ÷ drawdown máximo da faixa (curva operação a operação)
 *   DD relativo  = drawdown da faixa ÷ mediana dos drawdowns das faixas com amostra
 *
 * Classificação, nesta ordem:
 *   sem amostra mínima                        → sem classificação
 *   qualquer condição de EVITAR satisfeita    → EVITAR
 *   consistência, recuperação e DD relativo   → LIGAR
 *   consistência e recuperação                → CAUTELA
 *   o resto                                   → NEUTRO
 *
 * O score (0–100) só ordena o ranking: 50 × percentil da expectativa + 30 × estabilidade
 * (meses positivos ÷ meses) + 20 × confiança (operações ÷ 100).
 */

export type ClasseFaixa = "ligar" | "cautela" | "neutro" | "evitar";

export interface ParametrosFaixas {
  amostraMinima: number;
  ligar: { acertoMin: number; recuperacaoMin: number; ddRelativoMax: number };
  cautela: { acertoMin: number; recuperacaoMin: number };
  evitar: { acertoMax: number; recuperacaoMax: number; ddRelativoMin: number };
}

export const PARAMETROS_FAIXAS_PADRAO: ParametrosFaixas = {
  amostraMinima: 40,
  ligar: { acertoMin: 0.58, recuperacaoMin: 0.85, ddRelativoMax: 4 },
  cautela: { acertoMin: 0.48, recuperacaoMin: 0.6 },
  evitar: { acertoMax: 0.38, recuperacaoMax: 0.4, ddRelativoMin: 6 },
};

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

export const DIAS_UTEIS = [1, 2, 3, 4, 5] as const;
export const HORAS = [9, 10, 11, 12, 13, 14, 15, 16, 17] as const;

const NOME_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export interface Faixa {
  diaSemana: number;
  hora: number;
  rotulo: string;
  n: number;
  nGain: number;
  /** consistência */
  acerto: number;
  total: number;
  expectativa: number;
  /** drawdown máximo da curva operação a operação da faixa (R$/contrato, positivo) */
  dd: number;
  /** total ÷ dd; null = sem drawdown com resultado positivo (recuperação infinita) */
  recuperacao: number | null;
  /** dd ÷ mediana dos dd das faixas com amostra; null quando não há mediana */
  ddRelativo: number | null;
  mesesComDados: number;
  mesesPositivos: number;
  estabilidade: number;
  confianca: number;
  percentil: number;
  score: number;
  classe: ClasseFaixa | null;
  lote: number;
  /** regra que decidiu a classificação, em texto */
  motivo: string;
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
  /** mediana dos drawdowns das faixas com amostra (base do DD relativo) */
  medianaDd: number;
  parametros: ParametrosFaixas;
}

export function rotuloFaixa(d: number, h: number): string {
  return `${NOME_DIA[d] ?? d} ${String(h).padStart(2, "0")}:00`;
}

/** Drawdown máximo de uma sequência de resultados, curva partindo do zero. */
export function drawdownPorOperacao(valores: readonly number[]): number {
  let acumulado = 0;
  let pico = 0;
  let pior = 0;
  for (const v of valores) {
    acumulado += v;
    if (acumulado > pico) pico = acumulado;
    const dd = pico - acumulado;
    if (dd > pior) pior = dd;
  }
  return pior;
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Aplica os parâmetros a uma faixa. `recuperacao` null = infinita. */
export function classificarFaixa(
  f: { n: number; acerto: number; recuperacao: number | null; ddRelativo: number | null },
  p: ParametrosFaixas = PARAMETROS_FAIXAS_PADRAO,
): { classe: ClasseFaixa | null; motivo: string } {
  if (f.n < p.amostraMinima) {
    return { classe: null, motivo: `amostra de ${f.n} operações, mínimo ${p.amostraMinima}` };
  }
  const rec = f.recuperacao ?? Number.POSITIVE_INFINITY;
  const ddr = f.ddRelativo ?? 0;

  if (f.acerto < p.evitar.acertoMax) return { classe: "evitar", motivo: `acerto ${pct(f.acerto)} abaixo de ${pct(p.evitar.acertoMax)}` };
  if (rec < p.evitar.recuperacaoMax) return { classe: "evitar", motivo: `recuperação ${rec.toFixed(2)} abaixo de ${p.evitar.recuperacaoMax}` };
  if (ddr > p.evitar.ddRelativoMin) return { classe: "evitar", motivo: `DD relativo ${ddr.toFixed(1)}x acima de ${p.evitar.ddRelativoMin}x` };

  if (f.acerto >= p.ligar.acertoMin && rec >= p.ligar.recuperacaoMin && ddr <= p.ligar.ddRelativoMax) {
    return {
      classe: "ligar",
      motivo: `acerto ${pct(f.acerto)} ≥ ${pct(p.ligar.acertoMin)}, recuperação ${Number.isFinite(rec) ? rec.toFixed(2) : "∞"} ≥ ${p.ligar.recuperacaoMin}, DD relativo ${ddr.toFixed(1)}x ≤ ${p.ligar.ddRelativoMax}x`,
    };
  }
  if (f.acerto >= p.cautela.acertoMin && rec >= p.cautela.recuperacaoMin) {
    return {
      classe: "cautela",
      motivo: `acerto ${pct(f.acerto)} ≥ ${pct(p.cautela.acertoMin)} e recuperação ${Number.isFinite(rec) ? rec.toFixed(2) : "∞"} ≥ ${p.cautela.recuperacaoMin}, mas não atinge os limites de Ligar`,
    };
  }
  return { classe: "neutro", motivo: `acerto ${pct(f.acerto)} ou recuperação ${Number.isFinite(rec) ? rec.toFixed(2) : "∞"} abaixo do mínimo de Cautela` };
}

export function validarFaixas(
  ops: readonly OperacaoCompacta[],
  parametros: ParametrosFaixas = PARAMETROS_FAIXAS_PADRAO,
): ResultadoFaixas {
  interface Acc {
    valores: number[];
    meses: Map<string, number>;
  }
  const acc = new Map<string, Acc>();
  for (const d of DIAS_UTEIS) for (const h of HORAS) acc.set(`${d}-${h}`, { valores: [], meses: new Map() });

  let nOperacoes = 0;
  for (const op of ops) {
    const a = acc.get(`${diaSemana(op)}-${hora(op)}`);
    if (!a) continue; // fora de seg-sex 9h-17h
    const liq = liquidoOperacao(op);
    a.valores.push(liq);
    const m = mesDe(diaOp(op));
    a.meses.set(m, (a.meses.get(m) ?? 0) + liq);
    nOperacoes += 1;
  }

  const parciais = [...acc.entries()].map(([chave, a]) => {
    const [d, h] = chave.split("-").map(Number);
    const n = a.valores.length;
    const nGain = a.valores.filter((v) => v > 0).length;
    const total = a.valores.reduce((s, v) => s + v, 0);
    const dd = drawdownPorOperacao(a.valores);
    const mesesPositivos = [...a.meses.values()].filter((v) => v > 0).length;
    return {
      diaSemana: d,
      hora: h,
      rotulo: rotuloFaixa(d, h),
      n,
      nGain,
      acerto: n > 0 ? nGain / n : 0,
      total,
      expectativa: n > 0 ? total / n : 0,
      dd,
      recuperacao: dd > 0 ? total / dd : total > 0 ? null : 0,
      mesesComDados: a.meses.size,
      mesesPositivos,
      estabilidade: a.meses.size > 0 ? mesesPositivos / a.meses.size : 0,
      confianca: Math.min(1, n / 100),
    };
  });

  const elegiveis = parciais.filter((f) => f.n >= parametros.amostraMinima);
  const medianaDd = mediana(elegiveis.filter((f) => f.dd > 0).map((f) => f.dd));

  const porExpectativa = [...elegiveis].sort((a, b) => a.expectativa - b.expectativa);
  const percentil = new Map<string, number>();
  porExpectativa.forEach((f, i) => {
    percentil.set(`${f.diaSemana}-${f.hora}`, porExpectativa.length > 1 ? i / (porExpectativa.length - 1) : f.expectativa > 0 ? 1 : 0);
  });

  const faixas: Faixa[] = parciais.map((f) => {
    const ddRelativo = medianaDd > 0 ? f.dd / medianaDd : null;
    const p = percentil.get(`${f.diaSemana}-${f.hora}`) ?? 0;
    let score = Math.round(50 * p + 30 * f.estabilidade + 20 * f.confianca);
    if (f.expectativa <= 0) score = Math.min(score, 40);
    const { classe, motivo } = classificarFaixa({ n: f.n, acerto: f.acerto, recuperacao: f.recuperacao, ddRelativo }, parametros);
    return { ...f, ddRelativo, percentil: p, score, classe, lote: classe ? LOTE_POR_CLASSE[classe] : 0, motivo };
  });

  const comDados = faixas.filter((f) => f.classe !== null);
  const contagem: Record<ClasseFaixa, number> = { ligar: 0, cautela: 0, neutro: 0, evitar: 0 };
  for (const f of comDados) contagem[f.classe as ClasseFaixa] += 1;

  const porScore = [...comDados].sort(
    (a, b) => b.score - a.score || (b.recuperacao ?? Infinity) - (a.recuperacao ?? Infinity) || b.expectativa - a.expectativa,
  );
  const ligar = porScore.filter((f) => f.classe === "ligar");
  const melhores = (ligar.length > 0 ? ligar : porScore).slice(0, 5);

  return {
    faixas,
    comDados,
    nOperacoes,
    contagem,
    melhores,
    insights: gerarInsights(comDados, contagem, porScore, parametros),
    medianaDd,
    parametros,
  };
}

function gerarInsights(
  comDados: Faixa[],
  contagem: Record<ClasseFaixa, number>,
  porScore: Faixa[],
  p: ParametrosFaixas,
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
    texto: `${contagem.ligar} ${contagem.ligar === 1 ? "faixa" : "faixas"} com classificação LIGAR: acerto ≥ ${pct(p.ligar.acertoMin)}, recuperação ≥ ${p.ligar.recuperacaoMin} e DD relativo ≤ ${p.ligar.ddRelativoMax}x.`,
  });
  insights.push({
    chave: "evitar",
    texto: `${contagem.evitar} ${contagem.evitar === 1 ? "faixa identificada" : "faixas identificadas"} como EVITAR por acerto, recuperação ou drawdown fora do limite.`,
  });

  const abertura = comDados.filter((f) => (f.hora === 9 || f.hora === 10) && f.ddRelativo !== null);
  if (abertura.length > 0) {
    const media = abertura.reduce((s, f) => s + (f.ddRelativo ?? 0), 0) / abertura.length;
    if (media > p.ligar.ddRelativoMax) {
      insights.push({
        chave: "abertura",
        texto: `Faixas de abertura (9h–10h) apresentam rebaixamento relativo elevado (média ${media.toFixed(2)}x).`,
      });
    }
  }

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
