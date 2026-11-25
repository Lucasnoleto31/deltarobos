import { describe, expect, it } from "vitest";
import { formatarBRL } from "@/lib/formato";
import { maiorQueda } from "@/lib/stats/serie-casa";
import { curvaSimulada, type PontoSimulado } from "@/lib/stats/simulador";
import { drawdownMaximo } from "@/lib/stats/serie";
import {
  MAXIMO_DE_PARES_NA_FRASE,
  contratosEmPalavras,
  entradasEmPalavras,
  fraseAndamJuntos,
  historicoCurto,
  historicoEmPalavras,
  intervaloDeDatas,
  pregoes,
  quandoEmPalavras,
  quedaDaSimulacao,
  respostaDoSimulador,
  type DadosDaResposta,
} from "./serie-simulada";

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

// ── 25/11/2026: as frases da revisão dos indicadores (DESIGN.md, seção 9) ──────────────────────────────────

describe("contratosEmPalavras por entrada", () => {
  it("\"1 contrato\" é por entrada: a unidade inteira vai no primeiro número", () => {
    expect(contratosEmPalavras([{ nome: "Apollo", contratos: 1 }], 3, true)).toBe("1 contrato por entrada no Apollo");
    expect(contratosEmPalavras([{ nome: "Apollo", contratos: 2 }], 3, true)).toBe("2 contratos por entrada no Apollo");
    const tres = [
      { nome: "Apollo", contratos: 1 },
      { nome: "Orion", contratos: 1 },
      { nome: "Alaska", contratos: 1 },
    ];
    expect(contratosEmPalavras(tres, 3, true)).toBe("1 contrato por entrada em cada um dos 3 robôs");
    expect(contratosEmPalavras(tres.slice(0, 2), 3, true)).toBe("1 contrato por entrada em cada um dos 2 robôs escolhidos");
    expect(
      contratosEmPalavras(
        [
          { nome: "Apollo", contratos: 2 },
          { nome: "Orion", contratos: 1 },
        ],
        3,
        true,
      ),
    ).toBe("2 contratos por entrada no Apollo e 1 no Orion");
    expect(contratosEmPalavras([], 3, true)).toBe("");
  });
});

describe("entradasEmPalavras", () => {
  it("diz o máximo de entradas abertas ao mesmo tempo que a conta considera", () => {
    expect(entradasEmPalavras({ entradas: 36, medidas: true, contratos: 1, contratosAbertos: 36 })).toBe("até 36 entradas abertas ao mesmo tempo");
    expect(entradasEmPalavras({ entradas: 1, medidas: true, contratos: 1, contratosAbertos: 1 })).toBe("1 entrada aberta por vez");
  });

  it("com mais de 1 contrato por entrada, diz quantos contratos isso dá", () => {
    expect(entradasEmPalavras({ entradas: 36, medidas: true, contratos: 2, contratosAbertos: 72 })).toBe(
      "até 36 entradas abertas ao mesmo tempo (72 contratos)",
    );
    expect(entradasEmPalavras({ entradas: 1, medidas: true, contratos: 3, contratosAbertos: 3 })).toBe("1 entrada aberta por vez (3 contratos)");
    expect(entradasEmPalavras({ entradas: 36, medidas: true, contratos: 50, contratosAbertos: 1800 })).toBe(
      "até 36 entradas abertas ao mesmo tempo (1.800 contratos)",
    );
  });

  it("sem operação acompanhada ao vivo não afirma \"1 entrada\": diz que não há medição", () => {
    expect(entradasEmPalavras({ entradas: 1, medidas: false, contratos: 1, contratosAbertos: 1 })).toBe(
      "entradas ao mesmo tempo não medidas, a conta considera 1",
    );
    expect(entradasEmPalavras({ entradas: 1, medidas: false, contratos: 4, contratosAbertos: 4 })).toBe(
      "entradas ao mesmo tempo não medidas, a conta considera 1",
    );
  });
});

describe("fraseAndamJuntos", () => {
  const par = (a: string, b: string, mesmoSentido: number, diasEmComum: number) => ({ a, b, mesmoSentido, diasEmComum });

  it("sem par não há nota", () => {
    expect(fraseAndamJuntos([])).toBe("");
  });

  it("um par: os números e a conclusão numa frase só", () => {
    expect(fraseAndamJuntos([par("Apollo", "Orion", 114, 131)])).toBe(
      "Apollo e Orion ganharam ou perderam no mesmo dia em 114 de 131 pregões: usar os dois ao mesmo tempo soma o risco em vez de dividir.",
    );
  });

  it("mais de um par: um depois do outro, e a conclusão no fim", () => {
    expect(fraseAndamJuntos([par("Apollo", "Orion", 114, 131), par("Apollo", "Alaska", 1200, 1500)])).toBe(
      "Apollo e Orion ganharam ou perderam no mesmo dia em 114 de 131 pregões; Apollo e Alaska, em 1.200 de 1.500 pregões. Usar ao mesmo tempo robôs que andam juntos soma o risco em vez de dividir.",
    );
  });

  it("com muitos pares, cita os primeiros e conta os outros", () => {
    const pares = [par("A", "B", 40, 40), par("A", "C", 39, 40), par("B", "C", 38, 40), par("A", "D", 37, 40), par("B", "D", 36, 40)];
    const frase = fraseAndamJuntos(pares);
    expect(MAXIMO_DE_PARES_NA_FRASE).toBe(3);
    expect(frase).toBe(
      "A e B ganharam ou perderam no mesmo dia em 40 de 40 pregões; A e C, em 39 de 40 pregões; B e C, em 38 de 40 pregões; e mais 2 pares. Usar ao mesmo tempo robôs que andam juntos soma o risco em vez de dividir.",
    );
    expect(fraseAndamJuntos(pares.slice(0, 4))).toContain("; e mais 1 par.");
    expect(fraseAndamJuntos(pares.slice(0, 3))).not.toContain("e mais");
  });
});

describe("historicoEmPalavras", () => {
  const HOJE = "2026-11-25";

  it("desde o início: o primeiro pregão, o tempo de histórico e os pregões", () => {
    expect(historicoEmPalavras("tudo", "2018-01-03", "2026-11-25", 1995, HOJE)).toBe(
      "desde 3 de janeiro de 2018 (8 anos e 10 meses, 1.995 pregões)",
    );
    // histórico curto diz o tamanho: é o que avisa que 9 meses não são 9 anos
    expect(historicoEmPalavras("tudo", "2026-02-13", "2026-11-25", 172, HOJE)).toBe("desde 13 de fevereiro de 2026 (9 meses, 172 pregões)");
  });

  it("período que o histórico cobre: o período e quantos pregões entraram", () => {
    expect(historicoEmPalavras("12m", "2025-11-26", "2026-11-25", 241, HOJE)).toBe("nos últimos 12 meses (241 pregões)");
    expect(historicoEmPalavras("3m", "2026-08-25", "2026-11-25", 62, HOJE)).toBe("nos últimos 3 meses (62 pregões)");
    expect(historicoEmPalavras("ano", "2026-01-02", "2026-11-25", 220, HOJE)).toBe("em 2026 (220 pregões)");
    expect(historicoEmPalavras("3m", "2026-11-24", "2026-11-24", 1, HOJE)).not.toContain("nos últimos");
  });

  it("robô mais novo que o período: diz desde quando há dados em vez de afirmar o período inteiro", () => {
    expect(historicoEmPalavras("12m", "2026-02-27", "2026-11-25", 131, HOJE)).toBe("desde 27 de fevereiro de 2026 (8 meses, 131 pregões)");
    expect(historicoEmPalavras("ano", "2026-02-27", "2026-11-25", 131, HOJE)).toBe("desde 27 de fevereiro de 2026 (8 meses, 131 pregões)");
    // começar até um mês depois do início do período ainda é o período
    expect(historicoEmPalavras("12m", "2025-12-20", "2026-11-25", 230, HOJE)).toBe("nos últimos 12 meses (230 pregões)");
  });

  it("sem pregão não há o que dizer", () => {
    expect(historicoEmPalavras("tudo", null, null, 0, HOJE)).toBe("");
    expect(historicoEmPalavras("12m", "2026-01-02", "2026-01-02", 0, HOJE)).toBe("");
  });

  it("pregões no singular", () => {
    expect(pregoes(1)).toBe("1 pregão");
    expect(pregoes(1995)).toBe("1.995 pregões");
  });
});

describe("historicoCurto", () => {
  it("menos de 12 meses do primeiro ao último pregão: diz o tamanho", () => {
    expect(
      historicoCurto([
        ["2026-02-13", 10],
        ["2026-06-01", -5],
        ["2026-11-25", 7],
      ]),
    ).toBe("9 meses");
    expect(
      historicoCurto([
        ["2026-11-03", 10],
        ["2026-11-25", 7],
      ]),
    ).toBe("menos de 1 mês");
    expect(historicoCurto([["2026-11-25", 7]])).toBe("menos de 1 mês");
    // um dia antes de completar 12 meses ainda é curto
    expect(
      historicoCurto([
        ["2025-11-26", 1],
        ["2026-11-25", 1],
      ]),
    ).toBe("11 meses");
  });

  it("12 meses ou mais, ou sem pregão: nada a dizer", () => {
    expect(
      historicoCurto([
        ["2025-11-25", 1],
        ["2026-11-25", 1],
      ]),
    ).toBeNull();
    expect(
      historicoCurto([
        ["2018-01-03", 1],
        ["2026-11-24", 1],
      ]),
    ).toBeNull();
    expect(historicoCurto([])).toBeNull();
  });
});

describe("respostaDoSimulador", () => {
  const brl = (v: number) => formatarBRL(v, { inteiro: true });
  const base: DadosDaResposta = {
    semaforo: "cabe",
    capital: 200000,
    digitado: true,
    capitalMinimo: 102886,
    capitalMinimoConhecido: 102886,
    capitalQueFalta: 0,
    escolha: "1 contrato por entrada em cada um dos 3 robôs",
    semMinimo: [],
  };

  it("não cabe: o capital, o capital mínimo da escolha e quanto falta", () => {
    const r = respostaDoSimulador({ ...base, semaforo: "nao_cabe", capital: 30000, capitalQueFalta: 72886 });
    expect(r.estado).toBe("nao_cabe");
    expect(r.titulo).toBe("Não cabe");
    expect(r.frase).toBe(`${brl(30000)} ficam abaixo de ${brl(102886)}, o capital mínimo para estes robôs e contratos. Faltam ${brl(72886)}.`);
  });

  it("apertado: cobre o mínimo, mas a maior queda passa do limite", () => {
    const r = respostaDoSimulador({ ...base, semaforo: "apertado", capital: 110000 });
    expect(r.titulo).toBe("Apertado");
    expect(r.frase).toBe(
      `${brl(110000)} cobrem o capital mínimo para estes robôs e contratos, ${brl(102886)}, mas a maior queda do período passou de 25% do capital.`,
    );
  });

  it("cabe: cobre o mínimo e a maior queda fica dentro do limite", () => {
    const r = respostaDoSimulador(base);
    expect(r.titulo).toBe("Cabe");
    expect(r.frase).toBe(
      `${brl(200000)} cobrem o capital mínimo para estes robôs e contratos, ${brl(102886)}, e a maior queda do período ficou dentro de 25% do capital.`,
    );
  });

  it("capital igual ao mínimo, digitado: não repete o número", () => {
    const r = respostaDoSimulador({ ...base, semaforo: "apertado", capital: 102886 });
    expect(r.frase).toBe(
      `${brl(102886)} são exatamente o capital mínimo para estes robôs e contratos, mas a maior queda do período passou de 25% do capital.`,
    );
  });

  it("sem capital digitado: o título é o capital mínimo da escolha, e a frase diz como a conta fica com ele", () => {
    const apertado = respostaDoSimulador({ ...base, semaforo: "apertado", capital: 102886, digitado: false });
    expect(apertado.estado).toBe("minimo");
    expect(apertado.titulo).toBe(`Capital mínimo de ${brl(102886)}`);
    expect(apertado.frase).toBe(
      "Para 1 contrato por entrada em cada um dos 3 robôs. Sem capital digitado, a simulação usa esse valor, e com ele a maior queda do período passou de 25% do capital: fica apertado.",
    );
    const cabe = respostaDoSimulador({ ...base, semaforo: "cabe", capital: 102886, digitado: false });
    expect(cabe.frase).toBe(
      "Para 1 contrato por entrada em cada um dos 3 robôs. Sem capital digitado, a simulação usa esse valor, e com ele a maior queda do período ficou dentro de 25% do capital.",
    );
  });

  it("o termo \"capital mínimo\" aparece uma vez só, no título ou na frase: é ele que abre a explicação", () => {
    const vezes = (t: string) => (t.match(/capital mínimo/gi) ?? []).length;
    const casos: DadosDaResposta[] = [
      base,
      { ...base, semaforo: "apertado" },
      { ...base, semaforo: "nao_cabe", capital: 30000, capitalQueFalta: 72886 },
      { ...base, semaforo: "apertado", capital: 102886 },
      { ...base, semaforo: "apertado", capital: 102886, digitado: false },
      { ...base, capitalMinimo: null, capitalMinimoConhecido: 53262, semMinimo: ["Alaska"] },
    ];
    for (const c of casos) {
      const r = respostaDoSimulador(c);
      expect(vezes(r.titulo) + vezes(r.frase)).toBe(1);
    }
  });

  it("robô sem garantia cadastrada: a soma dos outros vale como piso, e a frase diz quem ficou de fora", () => {
    const semTotal = { ...base, capitalMinimo: null, capitalMinimoConhecido: 53262, semMinimo: ["Alaska"] };
    expect(respostaDoSimulador({ ...semTotal, semaforo: "nao_cabe", capital: 30000, capitalQueFalta: 23262 }).frase).toBe(
      `${brl(30000)} ficam abaixo de ${brl(53262)}, o capital mínimo dos robôs com garantia cadastrada. Faltam ${brl(23262)}. Sem garantia cadastrada: Alaska; a soma dos outros vale como piso.`,
    );
    expect(respostaDoSimulador({ ...semTotal, semaforo: "cabe", capital: 200000 }).frase).toBe(
      `${brl(200000)} cobrem o capital mínimo dos robôs com garantia cadastrada, ${brl(53262)}, e a maior queda do período ficou dentro de 25% do capital. Sem garantia cadastrada: Alaska; a soma dos outros vale como piso.`,
    );
  });

  it("nenhum robô com garantia cadastrada: só a maior queda decide", () => {
    const nada = { ...base, capitalMinimo: null, capitalMinimoConhecido: 0, semMinimo: ["Alaska"] };
    expect(respostaDoSimulador({ ...nada, semaforo: "apertado", capital: 1000 }).frase).toBe(
      "A maior queda do período passou de 25% do capital. Sem garantia cadastrada: Alaska; só a maior queda decide.",
    );
    expect(respostaDoSimulador({ ...nada, semaforo: "nao_cabe", capital: 1000 }).frase).toBe(
      `A maior queda do período teria consumido os ${brl(1000)} inteiros. Sem garantia cadastrada: Alaska; só a maior queda decide.`,
    );
  });

  it("singular: R$ 1 fica, falta R$ 1", () => {
    const r = respostaDoSimulador({ ...base, semaforo: "nao_cabe", capital: 1, capitalMinimo: 2, capitalMinimoConhecido: 2, capitalQueFalta: 1 });
    expect(r.frase).toBe(`${brl(1)} fica abaixo de ${brl(2)}, o capital mínimo para estes robôs e contratos. Falta ${brl(1)}.`);
  });
});
