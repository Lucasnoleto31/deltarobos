import { describe, expect, it } from "vitest";
import { capitalMinimoRecomendado } from "./kpis";

describe("capitalMinimoRecomendado", () => {
  it("margem + drawdown x fator", () => {
    expect(capitalMinimoRecomendado(1000, 500, 1.5)).toBe(1750);
    expect(capitalMinimoRecomendado(null, 500)).toBe(750);
  });

  it("a margem é por contrato: vale para o máximo de entradas que o robô já teve abertas (25/11/2026)", () => {
    // Apollo: R$ 150 x 36 entradas + maior queda de R$ 35.408 x 1,5
    expect(capitalMinimoRecomendado(150, 35408, 1.5, 36)).toBe(58512);
    // sem medição de entradas (0 ou inválido) vale 1 contrato
    expect(capitalMinimoRecomendado(150, 1000, 1.5, 0)).toBe(1650);
    expect(capitalMinimoRecomendado(150, 1000, 1.5, Number.NaN)).toBe(1650);
  });
});
