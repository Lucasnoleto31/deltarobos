import { describe, expect, it } from "vitest";
import { acumular, amostrar, maiorQueda, resumirDias, somarSeries, ultimosPregoes, type DiaResultado } from "./serie-casa";

const dia = (d: string, valor: number, n = 1, g = valor > 0 ? 1 : 0): DiaResultado => ({ dia: d, valor, n, g });

describe("somarSeries", () => {
  it("soma os robôs dia a dia e devolve em ordem de data", () => {
    const a = [dia("2026-11-03", 100, 2, 2), dia("2026-11-04", -50, 1, 0)];
    const b = [dia("2026-11-04", 30, 3, 2), dia("2026-11-02", 10, 1, 1)];
    expect(somarSeries([a, b])).toEqual([
      { dia: "2026-11-02", valor: 10, n: 1, g: 1 },
      { dia: "2026-11-03", valor: 100, n: 2, g: 2 },
      { dia: "2026-11-04", valor: -20, n: 4, g: 2 },
    ]);
  });

  it("não altera as séries de entrada", () => {
    const a = [dia("2026-11-03", 100)];
    somarSeries([a, a]);
    expect(a[0].valor).toBe(100);
  });

  it("sem série, sem dias", () => {
    expect(somarSeries([])).toEqual([]);
  });
});

describe("ultimosPregoes", () => {
  const dias = [1, 2, 3, 4, 5];
  it("corta do fim", () => expect(ultimosPregoes(dias, 2)).toEqual([4, 5]));
  it("nulo ou maior que a série devolve tudo", () => {
    expect(ultimosPregoes(dias, null)).toEqual(dias);
    expect(ultimosPregoes(dias, 99)).toEqual(dias);
  });
});

describe("acumular", () => {
  it("parte de zero e soma pregão a pregão", () => {
    expect(acumular([dia("a", 10), dia("b", -4), dia("c", 1)]).map((p) => p.acumulado)).toEqual([10, 6, 7]);
  });
});

describe("maiorQueda", () => {
  it("vai do ponto mais alto ao mais baixo depois dele", () => {
    const q = maiorQueda(acumular([dia("a", 100), dia("b", 50), dia("c", -120), dia("d", -10), dia("e", 200)]));
    // pico em "b" (150), fundo em "d" (20)
    expect(q).toEqual({ iInicio: 1, iFundo: 3, valor: 130 });
  });

  it("a partida em zero conta como pico: quem começa perdendo já está em queda", () => {
    expect(maiorQueda(acumular([dia("a", -30), dia("b", -20), dia("c", 100)]))).toEqual({ iInicio: -1, iFundo: 1, valor: 50 });
  });

  it("curva que só sobe não tem queda", () => {
    expect(maiorQueda(acumular([dia("a", 1), dia("b", 2)]))).toBeNull();
    expect(maiorQueda([])).toBeNull();
  });

  it("entre duas quedas fica a maior", () => {
    const q = maiorQueda(acumular([dia("a", 100), dia("b", -10), dia("c", 50), dia("d", -80), dia("e", 5)]));
    expect(q).toEqual({ iInicio: 2, iFundo: 3, valor: 80 });
  });
});

describe("resumirDias", () => {
  it("conta pregões com ganho e com perda, acha o melhor e o pior e calcula os acertos por operação", () => {
    const r = resumirDias([dia("a", 100, 4, 3), dia("b", -40, 2, 0), dia("c", 0, 1, 0), dia("d", 20, 3, 2)]);
    expect(r.pregoes).toBe(4);
    expect(r.comGanho).toBe(2);
    expect(r.comPerda).toBe(1);
    expect(r.melhor).toEqual({ dia: "a", valor: 100 });
    expect(r.pior).toEqual({ dia: "b", valor: -40 });
    expect(r.operacoes).toBe(10);
    expect(r.acertos).toBe(0.5);
    expect(r.total).toBe(80);
  });

  it("sem pregão, tudo vazio e acertos nulo", () => {
    const r = resumirDias([]);
    expect(r.pregoes).toBe(0);
    expect(r.melhor).toBeNull();
    expect(r.acertos).toBeNull();
  });
});

describe("amostrar", () => {
  it("mantém a primeira e a última ponta", () => {
    const longo = Array.from({ length: 200 }, (_, i) => i);
    const curto = amostrar(longo, 40);
    expect(curto).toHaveLength(40);
    expect(curto[0]).toBe(0);
    expect(curto[39]).toBe(199);
  });

  it("série curta passa inteira", () => {
    expect(amostrar([1, 2, 3], 40)).toEqual([1, 2, 3]);
  });
});
