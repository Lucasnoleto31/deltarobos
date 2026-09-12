import { describe, expect, it } from "vitest";
import { arredondar, brlParaPontos, pontosParaBrl, porContrato, vwap } from "./normalizacao";

describe("normalização", () => {
  it("por contrato", () => {
    expect(porContrato(300, 3)).toBe(100);
    expect(porContrato(300, 0)).toBe(0);
  });

  it("pontos <-> R$", () => {
    expect(pontosParaBrl(500, 0.2)).toBe(100);
    expect(brlParaPontos(100, 0.2)).toBe(500);
    expect(brlParaPontos(100, 0)).toBe(0);
  });

  it("vwap", () => {
    expect(
      vwap([
        { volume: 2, preco: 100 },
        { volume: 1, preco: 130 },
      ]),
    ).toBe(110);
    expect(vwap([])).toBe(0);
  });

  it("arredondar", () => {
    expect(arredondar(1.005, 2)).toBe(1.01);
    expect(arredondar(-2.345, 2)).toBe(-2.35);
    expect(arredondar(135000.1234, 3)).toBe(135000.123);
  });
});
