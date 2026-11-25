import { describe, expect, it } from "vitest";
import {
  aPartirDe,
  acumular,
  amostrar,
  compararNaLista,
  curvaNoEixo,
  eixoComum,
  ganhoPorQueda,
  inicioDoPeriodoDaCasa,
  maiorQueda,
  resumirDias,
  somarSeries,
  tamanhoDoHistorico,
  ultimosPregoes,
  type DiaResultado,
  type LinhaNaOrdem,
} from "./serie-casa";

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

describe("inicioDoPeriodoDaCasa e aPartirDe", () => {
  const HOJE = "2026-09-18";
  // 40 dias seguidos, de 01/08 a 09/09
  const somada = Array.from({ length: 40 }, (_, i) => ({ dia: new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10) }));

  it("desde o início não corta nada", () => {
    expect(inicioDoPeriodoDaCasa(somada, "tudo", HOJE)).toBeNull();
    expect(aPartirDe(somada, null)).toHaveLength(40);
  });

  it("12 meses deixam de fora o dia de hoje de um ano atrás", () => {
    expect(inicioDoPeriodoDaCasa(somada, "12m", HOJE)).toBe("2025-09-19");
    const dias = [{ dia: "2025-09-18" }, { dia: "2025-09-19" }, { dia: "2026-09-18" }];
    expect(aPartirDe(dias, inicioDoPeriodoDaCasa(dias, "12m", HOJE)).map((d) => d.dia)).toEqual(["2025-09-19", "2026-09-18"]);
  });

  it("30 pregões começam no trigésimo pregão da casa, de trás para a frente", () => {
    const inicio = inicioDoPeriodoDaCasa(somada, "30", HOJE);
    expect(inicio).toBe(somada[10].dia);
    expect(aPartirDe(somada, inicio)).toHaveLength(30);
  });

  it("o corte é o mesmo dia para todos: o robô que operou menos aparece com os pregões que teve na janela", () => {
    const inicio = inicioDoPeriodoDaCasa(somada, "30", HOJE);
    const robo = [somada[2], somada[9], somada[10], somada[25], somada[39]];
    expect(aPartirDe(robo, inicio).map((d) => d.dia)).toEqual([somada[10].dia, somada[25].dia, somada[39].dia]);
  });

  it("com 30 pregões ou menos entra tudo", () => {
    expect(inicioDoPeriodoDaCasa(somada.slice(0, 30), "30", HOJE)).toBeNull();
    expect(inicioDoPeriodoDaCasa([], "30", HOJE)).toBeNull();
  });

  it("devolve uma lista nova, sem mexer na de entrada", () => {
    const dias = [{ dia: "2026-09-01" }];
    expect(aPartirDe(dias, null)).not.toBe(dias);
    expect(aPartirDe(dias, null)).toEqual(dias);
  });
});

describe("ganhoPorQueda", () => {
  it("é o resultado dividido pela maior queda do mesmo período", () => {
    expect(ganhoPorQueda(110, 100)).toEqual({ valor: 1.1, falta: null });
    expect(ganhoPorQueda(50, 200)).toEqual({ valor: 0.25, falta: null });
  });

  it("sem ganho não há número: resultado negativo ou zero não vira nota", () => {
    expect(ganhoPorQueda(-300, 800)).toEqual({ valor: null, falta: "ganho" });
    expect(ganhoPorQueda(0, 800)).toEqual({ valor: null, falta: "ganho" });
    expect(ganhoPorQueda(0, 0)).toEqual({ valor: null, falta: "ganho" });
    expect(ganhoPorQueda(Number.NaN, 10)).toEqual({ valor: null, falta: "ganho" });
  });

  it("sem queda não há número: a curva que só subiu não se divide por zero", () => {
    expect(ganhoPorQueda(500, 0)).toEqual({ valor: null, falta: "queda" });
  });
});

describe("compararNaLista", () => {
  const l = (ganho: number | null, resultado: number, pregoes = 10): LinhaNaOrdem => ({ ganhoPorQueda: ganho, resultado, pregoes });
  const ordenar = (linhas: LinhaNaOrdem[]) => [...linhas].sort(compararNaLista);

  it("vai do maior ganho por queda para o menor, mesmo quando o resultado é menor", () => {
    const a = l(4.7, 37000);
    const b = l(1.1, 39000);
    expect(ordenar([b, a])).toEqual([a, b]);
  });

  it("quem não tem o número vai para o fim, do maior resultado para o menor", () => {
    const comNumero = l(0.2, 100);
    const semQueda = l(null, 900);
    const comPerda = l(null, -1000);
    expect(ordenar([comPerda, semQueda, comNumero])).toEqual([comNumero, semQueda, comPerda]);
  });

  it("quem não operou no período fica depois de todos", () => {
    const parado = l(null, 0, 0);
    const comPerda = l(null, -1000);
    expect(ordenar([parado, comPerda])).toEqual([comPerda, parado]);
  });

  it("no empate do ganho por queda vale o resultado", () => {
    const a = l(2, 500);
    const b = l(2, 800);
    expect(ordenar([a, b])).toEqual([b, a]);
  });
});

describe("tamanhoDoHistorico", () => {
  it("diz o tempo entre o primeiro e o último pregão e quantos pregões houve", () => {
    const dias = [dia("2026-02-13", 10), dia("2026-06-01", -5), dia("2026-11-25", 3)];
    expect(tamanhoDoHistorico(dias)).toEqual({ desde: "2026-02-13", ate: "2026-11-25", pregoes: 3, tempo: "9 meses" });
  });

  it("sem pregão não há histórico", () => {
    expect(tamanhoDoHistorico([])).toBeNull();
  });
});

describe("eixoComum e curvaNoEixo", () => {
  const a = [dia("2026-09-14", 100, 1, 1), dia("2026-09-15", -300, 2, 0), dia("2026-09-17", 50, 1, 1)];
  const b = [dia("2026-09-15", 40, 1, 1), dia("2026-09-16", -10, 1, 0), dia("2026-09-18", 20, 1, 1)];

  it("o eixo é todo pregão em que algum robô operou, em ordem e sem repetir", () => {
    expect(eixoComum([{ dias: b }, { dias: a }, { dias: [] }])).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]);
    expect(eixoComum([])).toEqual([]);
  });

  it("no dia sem operação o acumulado fica onde estava; o robô que estreou no período não tem linha antes", () => {
    const eixo = eixoComum([{ dias: a }, { dias: b }]);
    const curvaA = acumular(a);
    const curvaB = acumular(b);

    const noEixoA = curvaNoEixo(eixo, curvaA, maiorQueda(curvaA));
    expect(noEixoA.acumulado).toEqual([100, -200, -200, -150, -150]);
    expect(noEixoA.noDia).toEqual([100, -300, null, 50, null]);

    const noEixoB = curvaNoEixo(eixo, curvaB, maiorQueda(curvaB));
    expect(noEixoB.acumulado).toEqual([null, 40, 30, 30, 50]);
    expect(noEixoB.noDia).toEqual([null, 40, -10, null, 20]);
  });

  it("o robô que já existia antes do período parte de zero no começo do eixo", () => {
    const eixo = eixoComum([{ dias: a }, { dias: b }]);
    const curvaB = acumular(b);
    const noEixoB = curvaNoEixo(eixo, curvaB, maiorQueda(curvaB), true);
    expect(noEixoB.acumulado).toEqual([0, 40, 30, 30, 50]);
    // o dia continua sem operação: zero é de onde a linha parte, não um resultado
    expect(noEixoB.noDia).toEqual([null, 40, -10, null, 20]);
  });

  it("a maior queda vai para os índices do eixo", () => {
    const eixo = eixoComum([{ dias: a }, { dias: b }]);
    const curvaB = acumular(b);
    // B: pico em 15/09 (índice 0 da curva, 1 do eixo), fundo em 16/09 (índice 1 da curva, 2 do eixo)
    expect(maiorQueda(curvaB)).toEqual({ iInicio: 0, iFundo: 1, valor: 10 });
    expect(curvaNoEixo(eixo, curvaB, maiorQueda(curvaB)).queda).toEqual({ iInicio: 1, iFundo: 2, valor: 10 });

    // queda que começa na partida (antes do primeiro pregão): o trecho começa no primeiro pregão do robô
    const c = [dia("2026-09-16", -80, 1, 0), dia("2026-09-18", 30, 1, 1)];
    const curvaC = acumular(c);
    expect(maiorQueda(curvaC)).toEqual({ iInicio: -1, iFundo: 0, valor: 80 });
    expect(curvaNoEixo(eixo, curvaC, maiorQueda(curvaC)).queda).toEqual({ iInicio: 2, iFundo: 2, valor: 80 });
    // se a linha parte de zero no começo do eixo, o pico é o ponto em zero logo antes do primeiro pregão
    expect(curvaNoEixo(eixo, curvaC, maiorQueda(curvaC), true).queda).toEqual({ iInicio: 1, iFundo: 2, valor: 80 });
    // e quando o primeiro pregão do robô é o primeiro do eixo, não há ponto antes
    const curvaD = acumular([dia("2026-09-14", -5, 1, 0), dia("2026-09-15", 9, 1, 1)]);
    expect(curvaNoEixo(eixo, curvaD, maiorQueda(curvaD), true).queda).toEqual({ iInicio: 0, iFundo: 0, valor: 5 });

    expect(curvaNoEixo(eixo, acumular(a), null).queda).toBeNull();
    expect(curvaNoEixo(eixo, [], null)).toEqual({ acumulado: [null, null, null, null, null], noDia: [null, null, null, null, null], queda: null });
    // sem pregão no período não há linha, nem partindo de zero
    expect(curvaNoEixo(eixo, [], null, true).acumulado).toEqual([null, null, null, null, null]);
  });
});
