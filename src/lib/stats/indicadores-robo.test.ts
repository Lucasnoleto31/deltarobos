import { describe, expect, it } from "vitest";
import {
  acertoParaEmpatar,
  andamJuntos,
  contarPregoes,
  diaRuimTipico,
  ehParQueAndaJunto,
  picoDeEntradasAbertas,
  quedaAtual,
  resultadoPorMes,
  resumirMeses,
  tempoEmPalavras,
  type DiaValor,
} from "./indicadores-robo";

const d = (dia: string, valor: number): DiaValor => ({ dia, valor });

describe("picoDeEntradasAbertas", () => {
  it("conta o máximo de operações abertas no mesmo instante e quando foi", () => {
    // três abertas entre 30 e 40
    const pico = picoDeEntradasAbertas([
      [10, 50],
      [20, 40],
      [30, 60],
      [70, 80],
    ]);
    expect(pico).toEqual({ maximo: 3, quando: 30 });
  });

  it("fechar e abrir no mesmo instante não é simultâneo", () => {
    expect(picoDeEntradasAbertas([[10, 20], [20, 30]]).maximo).toBe(1);
  });

  it("sem operação, zero; intervalo inválido é ignorado", () => {
    expect(picoDeEntradasAbertas([])).toEqual({ maximo: 0, quando: null });
    expect(picoDeEntradasAbertas([[50, 10], [Number.NaN, 5]]).maximo).toBe(0);
  });
});

describe("acertoParaEmpatar", () => {
  it("é a perda dividida pela soma de ganho e perda", () => {
    // ganho de 24 contra perda de 105: precisa de 81,4% só para empatar
    expect(acertoParaEmpatar(24, 105)).toBeCloseTo(0.8140, 4);
    expect(acertoParaEmpatar(100, 100)).toBe(0.5);
  });

  it("aceita a perda com sinal e devolve nulo sem ganho ou sem perda", () => {
    expect(acertoParaEmpatar(24, -105)).toBeCloseTo(0.8140, 4);
    expect(acertoParaEmpatar(0, 100)).toBeNull();
    expect(acertoParaEmpatar(50, 0)).toBeNull();
  });
});

describe("resultadoPorMes e resumirMeses", () => {
  const dias = [d("2026-03-02", 100), d("2026-02-27", -30), d("2026-03-10", -250), d("2026-04-01", 40)];

  it("soma por mês, em ordem, com os pregões de cada um", () => {
    expect(resultadoPorMes(dias)).toEqual([
      { mes: "2026-02", valor: -30, nDias: 1 },
      { mes: "2026-03", valor: -150, nDias: 2 },
      { mes: "2026-04", valor: 40, nDias: 1 },
    ]);
  });

  it("conta os meses com ganho e acha o pior e o melhor", () => {
    const r = resumirMeses(resultadoPorMes(dias));
    expect(r.meses).toBe(3);
    expect(r.comGanho).toBe(1);
    expect(r.pior?.mes).toBe("2026-03");
    expect(r.melhor?.mes).toBe("2026-04");
  });

  it("sem dias, nada", () => {
    expect(resumirMeses([])).toEqual({ meses: 0, comGanho: 0, pior: null, melhor: null });
  });
});

describe("diaRuimTipico", () => {
  it("é a perda que só 1 em cada 20 pregões superou", () => {
    // 100 pregões: 5 de perda forte (-500 a -100), o resto de ganho
    const valores = [-500, -400, -300, -200, -100, ...Array.from({ length: 95 }, () => 50)];
    expect(diaRuimTipico(valores)).toBe(-100);
  });

  it("poucos pregões não sustentam o número", () => {
    expect(diaRuimTipico(Array.from({ length: 39 }, () => -10))).toBeNull();
  });

  it("se nem 1 em 20 foi de perda, não há dia ruim típico", () => {
    expect(diaRuimTipico([-5, ...Array.from({ length: 99 }, () => 10)])).toBeNull();
  });
});

describe("quedaAtual", () => {
  it("mede quanto falta para voltar ao ponto mais alto e desde quando", () => {
    expect(quedaAtual([d("a", 100), d("b", 50), d("c", -80), d("d", 10)])).toEqual({ valor: 70, desde: "b" });
  });

  it("no topo (ou em série vazia) é zero", () => {
    expect(quedaAtual([d("a", 100), d("b", -20), d("c", 30)])).toEqual({ valor: 0, desde: null });
    expect(quedaAtual([])).toEqual({ valor: 0, desde: null });
  });

  it("quem só perdeu está abaixo da partida", () => {
    expect(quedaAtual([d("a", -40), d("b", -10)])).toEqual({ valor: 50, desde: null });
  });
});

describe("andamJuntos", () => {
  it("conta os pregões em comum e em quantos os dois foram para o mesmo lado", () => {
    const a = [d("1", 10), d("2", -5), d("3", 20), d("4", 7)];
    const b = [d("1", 3), d("2", -9), d("3", -1), d("5", 8)];
    const j = andamJuntos(a, b);
    expect(j.diasEmComum).toBe(3);
    expect(j.mesmoSentido).toBe(2);
    expect(j.correlacao).not.toBeNull();
  });

  it("séries iguais têm correlação 1; sem dia em comum, nada", () => {
    const a = [d("1", 10), d("2", -5), d("3", 20)];
    expect(andamJuntos(a, a).correlacao).toBeCloseTo(1, 10);
    expect(andamJuntos(a, [d("9", 1)])).toEqual({ diasEmComum: 0, mesmoSentido: 0, correlacao: null });
  });

  it("só afirma que andam juntos com pregões em comum suficientes e 75% no mesmo sentido", () => {
    expect(ehParQueAndaJunto({ diasEmComum: 131, mesmoSentido: 114, correlacao: 0.76 })).toBe(true);
    expect(ehParQueAndaJunto({ diasEmComum: 20, mesmoSentido: 20, correlacao: 1 })).toBe(false);
    expect(ehParQueAndaJunto({ diasEmComum: 100, mesmoSentido: 60, correlacao: 0.2 })).toBe(false);
  });
});

describe("contarPregoes", () => {
  it("conta os dias úteis entre as duas datas, inclusive, sem os feriados", () => {
    // 23 a 27/11/2026: segunda a sexta
    expect(contarPregoes("2026-11-23", "2026-11-27", [])).toBe(5);
    // com o fim de semana no meio e um feriado
    expect(contarPregoes("2026-11-19", "2026-11-25", ["2026-11-20"])).toBe(4);
  });

  it("intervalo invertido é zero", () => {
    expect(contarPregoes("2026-11-25", "2026-11-20", [])).toBe(0);
  });
});

describe("tempoEmPalavras", () => {
  it("escreve meses e anos", () => {
    expect(tempoEmPalavras("2026-02-13", "2026-11-25")).toBe("9 meses");
    expect(tempoEmPalavras("2018-01-03", "2026-11-24")).toBe("8 anos e 10 meses");
    expect(tempoEmPalavras("2025-11-25", "2026-11-25")).toBe("1 ano");
    expect(tempoEmPalavras("2026-11-10", "2026-11-25")).toBe("menos de 1 mês");
  });
});
