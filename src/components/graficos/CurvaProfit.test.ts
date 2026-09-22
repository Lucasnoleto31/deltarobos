import { describe, expect, it } from "vitest";
import { MAX_BARRAS, caminhoDoDrawdown, type PontoDoDesenho } from "./CurvaProfit";

const ponto = (posicao: number, drawdown: number): PontoDoDesenho => ({
  posicao,
  acumulado: 0,
  drawdown,
  dica: { titulo: "", linhas: [] },
});

describe("área do drawdown (22/09/2026)", () => {
  it("acima de 600 pontos o drawdown vira uma área", () => {
    expect(MAX_BARRAS).toBe(600);
  });

  it("vai do zero, no alto, até o drawdown de cada ponto e volta ao zero", () => {
    // a escala do desenho: 0 no alto, o pior drawdown (-100) embaixo
    const y = (v: number) => (v / -100) * 100;
    const d = caminhoDoDrawdown([ponto(0.1, 0), ponto(0.5, -50), ponto(0.9, -20)], y);
    expect(d).toBe("M10.000,0L10.000,0.00L50.000,50.00L90.000,20.00L90.000,0Z");
    expect(caminhoDoDrawdown([], y)).toBe("");
  });

  it("com 20 mil pontos é um caminho só, montado rápido", () => {
    const pontos = Array.from({ length: 20_000 }, (_, i) => ponto((i + 1) / 20_000, -((i * 7) % 100)));
    const inicio = performance.now();
    const d = caminhoDoDrawdown(pontos, (v) => -v);
    expect(performance.now() - inicio).toBeLessThan(300);
    expect(d.startsWith("M0.005,0L0.005,0.00")).toBe(true);
    expect(d.endsWith("L100.000,0Z")).toBe(true);
    expect((d.match(/L/g) ?? []).length).toBe(20_001);
  });
});
