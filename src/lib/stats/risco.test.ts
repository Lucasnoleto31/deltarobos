import { describe, expect, it } from "vitest";
import {
  calmar,
  capitalMinimoRecomendado,
  distribuicaoProfundidade,
  episodiosDrawdown,
  recoveryFactor,
  resumoDiario,
  riscoDeRuina,
  tempoEmDrawdown,
  ulcerIndex,
} from "./risco";
import { curvaAcumulada } from "./serie";
import type { LinhaDiaria, OpcoesSerie } from "./tipos";

function linha(dia: string, brl: number): LinhaDiaria {
  return {
    dia,
    pontos_por_contrato: brl / 0.2,
    resultado_brl_por_contrato: brl,
    custos_brl_por_contrato: 0,
    n_operacoes: 1,
    n_gain: brl > 0 ? 1 : 0,
    n_loss: brl < 0 ? 1 : 0,
    soma_gain_brl_por_contrato: brl > 0 ? brl : 0,
    soma_loss_brl_por_contrato: brl < 0 ? brl : 0,
    maior_gain_brl_por_contrato: brl > 0 ? brl : 0,
    maior_loss_brl_por_contrato: brl < 0 ? brl : 0,
  };
}

const o: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: 0.2 };
const curva = curvaAcumulada(
  [
    linha("2026-09-01", 100), // pico 100
    linha("2026-09-02", -30), // dd 30
    linha("2026-09-03", 40), // recupera (110)
    linha("2026-09-04", -80), // dd 80
    linha("2026-09-07", -20), // dd 100 (fundo)
    linha("2026-09-08", 50), // ainda em dd 50
  ],
  o,
);

describe("episodiosDrawdown", () => {
  it("separa episódios, ordena pelo maior e marca o aberto", () => {
    const eps = episodiosDrawdown(curva);
    expect(eps).toHaveLength(2);
    expect(eps[0]).toMatchObject({ inicio: "2026-09-03", fundo: "2026-09-07", recuperacao: null, valor: 100, diasAteFundo: 4, diasAteRecuperar: null });
    expect(eps[1]).toMatchObject({ inicio: "2026-09-01", fundo: "2026-09-02", recuperacao: "2026-09-03", valor: 30, diasAteFundo: 1, diasAteRecuperar: 2 });
  });

  it("limite, todos e curva vazia", () => {
    expect(episodiosDrawdown([])).toEqual([]);
    expect(episodiosDrawdown(curva, 1)).toHaveLength(1);
    expect(episodiosDrawdown(curva, Infinity)).toHaveLength(2);
  });
});

describe("índices de risco", () => {
  it("calmar e recovery factor", () => {
    // acumulado 60 em 6 dias -> anualizado 2520; dd 100
    expect(calmar(60, 6, 100)).toBeCloseTo(25.2);
    expect(calmar(60, 6, 0)).toBeNull();
    expect(recoveryFactor(60, 100)).toBe(0.6);
    expect(recoveryFactor(60, 0)).toBeNull();
  });

  it("ulcer index e tempo em drawdown", () => {
    // drawdowns: 0, -30, 0, -80, -100, -50
    const esperado = Math.sqrt((0 + 900 + 0 + 6400 + 10000 + 2500) / 6);
    expect(ulcerIndex(curva)).toBeCloseTo(esperado);
    // em % de capital 1000: dd/10
    expect(ulcerIndex(curva, 1000)).toBeCloseTo(esperado / 10);
    expect(tempoEmDrawdown(curva)).toBeCloseTo(4 / 6);
    expect(tempoEmDrawdown([])).toBe(0);
  });

  it("risco de ruína", () => {
    expect(riscoDeRuina({ taxaAcerto: 0.5, payoff: 1, capital: 1000, perdaMedia: -50 })).toBe(1); // sem edge
    const bom = riscoDeRuina({ taxaAcerto: 0.6, payoff: 1.5, capital: 1000, perdaMedia: -50 });
    expect(bom).not.toBeNull();
    expect(bom!).toBeGreaterThan(0);
    expect(bom!).toBeLessThan(0.001);
    expect(riscoDeRuina({ taxaAcerto: null, payoff: 1, capital: 1000, perdaMedia: -50 })).toBeNull();
    expect(riscoDeRuina({ taxaAcerto: 0.6, payoff: 1.5, capital: null, perdaMedia: -50 })).toBeNull();
  });

  it("distribuição por profundidade", () => {
    const eps = episodiosDrawdown(curva, Infinity);
    const pct = distribuicaoProfundidade(eps, 1000); // 10% (faixa 10–20%) e 3% (faixa 2–5%)
    expect(pct.map((f) => f.n)).toEqual([0, 1, 0, 1, 0, 0]);
    const brl = distribuicaoProfundidade(eps); // 100 e 30
    expect(brl.map((f) => f.n)).toEqual([1, 1, 0, 0, 0, 0]);
  });

  it("resumo diário", () => {
    const r = resumoDiario(curva, episodiosDrawdown(curva, Infinity));
    expect(r.nDias).toBe(6);
    expect(r.diasNegativos).toBe(3);
    expect(r.maiorSequenciaNegativa).toBe(2);
    expect(r.recuperacaoMediaDias).toBe(2);
    expect(r.episodiosRecuperados).toBe(1);
    expect(r.volatilidade).toBeGreaterThan(0);
  });
});

describe("capitalMinimoRecomendado", () => {
  it("margem + drawdown x fator", () => {
    expect(capitalMinimoRecomendado(1000, 500, 1.5)).toBe(1750);
  });
});
