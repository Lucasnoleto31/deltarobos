import { describe, expect, it } from "vitest";
import { caminhoMonotono } from "./curva-monotona";

// Referências tiradas do d3.line().curve(d3.curveMonotoneX), que o recharts usava na MiniCurva:
// se a conta divergir, a sparkline do cartão muda de forma sem ninguém ter pedido.
describe("caminhoMonotono", () => {
  it("reproduz o curveMonotoneX do d3", () => {
    const xs = [0, 25, 50, 75, 100];
    const ys = [40, 10, 10, 30, 2];
    expect(caminhoMonotono(xs, ys)).toBe(
      "M0,40C8.333,25,16.667,10,25,10C33.333,10,41.667,10,50,10C58.333,10,66.667,30,75,30C83.333,30,91.667,16,100,2",
    );
  });

  it("dois pontos viram reta e um ponto só vira M", () => {
    expect(caminhoMonotono([0, 100], [5, 9])).toBe("M0,5L100,9");
    expect(caminhoMonotono([3], [4])).toBe("M3,4");
    expect(caminhoMonotono([], [])).toBe("");
  });

  it("não passa do mínimo nem do máximo dos pontos", () => {
    const xs = [0, 10, 20, 30, 40, 50];
    const ys = [2, 62, 60, 2, 3, 62];
    const numeros = caminhoMonotono(xs, ys).replace(/^M/, "").split(/[C,]/).map(Number);
    const yDosControles = numeros.filter((_, i) => i % 2 === 1);
    expect(Math.min(...yDosControles)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...yDosControles)).toBeLessThanOrEqual(62);
  });
});
