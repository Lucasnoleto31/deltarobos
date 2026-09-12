import { diffDias } from "./periodos";
import type { PontoCurva } from "./tipos";

export { capitalMinimoRecomendado } from "./kpis";

/** Dias de pregão num ano, pra anualizar. */
export const DIAS_PREGAO_ANO = 252;

export interface EpisodioDrawdown {
  /** último dia no pico antes da queda */
  inicio: string;
  fundo: string;
  /** primeiro dia de volta ao pico; null = ainda em recuperação */
  recuperacao: string | null;
  /** magnitude (positiva) */
  valor: number;
  diasAteFundo: number;
  diasAteRecuperar: number | null;
}

/** Os N maiores drawdowns da curva, do maior pro menor. `limite` Infinity = todos. */
export function episodiosDrawdown(curva: readonly PontoCurva[], limite = 5): EpisodioDrawdown[] {
  const episodios: EpisodioDrawdown[] = [];
  if (curva.length === 0) return episodios;

  let ultimoPico = curva[0].dia;
  let emQueda = false;
  let inicio = ultimoPico;
  let fundo = ultimoPico;
  let menor = 0;

  for (const p of curva) {
    if (p.drawdown < 0) {
      if (!emQueda) {
        emQueda = true;
        inicio = ultimoPico;
        fundo = p.dia;
        menor = p.drawdown;
      } else if (p.drawdown < menor) {
        menor = p.drawdown;
        fundo = p.dia;
      }
    } else {
      if (emQueda) {
        episodios.push({
          inicio,
          fundo,
          recuperacao: p.dia,
          valor: Math.abs(menor),
          diasAteFundo: diffDias(inicio, fundo),
          diasAteRecuperar: diffDias(inicio, p.dia),
        });
        emQueda = false;
      }
      ultimoPico = p.dia;
    }
  }

  if (emQueda) {
    episodios.push({
      inicio,
      fundo,
      recuperacao: null,
      valor: Math.abs(menor),
      diasAteFundo: diffDias(inicio, fundo),
      diasAteRecuperar: null,
    });
  }

  const ordenados = episodios.sort((a, b) => b.valor - a.valor);
  return Number.isFinite(limite) ? ordenados.slice(0, limite) : ordenados;
}

/** Retorno anualizado: acumulado × 252 / dias de pregão. */
export function retornoAnualizado(acumulado: number, nDias: number): number {
  return nDias > 0 ? (acumulado * DIAS_PREGAO_ANO) / nDias : 0;
}

/** Calmar = retorno anualizado / drawdown máximo (mesmas unidades). null sem drawdown. */
export function calmar(acumulado: number, nDias: number, drawdownMaximo: number): number | null {
  if (drawdownMaximo <= 0 || nDias === 0) return null;
  return retornoAnualizado(acumulado, nDias) / drawdownMaximo;
}

/** Recovery factor = resultado do período / drawdown máximo. null sem drawdown. */
export function recoveryFactor(acumulado: number, drawdownMaximo: number): number | null {
  if (drawdownMaximo <= 0) return null;
  return acumulado / drawdownMaximo;
}

/**
 * Ulcer index: raiz da média dos quadrados do drawdown dia a dia.
 * Com capital, em % do capital; sem capital, nas unidades da curva.
 */
export function ulcerIndex(curva: readonly PontoCurva[], capital?: number | null): number {
  if (curva.length === 0) return 0;
  const base = capital && capital > 0 ? capital / 100 : 1;
  const soma = curva.reduce((s, p) => s + (p.drawdown / base) ** 2, 0);
  return Math.sqrt(soma / curva.length);
}

/** Fração dos dias de pregão em que a curva estava abaixo do pico. */
export function tempoEmDrawdown(curva: readonly PontoCurva[]): number {
  if (curva.length === 0) return 0;
  return curva.filter((p) => p.drawdown < 0).length / curva.length;
}

/**
 * Risco de ruína (aproximação clássica de ruína do apostador):
 *   E = acerto × payoff − (1 − acerto)     (expectativa por unidade de risco)
 *   unidades = capital / perda média
 *   RoR = ((1 − E) / (1 + E)) ^ unidades   (E ≤ 0 → 100%)
 */
export function riscoDeRuina(p: {
  taxaAcerto: number | null;
  payoff: number | null;
  capital: number | null | undefined;
  perdaMedia: number;
}): number | null {
  if (p.taxaAcerto === null || p.payoff === null || !p.capital || p.capital <= 0) return null;
  const perda = Math.abs(p.perdaMedia);
  if (perda === 0) return null;
  const e = p.taxaAcerto * p.payoff - (1 - p.taxaAcerto);
  if (e <= 0) return 1;
  const unidades = p.capital / perda;
  const base = (1 - e) / (1 + e);
  return Math.min(1, Math.max(0, base ** unidades));
}

export interface FaixaProfundidade {
  rotulo: string;
  n: number;
}

/** Quantos episódios caem em cada faixa de profundidade (% do capital, ou unidades da curva). */
export function distribuicaoProfundidade(
  episodios: readonly EpisodioDrawdown[],
  capital?: number | null,
): FaixaProfundidade[] {
  const emPct = Boolean(capital && capital > 0);
  const limites = emPct ? [2, 5, 10, 20, 35] : [100, 250, 500, 1000, 2500];
  const rotulos = emPct
    ? ["0–2%", "2–5%", "5–10%", "10–20%", "20–35%", ">35%"]
    : ["até 100", "100–250", "250–500", "500–1.000", "1.000–2.500", ">2.500"];
  const faixas = rotulos.map((rotulo) => ({ rotulo, n: 0 }));
  for (const e of episodios) {
    const v = emPct ? (e.valor / (capital as number)) * 100 : e.valor;
    let i = limites.findIndex((l) => v < l);
    if (i < 0) i = limites.length;
    faixas[i].n += 1;
  }
  return faixas;
}

export interface ResumoDiario {
  nDias: number;
  diasNegativos: number;
  /** 0..1 */
  fracaoNegativa: number;
  maiorSequenciaNegativa: number;
  /** desvio padrão do resultado diário */
  volatilidade: number;
  /** média de dias corridos até recuperar, nos episódios recuperados */
  recuperacaoMediaDias: number | null;
  episodiosRecuperados: number;
}

export function resumoDiario(curva: readonly PontoCurva[], episodios: readonly EpisodioDrawdown[]): ResumoDiario {
  const n = curva.length;
  let neg = 0;
  let seq = 0;
  let maiorSeq = 0;
  let soma = 0;
  for (const p of curva) {
    soma += p.valor;
    if (p.valor < 0) {
      neg += 1;
      seq += 1;
      if (seq > maiorSeq) maiorSeq = seq;
    } else {
      seq = 0;
    }
  }
  const media = n > 0 ? soma / n : 0;
  const variancia = n > 1 ? curva.reduce((s, p) => s + (p.valor - media) ** 2, 0) / (n - 1) : 0;
  const recuperados = episodios.filter((e) => e.diasAteRecuperar !== null);
  return {
    nDias: n,
    diasNegativos: neg,
    fracaoNegativa: n > 0 ? neg / n : 0,
    maiorSequenciaNegativa: maiorSeq,
    volatilidade: Math.sqrt(variancia),
    recuperacaoMediaDias:
      recuperados.length > 0
        ? recuperados.reduce((s, e) => s + (e.diasAteRecuperar ?? 0), 0) / recuperados.length
        : null,
    episodiosRecuperados: recuperados.length,
  };
}
