import { describe, expect, it } from "vitest";
import type { FiltrosUrl } from "./params";
import { descreverFiltro, resumirFiltro, type DiaDoResumo } from "./resumo-do-filtro";

const SEM_FILTRO: FiltrosUrl = { de: null, ate: null, lado: null, resultado: null };

/** Um pregão: `ganhos` e `perdas` são os resultados de cada operação, já descontado o custo de `custo` cada. */
function pregao(dia: string, ganhos: number[], perdas: number[], custo = 0.25): DiaDoResumo {
  const todas = [...ganhos, ...perdas];
  const liquido = todas.reduce((s, v) => s + v, 0);
  const custos = todas.length * custo;
  return {
    dia,
    n_operacoes: todas.length,
    n_gain: ganhos.length,
    n_loss: perdas.length,
    resultado_brl_por_contrato: liquido + custos,
    custos_brl_por_contrato: custos,
    soma_gain_brl_por_contrato: ganhos.reduce((s, v) => s + v, 0),
    soma_loss_brl_por_contrato: perdas.reduce((s, v) => s + v, 0),
    maior_loss_brl_por_contrato: perdas.length > 0 ? Math.min(...perdas) : 0,
  };
}

const DIAS = [
  pregao("2026-10-30", [29.75, 29.75], [-41.25]),
  pregao("2026-11-03", [30.75], []),
  pregao("2026-11-04", [29.75], [-96.25, -5.25]),
];

describe("resumirFiltro", () => {
  it("sem filtro soma tudo, já descontados os custos, e acha a pior operação", () => {
    const r = resumirFiltro(DIAS, SEM_FILTRO);
    expect(r?.operacoes).toBe(7);
    expect(r?.soma).toBeCloseTo(29.75 + 29.75 - 41.25 + 30.75 + 29.75 - 96.25 - 5.25, 6);
    expect(r?.pior).toBe(-96.25);
  });

  it("respeita o período, com as duas pontas incluídas", () => {
    const r = resumirFiltro(DIAS, { ...SEM_FILTRO, de: "2026-10-30", ate: "2026-11-03" });
    expect(r?.operacoes).toBe(4);
    expect(r?.soma).toBeCloseTo(49, 6);
    expect(r?.pior).toBe(-41.25);
    expect(resumirFiltro(DIAS, { ...SEM_FILTRO, de: "2026-11-04" })?.operacoes).toBe(3);
    expect(resumirFiltro(DIAS, { ...SEM_FILTRO, ate: "2026-10-30" })?.operacoes).toBe(3);
  });

  it("só as que ganharam: conta e soma os ganhos, sem pior operação", () => {
    const r = resumirFiltro(DIAS, { ...SEM_FILTRO, resultado: "gain" });
    expect(r?.operacoes).toBe(4);
    expect(r?.soma).toBeCloseTo(120, 6);
    expect(r?.pior).toBeNull();
  });

  it("só as que perderam: conta e soma as perdas", () => {
    const r = resumirFiltro(DIAS, { ...SEM_FILTRO, resultado: "loss" });
    expect(r?.operacoes).toBe(3);
    expect(r?.soma).toBeCloseTo(-142.75, 6);
    expect(r?.pior).toBe(-96.25);
  });

  it("período sem perda não tem pior operação", () => {
    expect(resumirFiltro(DIAS, { ...SEM_FILTRO, de: "2026-11-03", ate: "2026-11-03" })?.pior).toBeNull();
  });

  it("com filtro de lado não arrisca um número: a série diária não separa compra de venda", () => {
    expect(resumirFiltro(DIAS, { ...SEM_FILTRO, lado: "compra" })).toBeNull();
    expect(resumirFiltro(DIAS, { ...SEM_FILTRO, lado: "venda", resultado: "loss" })).toBeNull();
  });

  it("sem pregão no filtro devolve zero operações", () => {
    expect(resumirFiltro(DIAS, { ...SEM_FILTRO, de: "2027-01-01" })).toEqual({ operacoes: 0, soma: 0, pior: null });
  });
});

describe("descreverFiltro", () => {
  it("sem filtro não diz nada", () => {
    expect(descreverFiltro(SEM_FILTRO)).toBe("");
  });

  it("diz o lado e o resultado em palavras comuns", () => {
    expect(descreverFiltro({ ...SEM_FILTRO, lado: "compra" })).toBe("de compra");
    expect(descreverFiltro({ ...SEM_FILTRO, resultado: "gain" })).toBe("com ganho");
    expect(descreverFiltro({ ...SEM_FILTRO, lado: "venda", resultado: "loss" })).toBe("de venda com perda");
  });

  it("diz o período conforme as pontas preenchidas", () => {
    expect(descreverFiltro({ ...SEM_FILTRO, de: "2026-10-01", ate: "2026-10-31" })).toBe("de 01/10/2026 a 31/10/2026");
    expect(descreverFiltro({ ...SEM_FILTRO, de: "2026-10-01" })).toBe("desde 01/10/2026");
    expect(descreverFiltro({ ...SEM_FILTRO, ate: "2026-10-31" })).toBe("até 31/10/2026");
    expect(descreverFiltro({ ...SEM_FILTRO, de: "2026-11-18", ate: "2026-11-18" })).toBe("em 18/11/2026");
  });

  it("separa o tipo de operação do período com vírgula", () => {
    expect(descreverFiltro({ de: "2026-10-01", ate: "2026-10-31", lado: "compra", resultado: "loss" })).toBe(
      "de compra com perda, de 01/10/2026 a 31/10/2026",
    );
  });
});
