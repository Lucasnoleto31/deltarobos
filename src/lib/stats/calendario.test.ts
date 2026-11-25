import { describe, expect, it } from "vitest";
import {
  anosComFeriados,
  anosDoHistorico,
  ehPregaoSemOperacao,
  gradeMes,
  historicoCurto,
  janelaConhecida,
  mesesComDados,
  resumirPeriodo,
} from "./calendario";
import type { DiaResultado } from "./serie-casa";
import type { LinhaDiaria, OpcoesSerie } from "./tipos";

function linha(dia: string, brl: number, n = 1): LinhaDiaria {
  return {
    dia,
    pontos_por_contrato: brl / 0.2,
    resultado_brl_por_contrato: brl,
    custos_brl_por_contrato: 0,
    n_operacoes: n,
    n_gain: brl > 0 ? n : 0,
    n_loss: brl < 0 ? n : 0,
    soma_gain_brl_por_contrato: brl > 0 ? brl : 0,
    soma_loss_brl_por_contrato: brl < 0 ? brl : 0,
    maior_gain_brl_por_contrato: brl > 0 ? brl : 0,
    maior_loss_brl_por_contrato: brl < 0 ? brl : 0,
  };
}

const o: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: 0.2 };
const linhas = [
  linha("2026-08-31", 10),
  linha("2026-09-01", 100, 3),
  linha("2026-09-02", -40),
  linha("2026-09-04", 25),
];

describe("gradeMes", () => {
  const g = gradeMes(linhas, "2026-09", o, ["2026-09-07"]);

  it("setembro/2026 começa numa terça e ocupa 5 semanas", () => {
    expect(g.semanas).toHaveLength(5);
    expect(g.semanas[0][0].dia).toBe("2026-08-30"); // domingo anterior
    expect(g.semanas[0][0].foraDoMes).toBe(true);
    expect(g.semanas[0][2].dia).toBe("2026-09-01");
    expect(g.semanas[0][2].foraDoMes).toBe(false);
  });

  it("valores, totais e feriado", () => {
    expect(g.semanas[0][2].valor).toBe(100);
    expect(g.semanas[0][2].nOperacoes).toBe(3);
    expect(g.semanas[0][3].valor).toBe(-40);
    expect(g.semanas[0][4].valor).toBeNull(); // 03/09 sem operação
    expect(g.total).toBe(85);
    expect(g.nDias).toBe(3);
    expect(g.nPositivos).toBe(2);
    expect(g.nNegativos).toBe(1);
    const feriado = g.semanas[1].find((d) => d.dia === "2026-09-07");
    expect(feriado?.pregao).toBe(false);
    const sabado = g.semanas[0][6];
    expect(sabado.pregao).toBe(false);
  });

  it("dia de outro mês não conta mesmo com linha", () => {
    expect(g.semanas[0][1].dia).toBe("2026-08-31");
    expect(g.semanas[0][1].valor).toBeNull();
  });
});

describe("mesesComDados", () => {
  it("meses com dados em ordem", () => {
    expect(mesesComDados(linhas)).toEqual(["2026-08", "2026-09"]);
  });
});

describe("janelaConhecida", () => {
  const operou = ["2026-11-03", "2026-11-18", "2026-11-04"];

  it("sem operação nenhuma não há janela", () => {
    expect(janelaConhecida([], "2026-11-25", true)).toBeNull();
  });

  it("robô acompanhado ao vivo: do primeiro dia até ontem (hoje ainda não acabou)", () => {
    expect(janelaConhecida(operou, "2026-11-25", true)).toEqual({ de: "2026-11-03", ate: "2026-11-24" });
  });

  it("se já operou hoje, hoje é o último dia conhecido", () => {
    expect(janelaConhecida([...operou, "2026-11-25"], "2026-11-25", true)).toEqual({ de: "2026-11-03", ate: "2026-11-25" });
  });

  it("só histórico importado: até o último dia com operação, e não além", () => {
    expect(janelaConhecida(operou, "2026-11-25", false)).toEqual({ de: "2026-11-03", ate: "2026-11-18" });
  });
});

describe("ehPregaoSemOperacao", () => {
  const feriados = ["2026-11-02", "2026-11-20"];
  const anos = anosComFeriados(feriados);
  const janela = { de: "2026-11-03", ate: "2026-11-24" };

  it("dia útil dentro da janela, fora dos feriados: a bolsa abriu e o robô não operou", () => {
    expect(ehPregaoSemOperacao("2026-11-19", feriados, anos, janela)).toBe(true);
    expect(ehPregaoSemOperacao("2026-11-24", feriados, anos, janela)).toBe(true);
  });

  it("feriado e fim de semana não são pregão", () => {
    expect(ehPregaoSemOperacao("2026-11-20", feriados, anos, janela)).toBe(false);
    expect(ehPregaoSemOperacao("2026-11-21", feriados, anos, janela)).toBe(false);
    expect(ehPregaoSemOperacao("2026-11-22", feriados, anos, janela)).toBe(false);
  });

  it("antes do primeiro dia e depois do último conhecido não afirma nada", () => {
    expect(ehPregaoSemOperacao("2026-10-30", feriados, anos, janela)).toBe(false);
    expect(ehPregaoSemOperacao("2026-11-25", feriados, anos, janela)).toBe(false);
    expect(ehPregaoSemOperacao("2026-11-19", feriados, anos, null)).toBe(false);
  });

  it("ano sem feriado cadastrado: não dá para saber se a bolsa abriu", () => {
    expect([...anos]).toEqual(["2026"]);
    expect(ehPregaoSemOperacao("2025-12-25", feriados, anos, { de: "2025-01-02", ate: "2026-11-24" })).toBe(false);
    expect(ehPregaoSemOperacao("2025-03-11", feriados, anos, { de: "2025-01-02", ate: "2026-11-24" })).toBe(false);
  });
});

describe("gradeMes com a janela conhecida", () => {
  const feriados = ["2026-09-07"];
  // setembro/2026: operou em 01, 02 e 04; a janela vai de 01/09 a 10/09
  const g = gradeMes(linhas, "2026-09", o, feriados, { de: "2026-09-01", ate: "2026-09-10" });
  const dia = (d: string) => g.semanas.flat().find((c) => c.dia === d && !c.foraDoMes);

  it("marca o pregão sem operação, e só ele", () => {
    expect(dia("2026-09-03")?.naoOperou).toBe(true);
    expect(dia("2026-09-08")?.naoOperou).toBe(true);
    expect(dia("2026-09-01")?.naoOperou).toBe(false); // operou
    expect(dia("2026-09-07")?.naoOperou).toBe(false); // feriado
    expect(dia("2026-09-05")?.naoOperou).toBe(false); // sábado
    expect(dia("2026-09-11")?.naoOperou).toBe(false); // depois do último dia conhecido
  });

  it("conta os pregões sem operação do mês", () => {
    // 03, 08, 09 e 10 de setembro
    expect(g.nNaoOperou).toBe(4);
    expect(g.nDias).toBe(3);
  });

  it("sem janela, nenhum dia é marcado", () => {
    const semJanela = gradeMes(linhas, "2026-09", o, feriados);
    expect(semJanela.nNaoOperou).toBe(0);
    expect(semJanela.semanas.flat().some((c) => c.naoOperou)).toBe(false);
  });

  it("dia vizinho, de outro mês, nunca é marcado", () => {
    const outubro = gradeMes(linhas, "2026-10", o, feriados, { de: "2026-09-01", ate: "2026-10-30" });
    expect(outubro.semanas[0].filter((c) => c.foraDoMes).every((c) => !c.naoOperou)).toBe(true);
  });
});

function dias(...pares: Array<[string, number]>): DiaResultado[] {
  return pares.map(([dia, valor]) => ({ dia, valor, n: 1, g: valor > 0 ? 1 : 0 }));
}

describe("resumirPeriodo", () => {
  it("soma, dias com ganho, pior dia e a maior queda de dentro do período", () => {
    const r = resumirPeriodo(dias(["2026-09-01", 100], ["2026-09-02", -40], ["2026-09-03", -30], ["2026-09-04", 50]));
    expect(r.total).toBe(80);
    expect(r.dias).toBe(4);
    expect(r.comGanho).toBe(2);
    expect(r.pior).toEqual({ dia: "2026-09-02", valor: -40 });
    // do ponto mais alto (100, em 01/09) ao mais baixo que veio depois (30, em 03/09)
    expect(r.maiorQueda).toBe(70);
  });

  it("o período parte de zero: começar perdendo já é queda", () => {
    const r = resumirPeriodo(dias(["2026-09-01", -25], ["2026-09-02", 60]));
    expect(r.maiorQueda).toBe(25);
    expect(r.total).toBe(35);
  });

  it("período só de ganho não tem pior dia nem queda", () => {
    const r = resumirPeriodo(dias(["2026-09-01", 10], ["2026-09-02", 20]));
    expect(r.pior).toBeNull();
    expect(r.maiorQueda).toBe(0);
  });

  it("não depende da ordem em que os dias chegam", () => {
    const r = resumirPeriodo(dias(["2026-09-03", -30], ["2026-09-01", 100], ["2026-09-02", -40]));
    expect(r.maiorQueda).toBe(70);
  });

  it("sem dias devolve zeros", () => {
    expect(resumirPeriodo([])).toEqual({ total: 0, dias: 0, comGanho: 0, pior: null, maiorQueda: 0 });
  });
});

describe("anosDoHistorico", () => {
  const historico = dias(
    ["2025-12-15", 7],
    ["2025-12-16", -20],
    ["2026-08-31", 10],
    ["2026-09-01", 100],
    ["2026-09-02", -40],
    ["2026-09-04", 25],
    ["2026-10-01", -60],
  );
  const anos = anosDoHistorico(historico);

  it("anos e meses do mais recente para o mais antigo", () => {
    expect(anos.map((a) => a.ano)).toEqual(["2026", "2025"]);
    expect(anos[0].meses.map((m) => m.mes)).toEqual(["2026-10", "2026-09", "2026-08"]);
    expect(anos[1].meses.map((m) => m.mes)).toEqual(["2025-12"]);
  });

  it("cada mês com o resultado, os dias com ganho e a maior queda de dentro dele", () => {
    const setembro = anos[0].meses[1];
    expect(setembro).toMatchObject({ mes: "2026-09", total: 85, dias: 3, comGanho: 2, maiorQueda: 40 });
    expect(anos[0].meses[0]).toMatchObject({ mes: "2026-10", total: -60, dias: 1, comGanho: 0, maiorQueda: 60 });
  });

  it("cada ano com a soma, os meses com ganho e a maior queda de dentro do ano", () => {
    expect(anos[0]).toMatchObject({ total: 35, dias: 5, comGanho: 3, mesesComGanho: 2 });
    // do ponto mais alto do ano (110, em 01/09) ao mais baixo depois dele (35, em 01/10)
    expect(anos[0].maiorQueda).toBe(75);
    expect(anos[1]).toMatchObject({ total: -13, mesesComGanho: 0, maiorQueda: 20 });
  });

  it("a soma dos meses é a soma do ano", () => {
    for (const a of anos) expect(a.meses.reduce((s, m) => s + m.total, 0)).toBeCloseTo(a.total, 6);
  });

  it("sem dias, lista vazia", () => {
    expect(anosDoHistorico([])).toEqual([]);
  });
});

describe("historicoCurto", () => {
  it("menos de 12 meses do primeiro ao último dia", () => {
    expect(historicoCurto("2026-02-12", "2026-11-25")).toBe(true);
    expect(historicoCurto("2025-11-26", "2026-11-25")).toBe(true);
  });

  it("12 meses ou mais não é curto", () => {
    expect(historicoCurto("2025-11-25", "2026-11-25")).toBe(false);
    expect(historicoCurto("2018-01-02", "2026-11-24")).toBe(false);
  });
});
