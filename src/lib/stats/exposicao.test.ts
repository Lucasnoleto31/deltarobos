import { describe, expect, it } from "vitest";
import {
  excursaoDaOperacao,
  exposicaoDoDia,
  mepMenDoDia,
  posicaoDoExtremo,
  temMedicaoEA,
  type ExposicaoHoje,
} from "./exposicao";

// o exemplo do contrato do EA 1.1.0 (22/09/2026): MEP 410 brutos depois de 2 saídas, MEN -120 antes da 1ª
const DIA: ExposicaoHoje = {
  mep_ea: 410,
  men_ea: -120,
  mep_ea_em: "2026-09-22T13:35:02.410Z",
  men_ea_em: "2026-09-22T13:31:48.006Z",
  mep_ea_n_saidas: 2,
  men_ea_n_saidas: 0,
  excursao_ea_parcial: false,
};

describe("temMedicaoEA", () => {
  it("precisa de linha com MEP ou MEN numérico", () => {
    expect(temMedicaoEA(null)).toBe(false);
    expect(temMedicaoEA(undefined)).toBe(false);
    expect(temMedicaoEA({ ...DIA, mep_ea: null, men_ea: null })).toBe(false);
    expect(temMedicaoEA({ ...DIA, mep_ea: null })).toBe(true);
    expect(temMedicaoEA(DIA)).toBe(true);
  });
});

describe("mepMenDoDia", () => {
  it("bruto em R$ é o número do EA como veio", () => {
    const r = mepMenDoDia(DIA, 1.5, 0.2, "bruto", "brl");
    expect(r).toMatchObject({ mep: 410, men: -120, mepNSaidas: 2, menNSaidas: 0, parcial: false });
    expect(r?.mepEm).toBe(DIA.mep_ea_em);
    expect(r?.menEm).toBe(DIA.men_ea_em);
  });

  it("líquido desconta o custo das saídas feitas até o extremo", () => {
    const r = mepMenDoDia(DIA, 1.5, 0.2, "liquido", "brl");
    // 410 − 2 × 1,5; −120 − 0 × 1,5
    expect(r?.mep).toBe(407);
    expect(r?.men).toBe(-120);
  });

  it("pontos dividem pelo valor do ponto (e sem valor do ponto vale 0)", () => {
    const pts = mepMenDoDia(DIA, 1.5, 0.2, "liquido", "pontos");
    expect(pts?.mep).toBeCloseTo(2035);
    expect(pts?.men).toBeCloseTo(-600);
    expect(mepMenDoDia(DIA, 1.5, 0, "bruto", "pontos")).toMatchObject({ mep: 0, men: 0 });
  });

  it("depois do custo, MEP não fica negativo nem MEN positivo: viram 0 (não ficou positivo/negativo)", () => {
    const r = mepMenDoDia({ ...DIA, mep_ea: 2, mep_ea_n_saidas: 3, men_ea: 0, men_ea_n_saidas: 0 }, 1.5, 0.2, "liquido", "brl");
    expect(r).toMatchObject({ mep: 0, men: 0 });
  });

  it("sem medição devolve null; MEP sozinho vale com MEN 0", () => {
    expect(mepMenDoDia(null, 1, 0.2, "liquido", "brl")).toBeNull();
    expect(mepMenDoDia({ ...DIA, mep_ea: null, men_ea: null }, 1, 0.2, "liquido", "brl")).toBeNull();
    const so = mepMenDoDia({ ...DIA, men_ea: null, men_ea_n_saidas: null }, 1, 0.2, "bruto", "brl");
    expect(so).toMatchObject({ mep: 410, men: 0, menNSaidas: 0 });
  });

  it("parcial e horários opcionais (o evento coleta não traz hora)", () => {
    const r = mepMenDoDia({ mep_ea: 10, men_ea: -5, mep_ea_n_saidas: 1, men_ea_n_saidas: 1, excursao_ea_parcial: true }, 0, 0.2, "bruto", "brl");
    expect(r).toMatchObject({ parcial: true, mepEm: null, menEm: null });
  });

  it("contagem de saídas inválida (null, negativa, NaN) conta 0 custo", () => {
    const r = mepMenDoDia({ ...DIA, mep_ea_n_saidas: null, men_ea_n_saidas: -3 }, 1.5, 0.2, "liquido", "brl");
    expect(r).toMatchObject({ mep: 410, men: -120, mepNSaidas: 0, menNSaidas: 0 });
  });
});

describe("posicaoDoExtremo", () => {
  it("nSaidas/nOperacoes, na régua da curva por operação", () => {
    expect(posicaoDoExtremo(2, 4)).toBe(0.5);
    expect(posicaoDoExtremo(0, 4)).toBe(0);
    expect(posicaoDoExtremo(4, 4)).toBe(1);
  });
  it("mais saídas que operações para em 1; sem operação fica em 0", () => {
    expect(posicaoDoExtremo(7, 4)).toBe(1);
    expect(posicaoDoExtremo(2, 0)).toBe(0);
    expect(posicaoDoExtremo(Number.NaN, 4)).toBe(0);
  });
});

describe("excursaoDaOperacao", () => {
  it("null quando a operação não foi medida", () => {
    expect(excursaoDaOperacao({})).toBeNull();
    expect(excursaoDaOperacao({ mfe_pontos_por_contrato: null, mae_pontos_por_contrato: null })).toBeNull();
  });
  it("MFE/MAE em pontos, parcial só quando true", () => {
    expect(excursaoDaOperacao({ mfe_pontos_por_contrato: 320, mae_pontos_por_contrato: -85 })).toEqual({ mfe: 320, mae: -85, parcial: false });
    expect(excursaoDaOperacao({ mfe_pontos_por_contrato: 0, mae_pontos_por_contrato: 0, excursao_parcial: true })).toEqual({ mfe: 0, mae: 0, parcial: true });
    // um só medido: o outro vale 0
    expect(excursaoDaOperacao({ mfe_pontos_por_contrato: 50 })).toEqual({ mfe: 50, mae: 0, parcial: false });
  });
});

describe("exposicaoDoDia", () => {
  it("acha a linha do dia ou devolve null", () => {
    const lista = [
      { dia: "2026-09-21", mep_ea: 1 },
      { dia: "2026-09-22", mep_ea: 2 },
    ];
    expect(exposicaoDoDia(lista, "2026-09-22")?.mep_ea).toBe(2);
    expect(exposicaoDoDia(lista, "2026-09-23")).toBeNull();
  });
});
