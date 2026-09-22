import { describe, expect, it } from "vitest";
import { excursaoDoDeal } from "./excursoes";
import { dealSchema } from "./schemas";

const base = {
  ticket: 1,
  posicao_id: 987600,
  simbolo: "winv26",
  tipo: "sell",
  entry: "out",
  volume: 1,
  preco: 140250,
  magic: 1001,
  executado_em: "2026-09-22T13:40:00.000Z",
};

describe("excursaoDoDeal", () => {
  it("deal sem mfe_pontos nem mae_pontos (EA 1.0.0) não vira excursão", () => {
    expect(excursaoDoDeal(dealSchema.parse(base))).toBeNull();
  });

  it("deal com extremo mas sem ciclo não vira excursão (o default 1 fundiria ciclos de uma posição revertida)", () => {
    expect(excursaoDoDeal(dealSchema.parse({ ...base, mfe_pontos: 40, mae_pontos: -10 }))).toBeNull();
    // ciclo malformado é descartado pelo schema (tolerante) e cai no mesmo caso
    expect(excursaoDoDeal(dealSchema.parse({ ...base, ciclo: "dois", mfe_pontos: 40 }))).toBeNull();
  });

  it("deal sem posição ou que não é negociação não vira excursão", () => {
    expect(excursaoDoDeal(dealSchema.parse({ ...base, ciclo: 1, posicao_id: 0, mfe_pontos: 10 }))).toBeNull();
    expect(excursaoDoDeal(dealSchema.parse({ ...base, ciclo: 1, tipo: "balance", mfe_pontos: 10 }))).toBeNull();
  });

  it("mapeia o payload do EA para o jsonb de registrar_excursoes, com símbolo em maiúsculas", () => {
    const deal = dealSchema.parse({
      ...base,
      ciclo: 2,
      mfe_pontos: 320,
      mae_pontos: -85,
      mfe_em: "2026-09-22T13:35:02.410Z",
      mae_em: "2026-09-22T13:31:48.006Z",
      excursao_parcial: true,
    });
    expect(excursaoDoDeal(deal)).toEqual({
      posicao_id: 987600,
      ciclo: 2,
      magic: 1001,
      simbolo: "WINV26",
      mfe_pontos: 320,
      mae_pontos: -85,
      mfe_em: "2026-09-22T13:35:02.410Z",
      mae_em: "2026-09-22T13:31:48.006Z",
      excursao_parcial: true,
    });
  });

  it("só o MFE conhecido (MAE malformado): MAE 0 (neutro no least), instantes nulos, parcial false", () => {
    const deal = dealSchema.parse({ ...base, ciclo: 1, mfe_pontos: 40, mae_pontos: "x" });
    expect(excursaoDoDeal(deal)).toEqual({
      posicao_id: 987600,
      ciclo: 1,
      magic: 1001,
      simbolo: "WINV26",
      mfe_pontos: 40,
      mae_pontos: 0,
      mfe_em: null,
      mae_em: null,
      excursao_parcial: false,
    });
  });

  it("só o MAE conhecido (MFE malformado): o MAE sobrevive sozinho, MFE 0 (neutro no greatest)", () => {
    const deal = dealSchema.parse({ ...base, ciclo: 1, mfe_pontos: "x", mae_pontos: -85, mae_em: "2026-09-22T13:31:48.006Z" });
    expect(excursaoDoDeal(deal)).toEqual({
      posicao_id: 987600,
      ciclo: 1,
      magic: 1001,
      simbolo: "WINV26",
      mfe_pontos: 0,
      mae_pontos: -85,
      mfe_em: null,
      mae_em: "2026-09-22T13:31:48.006Z",
      excursao_parcial: false,
    });
  });
});
