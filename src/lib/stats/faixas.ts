import { formatarBRL, formatarNumero, formatarPct } from "@/lib/formato";
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
 *
 * 25/11/2026 (ficha Mesa; Lucas: "quero algo intuitivo, fácil de entender, para um leigo está muito difícil
 * de entender"): os textos que saem daqui (`motivo`, `insights` e DESCRICAO_CLASSE) são frases com as palavras
 * da tela (DESIGN.md, seção 7) e os números em pt-BR. Até então vinham com sigla e símbolo ("DD relativo 0.6x ≤
 * 4x", "LIGAR", "faixas", "rebaixamento relativo"), e por isso a aba Melhores horários os tinha tirado da tela.
 * Na frase, a consistência é a parte das operações que terminou com ganho; a recuperação, o quanto o resultado
 * cobre a maior queda; o DD relativo, a maior queda comparada com a típica dos dias e horários; a faixa, um dia
 * e horário; o score, a nota; e o lote, o tamanho da posição. As regras, os limites e os campos numéricos são
 * os mesmos: só mudou o que se lê.
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

const tamanhoDaPosicao = (c: ClasseFaixa) => `tamanho sugerido da posição: ${formatarPct(LOTE_POR_CLASSE[c], 0)}`;

/**
 * O que a classe quer dizer e o tamanho sugerido da posição. Até 25/11/2026 eram ordens em jargão ("Operar com
 * confiança · lote 100%", "Reduzir lote · lote 60%", "Margem mínima · lote 35%", "Desligar faixa · lote 0%"); o
 * site descreve a regra, não manda operar. O percentual sai de LOTE_POR_CLASSE, para os dois não divergirem.
 */
export const DESCRICAO_CLASSE: Record<ClasseFaixa, string> = {
  ligar: `Passou em todos os critérios · ${tamanhoDaPosicao("ligar")}`,
  cautela: `Passou em parte dos critérios · ${tamanhoDaPosicao("cautela")}`,
  neutro: `Abaixo do mínimo de Cautela · ${tamanhoDaPosicao("neutro")}`,
  evitar: `Caiu em um dos limites para não operar · ${tamanhoDaPosicao("evitar")}`,
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
  /** a regra que decidiu a classificação, numa frase de leigo: sem sigla nem símbolo desde 25/11/2026 (ver classificarFaixa) */
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

// ── as frases ──────────────────────────────────────────────────────────────────
// Os pedaços com que `motivo` e `insights` são escritos: porcentagem sem casas ("58%"), "vez" e "vezes" com a
// vírgula do pt-BR ("1,5 vez", "4 vezes") e as três medidas da regra em palavras.

const pct = (v: number) => formatarPct(v, 0);

/** "4 vezes", "1,5 vez", "0,6 vez": uma casa, e o plural pelo número já arredondado */
function vezes(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${formatarNumero(r, Number.isInteger(r) ? 0 : 1)} ${r < 2 ? "vez" : "vezes"}`;
}

/** "a", "a e b", "a, b e c" */
const lista = (itens: readonly string[]) => (itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`);

/** A porcentagem ao lado do limite que ela não alcançou, com as casas que bastam para as duas não saírem iguais ("57,9%" contra "58%"). */
function pctContra(v: number, limite: number): string {
  for (const casas of [0, 1]) {
    const texto = formatarPct(v, casas);
    if (texto !== formatarPct(limite, casas)) return texto;
  }
  return formatarPct(v, 2);
}

/** A consistência em palavras: a parte das operações que terminou com ganho. */
function ganhos(acerto: number): string {
  if (acerto >= 1) return "todas as operações terminaram com ganho";
  if (acerto <= 0) return "nenhuma operação terminou com ganho";
  return `${pct(acerto)} das operações terminaram com ganho`;
}

/** A recuperação em palavras: o quanto o resultado cobre a maior queda. Infinita = não houve queda. */
function cobertura(rec: number): string {
  if (rec === Number.POSITIVE_INFINITY) return "não houve queda no caminho";
  if (rec < 0) return "a soma das operações deu perda";
  if (rec === 0) return "a soma das operações não deu ganho";
  if (rec < 1) return `o resultado cobre ${pct(rec)} da maior queda`;
  return Math.round(rec * 10) / 10 === 1 ? "o resultado cobre a maior queda inteira" : `o resultado é ${vezes(rec)} a maior queda`;
}

/** A recuperação que ficou abaixo de um limite: "o resultado cobre só 30% da maior queda"; sem ganho, diz isso. */
function coberturaBaixa(rec: number, limite: number): string {
  return rec <= 0 ? cobertura(rec) : `o resultado cobre só ${pctContra(rec, limite)} da maior queda`;
}

/** O DD relativo em palavras: a maior queda comparada com a típica (a do meio) dos dias e horários. */
function quedaContraATipica(ddr: number, sujeito = "a maior queda"): string {
  if (ddr <= 1) return `${sujeito} não passou da típica dos dias e horários`;
  if (Math.round(ddr * 10) / 10 === 1) return `${sujeito} ficou pouco acima da típica dos dias e horários`;
  return `${sujeito} foi ${vezes(ddr)} a típica dos dias e horários`;
}

/**
 * Aplica os parâmetros a uma faixa. `recuperacao` null = infinita.
 *
 * O `motivo` é a regra que decidiu, numa frase curta para quem nunca ouviu os nomes das medidas (25/11/2026,
 * ficha Mesa), em minúscula e sem ponto final, para vir depois do nome da classe. Exemplos:
 *   sem classe  "poucas operações para confiar: 12, e o mínimo é 40"
 *   Evitar      "só 30% das operações terminaram com ganho (o limite é 38%)"
 *   Ligar       "62% das operações terminaram com ganho, o resultado é 3,2 vezes a maior queda e ela não passou da
 *               típica dos dias e horários"
 *   Cautela     "50% das operações terminaram com ganho e o resultado é 6,3 vezes a maior queda; para Ligar faltou
 *               chegar a 58% das operações com ganho"
 *   Neutro      "só 45% das operações terminaram com ganho (Cautela pede 48%)"
 * Até então era a conta em símbolos ("acerto 60% ≥ 58%, recuperação 1.00 ≥ 0.85, DD relativo 3.0x ≤ 4x"). A
 * ordem das regras e as comparações não mudaram.
 */
export function classificarFaixa(
  f: { n: number; acerto: number; recuperacao: number | null; ddRelativo: number | null },
  p: ParametrosFaixas = PARAMETROS_FAIXAS_PADRAO,
): { classe: ClasseFaixa | null; motivo: string } {
  if (f.n < p.amostraMinima) {
    return {
      classe: null,
      motivo:
        f.n <= 0
          ? "nenhuma operação neste dia e horário"
          : `poucas operações para confiar: ${formatarNumero(f.n)}, e o mínimo é ${formatarNumero(p.amostraMinima)}`,
    };
  }
  const rec = f.recuperacao ?? Number.POSITIVE_INFINITY;
  const ddr = f.ddRelativo ?? 0;

  if (f.acerto < p.evitar.acertoMax) {
    const quantas = f.acerto <= 0 ? ganhos(f.acerto) : `só ${pctContra(f.acerto, p.evitar.acertoMax)} das operações terminaram com ganho`;
    return { classe: "evitar", motivo: `${quantas} (o limite é ${pct(p.evitar.acertoMax)})` };
  }
  if (rec < p.evitar.recuperacaoMax) {
    // sem ganho nenhum a frase já diz tudo; com ganho pequeno, vai o limite ao lado
    return { classe: "evitar", motivo: rec <= 0 ? cobertura(rec) : `${coberturaBaixa(rec, p.evitar.recuperacaoMax)} (o limite é ${pct(p.evitar.recuperacaoMax)})` };
  }
  if (ddr > p.evitar.ddRelativoMin) {
    return { classe: "evitar", motivo: `${quedaContraATipica(ddr)} (o limite é ${vezes(p.evitar.ddRelativoMin)})` };
  }

  if (f.acerto >= p.ligar.acertoMin && rec >= p.ligar.recuperacaoMin && ddr <= p.ligar.ddRelativoMax) {
    // sem queda não há o que comparar com a típica; sem a típica (ddRelativo nulo), a frase não a cita. "ela" é a
    // maior queda, que a parte anterior da frase acabou de citar (só não cita quando o resultado não é positivo)
    const comTipica = Number.isFinite(rec) && f.ddRelativo !== null;
    const tipica = comTipica ? [quedaContraATipica(ddr, rec > 0 ? "ela" : "a maior queda")] : [];
    return { classe: "ligar", motivo: lista([ganhos(f.acerto), cobertura(rec), ...tipica]) };
  }
  if (f.acerto >= p.cautela.acertoMin && rec >= p.cautela.recuperacaoMin) {
    // o que faltou para Ligar, pelas mesmas três comparações de cima
    const faltou: string[] = [];
    if (!(f.acerto >= p.ligar.acertoMin)) faltou.push(`chegar a ${pct(p.ligar.acertoMin)} das operações com ganho`);
    if (!(rec >= p.ligar.recuperacaoMin)) faltou.push(`o resultado cobrir ${pct(p.ligar.recuperacaoMin)} da maior queda`);
    if (!(ddr <= p.ligar.ddRelativoMax)) faltou.push(`a maior queda ficar em até ${vezes(p.ligar.ddRelativoMax)} a típica dos dias e horários`);
    const passou = `${ganhos(f.acerto)} e ${cobertura(rec)}`;
    return { classe: "cautela", motivo: faltou.length > 0 ? `${passou}; para Ligar faltou ${lista(faltou)}` : passou };
  }
  // o que ficou abaixo do mínimo de Cautela (pelo menos uma das duas medidas)
  const abaixo: string[] = [];
  if (!(f.acerto >= p.cautela.acertoMin)) {
    abaixo.push(`${f.acerto <= 0 ? ganhos(f.acerto) : `só ${pctContra(f.acerto, p.cautela.acertoMin)} das operações terminaram com ganho`} (Cautela pede ${pct(p.cautela.acertoMin)})`);
  }
  if (!(rec >= p.cautela.recuperacaoMin)) {
    abaixo.push(rec <= 0 ? cobertura(rec) : `${coberturaBaixa(rec, p.cautela.recuperacaoMin)} (Cautela pede ${pct(p.cautela.recuperacaoMin)})`);
  }
  return { classe: "neutro", motivo: abaixo.length > 0 ? lista(abaixo) : "abaixo do mínimo de Cautela" };
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

  // 25/11/2026 (ficha Mesa): as frases abaixo falam "dia e horário", "nota", "maior queda" e "com ganho", com os
  // números em pt-BR; as chaves e as condições de cada uma não mudaram. Eram "As melhores faixas se concentram...",
  // "... apresentam a maior estabilidade histórica", "N faixas com classificação LIGAR: acerto ≥ 58%, recuperação ≥
  // 0.85 e DD relativo ≤ 4x", "... identificadas como EVITAR por acerto, recuperação ou drawdown fora do limite",
  // "Faixas de abertura (9h–10h) apresentam rebaixamento relativo elevado (média 4.52x)" e "... têm a pior
  // expectativa média".
  const top = porScore.slice(0, 3);
  const horasTop = [...new Set(top.map((f) => f.hora))].sort((a, b) => a - b);
  if (horasTop.length > 0) {
    insights.push({
      chave: "horas",
      texto: `As maiores notas estão nas operações que começam ${lista(horasTop.map((h) => `às ${h}h`))}.`,
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
      // a estabilidade é a parte dos meses que terminou com ganho
      texto: `${NOME_DIA[diasOrdenados[0].d]} e ${NOME_DIA[diasOrdenados[1].d].toLowerCase()} são os dias da semana em que mais meses terminaram com ganho.`,
    });
  }

  // "Nenhum" em palavras, nunca "0 dias e horários"
  const ficaram = (n: number, classe: ClasseFaixa) =>
    n === 0
      ? `Nenhum dia e horário ficou como ${ROTULO_CLASSE[classe]}`
      : n === 1
        ? `1 dia e horário ficou como ${ROTULO_CLASSE[classe]}`
        : `${formatarNumero(n)} dias e horários ficaram como ${ROTULO_CLASSE[classe]}`;
  insights.push({
    chave: "ligar",
    texto: `${ficaram(contagem.ligar, "ligar")}. Para isso, pelo menos ${pct(p.ligar.acertoMin)} das operações têm de terminar com ganho, o resultado tem de cobrir pelo menos ${pct(p.ligar.recuperacaoMin)} da maior queda e ela não pode passar de ${vezes(p.ligar.ddRelativoMax)} a típica dos dias e horários.`,
  });
  insights.push({
    chave: "evitar",
    texto:
      contagem.evitar === 0
        ? `${ficaram(0, "evitar")}.`
        : `${ficaram(contagem.evitar, "evitar")}: poucas operações com ganho, resultado que cobre pouco da maior queda ou queda muito acima da típica.`,
  });

  const abertura = comDados.filter((f) => (f.hora === 9 || f.hora === 10) && f.ddRelativo !== null);
  if (abertura.length > 0) {
    const media = abertura.reduce((s, f) => s + (f.ddRelativo ?? 0), 0) / abertura.length;
    if (media > p.ligar.ddRelativoMax) {
      insights.push({
        chave: "abertura",
        texto: `Nas operações que começam às 9h e às 10h a maior queda é grande: em média, ${vezes(media)} a típica dos dias e horários.`,
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
      texto: `As operações que começam às ${pior.h}h têm o pior resultado médio: ${formatarBRL(pior.expectativa, { sinal: true })} por operação.`,
    });
  }

  return insights;
}
