import { describe, expect, it } from "vitest";
import { MAX_BARRAS, caminhoDaFaixa, caminhoDaLinha, caminhoDoDrawdown, caminhoDosDentes, type PontoDoDesenho } from "./CurvaProfit";

const ponto = (posicao: number, drawdown: number, extras: Partial<PontoDoDesenho> = {}): PontoDoDesenho => ({
  posicao,
  acumulado: 0,
  drawdown,
  dica: { titulo: "", linhas: [] },
  ...extras,
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

// A linha e a área (revisão de 23/09/2026): de sempre nascem no zero da borda esquerda; a série do saldo nasce no
// primeiro ponto, para o coletor que subiu no meio do dia não virar uma rampa desde a abertura.
describe("linha e área da curva (23/09/2026)", () => {
  const y = (v: number) => 100 - v;
  const tres = [ponto(0.1, 0, { acumulado: 10 }), ponto(0.5, 0, { acumulado: -20 }), ponto(0.9, 0, { acumulado: 40 })];
  const x = (i: number) => tres[i].posicao * 100;

  it("de sempre: a linha começa em (0, zero) e a área fecha no zero sob o último ponto", () => {
    const { tracado, area } = caminhoDaLinha(tres, x, y, 2, y(0), false);
    expect(tracado).toBe("M0,100.00L10.00,90.00L50.00,120.00L90.00,60.00");
    expect(area).toBe("M0,100.00L10.00,90.00L50.00,120.00L90.00,60.00L90.00,100.00Z");
  });

  it("do primeiro ponto: a linha começa nele e a área desce do zero até ele", () => {
    const { tracado, area } = caminhoDaLinha(tres, x, y, 2, y(0), true);
    expect(tracado).toBe("M10.00,90.00L50.00,120.00L90.00,60.00");
    expect(area).toBe("M10.00,100.00L10.00,90.00L50.00,120.00L90.00,60.00L90.00,100.00Z");
    // sem ponto, nada
    expect(caminhoDaLinha([], x, y, 2, y(0), true)).toEqual({ tracado: "", area: "" });
    expect(caminhoDaLinha([], x, y, 2, y(0), false)).toEqual({ tracado: "", area: "" });
  });

  it("com o primeiro ponto em x = 0 os dois modos só diferem no risco vertical da borda", () => {
    const naBorda = [ponto(0, 0, { acumulado: 500 }), ponto(1, 0, { acumulado: 600 })];
    const px = (i: number) => naBorda[i].posicao * 100;
    const y2 = (v: number) => 100 - v / 10;
    expect(caminhoDaLinha(naBorda, px, y2, 2, y2(0), false).tracado).toBe("M0,100.00L0.00,50.00L100.00,40.00");
    expect(caminhoDaLinha(naBorda, px, y2, 2, y2(0), true).tracado).toBe("M0.00,50.00L100.00,40.00");
    expect(caminhoDaLinha(naBorda, px, y2, 2, y2(0), true).area).toBe("M0.00,100.00L0.00,50.00L100.00,40.00L100.00,100.00Z");
  });
});

// A faixa mín./máx. da série do saldo e os dentes de MFE/MAE (23/09/2026): cada um é um caminho só,
// nas mesmas coordenadas do traçado (x em % com `casas`, y em % com 2 casas).
describe("faixa mín./máx. e dentes de MFE/MAE (23/09/2026)", () => {
  // uma régua simples: o valor v cai em 100 - v (o zero embaixo, 100 no alto)
  const y = (v: number) => 100 - v;
  const tres = [
    ponto(0.1, 0),
    ponto(0.5, 0, { acumulado: 10, faixa: [-50, 50], dente: { de: -20, ate: 30, mfe: 150, mae: -100 } }),
    ponto(0.9, 0, { acumulado: 40, faixa: [20, 80], dente: { de: 35, ate: 60, mfe: 100, mae: -25 } }),
  ];
  const x = (i: number) => tres[i].posicao * 100;

  it("a faixa vai pelos máximos e volta pelos mínimos; ponto sem faixa entra com o acumulado", () => {
    expect(caminhoDaFaixa(tres, x, y, 2)).toBe("M10.00,100.00L50.00,50.00L90.00,20.00L90.00,80.00L50.00,150.00L10.00,100.00Z");
  });

  it("sem nenhum ponto com faixa, nada a desenhar", () => {
    const semFaixa = [ponto(0.1, 0), ponto(0.5, 0, { acumulado: 10 })];
    expect(caminhoDaFaixa(semFaixa, (i) => semFaixa[i].posicao * 100, y, 2)).toBe("");
    expect(caminhoDaFaixa([], x, y, 2)).toBe("");
  });

  it("um dente é um traço vertical do `de` ao `ate`, só nos pontos que o têm", () => {
    expect(caminhoDosDentes(tres, x, y, 2)).toBe("M50.00,120.00L50.00,70.00M90.00,65.00L90.00,40.00");
    expect(caminhoDosDentes([ponto(0.1, 0)], x, y, 2)).toBe("");
  });

  it("com 20 mil pontos os dois são um caminho só, montados rápido", () => {
    const pontos = Array.from({ length: 20_000 }, (_, i) =>
      ponto((i + 1) / 20_000, 0, { acumulado: i % 50, faixa: [(i % 50) - 5, (i % 50) + 5], dente: { de: (i % 50) - 10, ate: (i % 50) + 10, mfe: 50, mae: -50 } }),
    );
    const px = (i: number) => pontos[i].posicao * 100;
    const inicio = performance.now();
    const faixa = caminhoDaFaixa(pontos, px, y, 3);
    const dentes = caminhoDosDentes(pontos, px, y, 3);
    expect(performance.now() - inicio).toBeLessThan(300);
    // um "M" só na faixa (área fechada) e um "M" por dente
    expect((faixa.match(/M/g) ?? []).length).toBe(1);
    expect(faixa.startsWith("M0.005,95.00")).toBe(true);
    expect(faixa.endsWith("L0.005,105.00Z")).toBe(true);
    expect((dentes.match(/M/g) ?? []).length).toBe(20_000);
  });
});
