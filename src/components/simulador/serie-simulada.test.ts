import { describe, expect, it } from "vitest";
import { maiorQueda } from "@/lib/stats/serie-casa";
import { curvaSimulada, type PontoSimulado } from "@/lib/stats/simulador";
import { drawdownMaximo } from "@/lib/stats/serie";
import { contratosEmPalavras, intervaloDeDatas, quandoEmPalavras, quedaDaSimulacao } from "./serie-simulada";

const CAPITAL = 10000;

function serieDe(valores: Array<[string, number]>, capital = CAPITAL): PontoSimulado[] {
  return curvaSimulada(
    valores.map(([dia, valor]) => ({ dia, valor })),
    capital,
  );
}

const queda = (serie: PontoSimulado[]) => quedaDaSimulacao(serie, drawdownMaximo(serie));

describe("quedaDaSimulacao", () => {
  it("série vazia ou curva que nunca recuou = nada para pintar", () => {
    expect(queda([])).toBeNull();
    expect(
      queda(
        serieDe([
          ["2026-09-01", 100],
          ["2026-09-02", 0],
          ["2026-09-03", 50],
        ]),
      ),
    ).toBeNull();
  });

  it("acha o pico e o fundo nos índices da curva, com o valor que a simulação calculou", () => {
    const serie = serieDe([
      ["2026-09-01", 300],
      ["2026-09-02", -500],
      ["2026-09-03", 100],
      ["2026-09-04", -150],
      ["2026-09-07", 400],
    ]);
    // o zero do desenho é o capital inicial: a curva é o acumulado, não o patrimônio
    expect(serie.map((p) => p.acumulado)).toEqual([300, -200, -100, -250, 150]);
    expect(serie.map((p) => p.patrimonio)).toEqual([10300, 9800, 9900, 9750, 10150]);
    // do pico de 300 (dia 01) ao fundo de -250 (dia 04)
    expect(queda(serie)).toEqual({ iInicio: 0, iFundo: 3, valor: 550 });
    // é a mesma queda que a página inicial pinta com maiorQueda
    expect(queda(serie)).toEqual(maiorQueda(serie));
  });

  it("queda que começa na partida: o capital inicial é o pico, e o início é -1", () => {
    const serie = serieDe([
      ["2026-09-01", -200],
      ["2026-09-02", -100],
      ["2026-09-03", 900],
    ]);
    expect(queda(serie)).toEqual({ iInicio: -1, iFundo: 1, valor: 300 });
    // quando o primeiro pregão já é o fundo
    expect(
      queda(
        serieDe([
          ["2026-09-01", -80],
          ["2026-09-02", 30],
        ]),
      ),
    ).toEqual({ iInicio: -1, iFundo: 0, valor: 80 });
  });

  it("com a curva parada no pico, o trecho começa no último dia em que ela esteve lá (o início que a tela escreve)", () => {
    const serie = serieDe([
      ["2026-09-01", 300],
      ["2026-09-02", 0],
      ["2026-09-03", -120],
    ]);
    const dd = drawdownMaximo(serie);
    expect(dd.inicio).toBe("2026-09-02");
    expect(quedaDaSimulacao(serie, dd)).toEqual({ iInicio: 1, iFundo: 2, valor: 120 });
  });

  it("drawdown de outra série (dia que não está na curva) não pinta nada", () => {
    const serie = serieDe([["2026-09-01", 100]]);
    expect(quedaDaSimulacao(serie, { valor: 50, inicio: "2026-08-01", fundo: "2026-08-02", recuperacao: null, diasAteRecuperar: null })).toBeNull();
  });
});

describe("contratosEmPalavras", () => {
  it("um robô só: o número de contratos e o nome", () => {
    expect(contratosEmPalavras([{ nome: "Apollo", contratos: 1 }], 3)).toBe("1 contrato no Apollo");
    expect(contratosEmPalavras([{ nome: "Apollo", contratos: 2 }], 3)).toBe("2 contratos no Apollo");
  });

  it("todos com o mesmo número: \"em cada um\", e \"escolhidos\" quando nem todos os robôs entraram", () => {
    const tres = [
      { nome: "Apollo", contratos: 1 },
      { nome: "Orion", contratos: 1 },
      { nome: "Alaska", contratos: 1 },
    ];
    expect(contratosEmPalavras(tres, 3)).toBe("1 contrato em cada um dos 3 robôs");
    expect(contratosEmPalavras(tres.slice(0, 2), 3)).toBe("1 contrato em cada um dos 2 robôs escolhidos");
    expect(contratosEmPalavras(tres.map((r) => ({ ...r, contratos: 5 })), 3)).toBe("5 contratos em cada um dos 3 robôs");
  });

  it("números diferentes: um por um, com \"contratos\" só no primeiro", () => {
    expect(
      contratosEmPalavras(
        [
          { nome: "Apollo", contratos: 2 },
          { nome: "Orion", contratos: 1 },
        ],
        3,
      ),
    ).toBe("2 contratos no Apollo e 1 no Orion");
    expect(
      contratosEmPalavras(
        [
          { nome: "Apollo", contratos: 1 },
          { nome: "Orion", contratos: 3 },
          { nome: "Alaska", contratos: 1000 },
        ],
        3,
      ),
    ).toBe("1 contrato no Apollo, 3 no Orion e 1.000 no Alaska");
  });

  it("sem robô escolhido não há o que dizer", () => {
    expect(contratosEmPalavras([], 3)).toBe("");
  });
});

describe("quandoEmPalavras", () => {
  const HOJE = "2026-11-25";

  it("os períodos que terminam hoje dizem o tamanho; o ano diz qual", () => {
    expect(quandoEmPalavras("3m", "2026-08-26", HOJE)).toBe("nos últimos 3 meses");
    expect(quandoEmPalavras("12m", "2025-11-26", HOJE)).toBe("nos últimos 12 meses");
    expect(quandoEmPalavras("ano", "2026-01-05", HOJE)).toBe("em 2026");
  });

  it("desde o início diz o primeiro pregão da simulação por extenso", () => {
    expect(quandoEmPalavras("tudo", "2024-01-02", HOJE)).toBe("desde 2 de janeiro de 2024");
    expect(quandoEmPalavras("tudo", null, HOJE)).toBe("");
  });
});

describe("intervaloDeDatas", () => {
  it("no mesmo ano a primeira data vai curta; com a virada do ano no meio, as duas inteiras", () => {
    expect(intervaloDeDatas("2026-09-14", "2026-09-16")).toBe("14/09 a 16/09/2026");
    expect(intervaloDeDatas("2025-12-31", "2026-01-02")).toBe("31/12/2025 a 02/01/2026");
  });

  it("queda de um dia só: uma data", () => {
    expect(intervaloDeDatas("2026-09-14", "2026-09-14")).toBe("14/09/2026");
  });
});
