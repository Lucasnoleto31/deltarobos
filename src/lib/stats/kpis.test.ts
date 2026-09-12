import { describe, expect, it } from "vitest";
import { calcularKpis, capitalMinimoRecomendado } from "./kpis";
import type { LinhaDiaria, OpcoesSerie } from "./tipos";

/** Dia com várias operações: gains e losses líquidos informados direto. */
function dia(
  d: string,
  p: { gains: number[]; losses: number[]; custosPorOp?: number },
): LinhaDiaria {
  const custosPorOp = p.custosPorOp ?? 0;
  const n = p.gains.length + p.losses.length;
  const liquido = p.gains.reduce((s, g) => s + g, 0) + p.losses.reduce((s, l) => s + l, 0);
  const custos = custosPorOp * n;
  return {
    dia: d,
    pontos_por_contrato: (liquido + custos) / 0.2,
    resultado_brl_por_contrato: liquido + custos, // bruto
    custos_brl_por_contrato: custos,
    n_operacoes: n,
    n_gain: p.gains.length,
    n_loss: p.losses.length,
    soma_gain_brl_por_contrato: p.gains.reduce((s, g) => s + g, 0),
    soma_loss_brl_por_contrato: p.losses.reduce((s, l) => s + l, 0),
    maior_gain_brl_por_contrato: Math.max(0, ...p.gains),
    maior_loss_brl_por_contrato: Math.min(0, ...p.losses),
  };
}

const liquidoBrl: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: 0.2 };

const serie: LinhaDiaria[] = [
  dia("2026-08-28", { gains: [100, 50], losses: [-30] }), // +120
  dia("2026-08-31", { gains: [], losses: [-40, -20] }), // -60
  dia("2026-09-01", { gains: [80], losses: [] }), // +80
  dia("2026-09-02", { gains: [], losses: [-10] }), // -10
  dia("2026-09-03", { gains: [], losses: [-30] }), // -30
  dia("2026-09-04", { gains: [200], losses: [] }), // +200 (hoje)
];

describe("calcularKpis", () => {
  const k = calcularKpis(serie, liquidoBrl, { hoje: "2026-09-04", capitalReferencia: 5000 });

  it("acumulado, hoje, mês e ano", () => {
    expect(k.acumulado).toBe(300);
    expect(k.hoje).toBe(200);
    expect(k.mes).toBe(240); // setembro: 80 - 10 - 30 + 200
    expect(k.ano).toBe(300);
  });

  it("média mensal divide pelos meses com pregão", () => {
    expect(k.nMeses).toBe(2);
    expect(k.mediaMensal).toBe(150);
  });

  it("contagens de operações", () => {
    expect(k.nOperacoes).toBe(9);
    expect(k.nGain).toBe(4);
    expect(k.nLoss).toBe(5);
    expect(k.taxaAcerto).toBeCloseTo(4 / 9);
    expect(k.mediaOperacoesDia).toBe(1.5);
  });

  it("fator de lucro e payoff", () => {
    // gains 430, losses 130
    expect(k.fatorLucro).toBeCloseTo(430 / 130);
    // média gain 107,5 / média loss 26
    expect(k.payoff).toBeCloseTo(107.5 / 26);
  });

  it("dias positivos, negativos e sequências", () => {
    expect(k.diasPositivos).toBe(3);
    expect(k.diasNegativos).toBe(3);
    expect(k.maiorSequenciaDiasNegativos).toBe(2);
    expect(k.maiorSequenciaDiasPositivos).toBe(1);
  });

  it("melhor e pior dia", () => {
    expect(k.melhorDia).toEqual({ dia: "2026-09-04", valor: 200 });
    expect(k.piorDia).toEqual({ dia: "2026-08-31", valor: -60 });
  });

  it("drawdown máximo e % sobre capital", () => {
    // curva: 120, 60, 140, 130, 100, 300 -> maior queda 140 -> 100 = 40? não: 120 -> 60 = 60
    expect(k.drawdown.valor).toBe(60);
    expect(k.drawdown.inicio).toBe("2026-08-28");
    expect(k.drawdown.fundo).toBe("2026-08-31");
    expect(k.drawdown.recuperacao).toBe("2026-09-01");
    expect(k.drawdownMaximoPct).toBeCloseTo(60 / 5000);
  });

  it("sem capital de referência não calcula %", () => {
    const k2 = calcularKpis(serie, liquidoBrl, { hoje: "2026-09-04" });
    expect(k2.drawdownMaximoPct).toBeNull();
  });

  it("série vazia devolve zeros e nulls", () => {
    const k0 = calcularKpis([], liquidoBrl, { hoje: "2026-09-04" });
    expect(k0.acumulado).toBe(0);
    expect(k0.taxaAcerto).toBeNull();
    expect(k0.fatorLucro).toBeNull();
    expect(k0.payoff).toBeNull();
    expect(k0.melhorDia).toBeNull();
    expect(k0.drawdown.valor).toBe(0);
  });

  it("em pontos converte as somas de gain/loss", () => {
    const kp = calcularKpis(serie, { base: "liquido", unidade: "pontos", valorPonto: 0.2 }, {
      hoje: "2026-09-04",
    });
    expect(kp.acumulado).toBeCloseTo(1500);
    // fator de lucro é adimensional: não muda com a unidade
    expect(kp.fatorLucro).toBeCloseTo(430 / 130);
  });

  it("sem loss o fator de lucro é null (infinito)", () => {
    const k1 = calcularKpis([dia("2026-09-01", { gains: [10], losses: [] })], liquidoBrl, {
      hoje: "2026-09-01",
    });
    expect(k1.fatorLucro).toBeNull();
    expect(k1.payoff).toBeNull();
    expect(k1.taxaAcerto).toBe(1);
  });
});

describe("capitalMinimoRecomendado", () => {
  it("margem + drawdown x fator", () => {
    expect(capitalMinimoRecomendado(1000, 500, 1.5)).toBe(1750);
    expect(capitalMinimoRecomendado(null, 500)).toBe(750);
  });
});
