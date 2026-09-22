import { describe, expect, it } from "vitest";
import { indiceMaisPerto } from "./base";

// a varredura que o desenho fazia até 22/09/2026: o primeiro índice com a menor distância
function porVarredura(pontos: ReadonlyArray<{ posicao: number }>, alvo: number): number {
  let perto = 0;
  pontos.forEach((p, i) => {
    if (Math.abs(p.posicao - alvo) < Math.abs(pontos[perto].posicao - alvo)) perto = i;
  });
  return perto;
}

describe("indiceMaisPerto", () => {
  it("lista vazia dá 0 e um ponto só dá 0", () => {
    expect(indiceMaisPerto([], 0.3)).toBe(0);
    expect(indiceMaisPerto([{ posicao: 1 }], 0)).toBe(0);
    expect(indiceMaisPerto([{ posicao: 1 }], 5)).toBe(0);
  });

  it("dá o mesmo que a varredura, inclusive nos empates e nas posições repetidas", () => {
    let s = 11;
    const aleatorio = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let caso = 0; caso < 200; caso++) {
      const n = 1 + Math.floor(aleatorio() * 60);
      // posições em passos de 0,05 para dar empate de distância e posição repetida com frequência
      const pontos = Array.from({ length: n }, () => ({ posicao: Math.round(aleatorio() * 20) / 20 })).sort((a, b) => a.posicao - b.posicao);
      const alvos = [-0.1, 0, 0.025, 0.5, 0.975, 1, 1.1, ...pontos.map((p) => p.posicao), ...Array.from({ length: 10 }, () => Math.round(aleatorio() * 40) / 40)];
      for (const alvo of alvos) expect(indiceMaisPerto(pontos, alvo)).toBe(porVarredura(pontos, alvo));
    }
  });

  it("é uma busca binária: 20 mil pontos, uma consulta por ponto, em bem menos de um segundo", () => {
    const pontos = Array.from({ length: 20_000 }, (_, i) => ({ posicao: (i + 1) / 20_000 }));
    const inicio = performance.now();
    for (let i = 0; i < pontos.length; i++) expect(indiceMaisPerto(pontos, pontos[i].posicao)).toBe(i);
    expect(performance.now() - inicio).toBeLessThan(1000);
  });
});
