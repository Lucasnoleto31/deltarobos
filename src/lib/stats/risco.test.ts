import { describe, expect, it } from "vitest";
import { capitalMinimoRecomendado, episodiosDrawdown } from "./risco";
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

describe("episodiosDrawdown", () => {
  it("separa episódios, ordena pelo maior e marca o aberto", () => {
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
    const eps = episodiosDrawdown(curva);
    expect(eps).toHaveLength(2);
    expect(eps[0]).toMatchObject({
      inicio: "2026-09-03",
      fundo: "2026-09-07",
      recuperacao: null,
      valor: 100,
      diasAteFundo: 4,
      diasAteRecuperar: null,
    });
    expect(eps[1]).toMatchObject({
      inicio: "2026-09-01",
      fundo: "2026-09-02",
      recuperacao: "2026-09-03",
      valor: 30,
      diasAteFundo: 1,
      diasAteRecuperar: 2,
    });
  });

  it("respeita o limite e trata curva vazia", () => {
    expect(episodiosDrawdown([])).toEqual([]);
    const curva = curvaAcumulada(
      [linha("2026-09-01", -1), linha("2026-09-02", 2), linha("2026-09-03", -1), linha("2026-09-04", 2)],
      o,
    );
    expect(episodiosDrawdown(curva, 1)).toHaveLength(1);
  });
});

describe("capitalMinimoRecomendado", () => {
  it("margem + drawdown x fator", () => {
    expect(capitalMinimoRecomendado(1000, 500, 1.5)).toBe(1750);
  });
});
