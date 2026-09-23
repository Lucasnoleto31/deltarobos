import { describe, expect, it } from "vitest";
import { formatarHora } from "@/lib/formato";
import type { BaldeCompacto, EventoSaldo, FechamentoCompacto, SaldoDoDia } from "@/lib/tipos";
import {
  BUCKET_SEG_PADRAO,
  OFFSET_BRASILIA_SEG,
  PONTOS_SALDO,
  SALDO_HOJE_VAZIO,
  TOLERANCIA_INICIO_SEG,
  baldeDaLinha,
  baldesDoEvento,
  dentesPorOperacao,
  ehCorpoSaldoDoDia,
  envelopeDeDentes,
  epochBrasilia,
  fechamentosDasOperacoes,
  fechamentosNaCurva,
  fundirBaldes,
  horarioDaJanela,
  inferirBucketSeg,
  inicioDaMedicao,
  janelaDoDia,
  legendaDoSaldo,
  liquidarSerie,
  mepMenDaSerie,
  posicaoNaJanela,
  reduzirBaldes,
  rotulosDeHora,
} from "./saldo-dia";

// Tudo com datas fixas (23/09/2026, quarta-feira): nada aqui olha o relógio.
const DIA = "2026-09-23";
/** 10:00 em Brasília = 13:00 UTC */
const T0 = Date.UTC(2026, 8, 23, 13) / 1000;
const HORARIO = { inicio: "09:00", fim: "18:00" };
const b = (t: number, min: number, max: number, ultimo: number): BaldeCompacto => [t, min, max, ultimo];

/** Congela a lista e cada tupla: qualquer mutação estoura em módulo ESM (modo estrito). */
const congelar = <T extends readonly unknown[]>(lista: T): T => {
  for (const item of lista) if (Array.isArray(item)) Object.freeze(item);
  return Object.freeze(lista) as T;
};

describe("epochBrasilia e a janela do dia", () => {
  it("09:00 em Brasília é 12:00 UTC (UTC-3 sem horário de verão)", () => {
    expect(OFFSET_BRASILIA_SEG).toBe(-10_800);
    expect(epochBrasilia(DIA, "09:00")).toBe(Date.UTC(2026, 8, 23, 12) / 1000);
    expect(epochBrasilia(DIA, "10:00")).toBe(T0);
    // com segundos, e "09:00:00" igual a "09:00"
    expect(epochBrasilia(DIA, "09:00:30")).toBe(Date.UTC(2026, 8, 23, 12, 0, 30) / 1000);
    expect(epochBrasilia(DIA, "09:00:00")).toBe(epochBrasilia(DIA, "09:00"));
    // ilegível é NaN, não uma data qualquer
    expect(epochBrasilia("23/09/2026", "09:00")).toBeNaN();
    expect(epochBrasilia(DIA, "9h")).toBeNaN();
  });

  it("horarioDaJanela: o do robô quando cadastrado, senão o do pregão, campo a campo", () => {
    const pregao = { inicio: "09:00", fim: "18:00" };
    expect(horarioDaJanela({ horario_inicio: "09:15", horario_fim: "16:30" }, pregao)).toEqual({ inicio: "09:15", fim: "16:30" });
    expect(horarioDaJanela({ horario_inicio: null, horario_fim: null }, pregao)).toEqual(pregao);
    expect(horarioDaJanela({ horario_inicio: "10:00:00", horario_fim: null }, pregao)).toEqual({ inicio: "10:00:00", fim: "18:00" });
  });

  it("janelaDoDia: o horário do robô, esticado pelos baldes e pelos fechamentos", () => {
    const inicio = epochBrasilia(DIA, "09:00");
    const fim = epochBrasilia(DIA, "18:00");
    expect(janelaDoDia(DIA, HORARIO, [], 5)).toEqual({ inicio, fim });
    // baldes dentro do horário não mudam nada
    expect(janelaDoDia(DIA, HORARIO, [b(T0, 0, 1, 1), b(T0 + 5, 0, 1, 1)], 5)).toEqual({ inicio, fim });
    // balde antes da abertura puxa o início; o último balde + bucketSeg puxa o fim
    const cedo = epochBrasilia(DIA, "08:50");
    const tarde = epochBrasilia(DIA, "18:10");
    expect(janelaDoDia(DIA, HORARIO, [b(cedo, 0, 1, 1), b(tarde, 0, 1, 1)], 5)).toEqual({ inicio: cedo, fim: tarde + 5 });
    // fechamento depois do último balde puxa o fim; antes do primeiro, o início
    const fechamentos: FechamentoCompacto[] = [[epochBrasilia(DIA, "08:40"), 1], [epochBrasilia(DIA, "18:20"), 1]];
    expect(janelaDoDia(DIA, HORARIO, [b(T0, 0, 1, 1)], 5, fechamentos)).toEqual({ inicio: fechamentos[0][0], fim: fechamentos[1][0] });
    // empate (robô com início = fim e nada mais): fim = início + bucketSeg
    expect(janelaDoDia(DIA, { inicio: "09:00", fim: "09:00" }, [], 5)).toEqual({ inicio, fim: inicio + 5 });
  });

  it("posicaoNaJanela: fração presa às pontas", () => {
    const janela = { inicio: T0, fim: T0 + 100 };
    expect(posicaoNaJanela(T0, janela)).toBe(0);
    expect(posicaoNaJanela(T0 + 25, janela)).toBe(0.25);
    expect(posicaoNaJanela(T0 + 100, janela)).toBe(1);
    expect(posicaoNaJanela(T0 - 10, janela)).toBe(0);
    expect(posicaoNaJanela(T0 + 110, janela)).toBe(1);
    expect(posicaoNaJanela(T0, { inicio: T0, fim: T0 })).toBe(0);
  });

  it("rotulosDeHora: 09:00 a 18:00 dá 10 rótulos, com x 0 e 100 nas pontas", () => {
    const janela = janelaDoDia(DIA, HORARIO, [], 5);
    const rotulos = rotulosDeHora(janela);
    expect(rotulos.map((r) => r.rotulo)).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"]);
    expect(rotulos[0].x).toBe(0);
    expect(rotulos[9].x).toBe(100);
    expect(rotulos[1].x).toBeCloseTo(100 / 9, 10);
    // janela que começa no meio da hora: o primeiro rótulo é a próxima hora cheia
    const meia = rotulosDeHora({ inicio: epochBrasilia(DIA, "09:30"), fim: epochBrasilia(DIA, "11:30") });
    expect(meia.map((r) => r.rotulo)).toEqual(["10:00", "11:00"]);
    expect(meia[0].x).toBe(25);
    // acima de 12 horas, uma sim outra não
    const longa = rotulosDeHora({ inicio: epochBrasilia(DIA, "06:00"), fim: epochBrasilia(DIA, "19:00") });
    expect(longa.map((r) => r.rotulo)).toEqual(["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00"]);
    expect(rotulosDeHora({ inicio: T0, fim: T0 })).toEqual([]);
  });
});

describe("baldeDaLinha e baldesDoEvento", () => {
  it("linha da view vira [t, min, max, ultimo] com t em segundos; `em` ilegível é null", () => {
    expect(baldeDaLinha({ em: "2026-09-23T13:00:00+00:00", min_brl_por_contrato: -10, max_brl_por_contrato: 5, ultimo_brl_por_contrato: 2 })).toEqual([T0, -10, 5, 2]);
    // o mesmo instante escrito em Brasília
    expect(baldeDaLinha({ em: "2026-09-23T10:00:05-03:00", min_brl_por_contrato: 0, max_brl_por_contrato: 0, ultimo_brl_por_contrato: 0 })).toEqual([T0 + 5, 0, 0, 0]);
    expect(baldeDaLinha({ em: "ontem", min_brl_por_contrato: 0, max_brl_por_contrato: 0, ultimo_brl_por_contrato: 0 })).toBeNull();
    expect(baldeDaLinha({ em: "2026-09-23T13:00:00Z", min_brl_por_contrato: Number.NaN, max_brl_por_contrato: 0, ultimo_brl_por_contrato: 0 })).toBeNull();
  });

  it("fusão de eventos: o mesmo balde refinado dá um balde só, com os extremos e o último do segundo", () => {
    const ev1: EventoSaldo = {
      slug: "robo-a",
      dia: DIA,
      baldes: [
        { em: "2026-09-23T13:00:00+00:00", min: -10, max: 5, ultimo: 2 },
        { em: "2026-09-23T13:00:05+00:00", min: 0, max: 8, ultimo: 8 },
      ],
    };
    const ev2: EventoSaldo = {
      slug: "robo-a",
      dia: DIA,
      baldes: [
        // o balde das 13:00:05 chegou de novo, refinado: mínimo menor, máximo maior, último diferente
        { em: "2026-09-23T13:00:05+00:00", min: -3, max: 12, ultimo: 7 },
        // item ilegível é descartado sem derrubar o resto
        { em: "lixo", min: 1, max: 2, ultimo: 1 },
        { em: "2026-09-23T13:00:10+00:00", min: 4, max: 9, ultimo: 6 },
      ],
    };
    expect(baldesDoEvento(ev1)).toEqual([
      [T0, -10, 5, 2],
      [T0 + 5, 0, 8, 8],
    ]);
    expect(baldesDoEvento(ev2)).toEqual([
      [T0 + 5, -3, 12, 7],
      [T0 + 10, 4, 9, 6],
    ]);
    expect(fundirBaldes(baldesDoEvento(ev1), baldesDoEvento(ev2))).toEqual([
      [T0, -10, 5, 2],
      [T0 + 5, -3, 12, 7],
      [T0 + 10, 4, 9, 6],
    ]);
    // e o mesmo evento aplicado duas vezes não muda nada
    const umaVez = fundirBaldes([], baldesDoEvento(ev1));
    expect(fundirBaldes(umaVez, baldesDoEvento(ev1))).toEqual(umaVez);
  });

  it("baldesDoEvento ordena por t e tolera payload malformado", () => {
    expect(
      baldesDoEvento({
        baldes: [
          { em: "2026-09-23T13:00:10+00:00", min: 1, max: 2, ultimo: 2 },
          { em: "2026-09-23T13:00:00+00:00", min: 0, max: 1, ultimo: 1 },
        ],
      }).map((x) => x[0]),
    ).toEqual([T0, T0 + 10]);
    expect(baldesDoEvento({ baldes: undefined as unknown as EventoSaldo["baldes"] })).toEqual([]);
    expect(baldesDoEvento({ baldes: [null, 1, "x", { em: 5 }] as unknown as EventoSaldo["baldes"] })).toEqual([]);
  });
});

describe("fundirBaldes", () => {
  it("ordena por t, não duplica, mínimo só desce, máximo só sobe e o último é o do novo", () => {
    const atuais = congelar([b(T0, -10, 5, 2), b(T0 + 5, 0, 8, 8)]);
    const novos = congelar([b(T0 + 10, 1, 3, 2), b(T0 + 5, -2, 6, 4), b(T0 - 5, 0, 0, 0)]);
    const antesAtuais = JSON.stringify(atuais);
    const antesNovos = JSON.stringify(novos);
    const fundido = fundirBaldes(atuais, novos);
    expect(fundido).toEqual([
      [T0 - 5, 0, 0, 0],
      [T0, -10, 5, 2],
      // min = menor dos dois (−2), max = maior (8), último = o novo (4)
      [T0 + 5, -2, 8, 4],
      [T0 + 10, 1, 3, 2],
    ]);
    // lista nova, entradas intactas
    expect(fundido).not.toBe(atuais);
    expect(JSON.stringify(atuais)).toBe(antesAtuais);
    expect(JSON.stringify(novos)).toBe(antesNovos);
    // o último que chegou manda mesmo quando "regride"
    expect(fundirBaldes([b(T0, 0, 10, 10)], [b(T0, 0, 10, 3)])).toEqual([[T0, 0, 10, 3]]);
  });

  it("t repetido dentro do próprio lote novo: vale o último, com os extremos dos dois", () => {
    expect(fundirBaldes([], [b(T0, -1, 1, 0), b(T0, -5, 0, -2)])).toEqual([[T0, -5, 1, -2]]);
  });

  it("fundirBaldes(x, []) devolve x, e com nada de nada devolve vazio", () => {
    const x = [b(T0, 0, 1, 1)];
    expect(fundirBaldes(x, [])).toBe(x);
    expect(fundirBaldes([], [])).toEqual([]);
  });
});

describe("inferirBucketSeg e fechamentosDasOperacoes", () => {
  it("o menor intervalo positivo entre baldes consecutivos; 5 quando não dá para saber", () => {
    expect(BUCKET_SEG_PADRAO).toBe(5);
    expect(inferirBucketSeg([])).toBe(5);
    expect(inferirBucketSeg([b(T0, 0, 0, 0)])).toBe(5);
    expect(inferirBucketSeg([b(T0, 0, 0, 0), b(T0 + 10, 0, 0, 0), b(T0 + 15, 0, 0, 0), b(T0 + 30, 0, 0, 0)])).toBe(5);
    expect(inferirBucketSeg([b(T0, 0, 0, 0), b(T0 + 60, 0, 0, 0)])).toBe(60);
    // t repetido (diferença zero) não conta
    expect(inferirBucketSeg([b(T0, 0, 0, 0), b(T0, 0, 0, 0), b(T0 + 10, 0, 0, 0)])).toBe(10);
  });

  it("fechamentos compactos em ordem de t, fechamento ilegível fora", () => {
    const ops = [
      { fechamento_em: "2026-09-23T13:00:12.000Z", custos_brl_por_contrato: 2 },
      { fechamento_em: "2026-09-23T13:00:05+00:00", custos_brl_por_contrato: 1.5 },
      { fechamento_em: "sem data", custos_brl_por_contrato: 9 },
      { fechamento_em: "2026-09-23T13:00:30Z", custos_brl_por_contrato: Number.NaN },
    ];
    expect(fechamentosDasOperacoes(ops)).toEqual([
      [T0 + 5, 1.5],
      [T0 + 12, 2],
      [T0 + 30, 0],
    ]);
    expect(fechamentosDasOperacoes([])).toEqual([]);
  });
});

describe("liquidarSerie", () => {
  const baldes = congelar([b(T0, -10, 5, 2), b(T0 + 5, 0, 8, 8), b(T0 + 10, 3, 9, 4)]);
  const fechamentos = congelar<FechamentoCompacto[]>([
    [T0 + 12, 2],
    [T0 + 5, 1.5],
  ]);

  it("desconta só os custos dos fechamentos ANTERIORES ao fim de cada balde (t < t + bucketSeg: o balde é meio-aberto)", () => {
    const liquida = liquidarSerie(baldes, fechamentos, 5, { base: "liquido", unidade: "brl", valorPonto: 0.2 });
    expect(liquida).toEqual([
      // fim do balde = T0+5: o fechamento EM T0+5 é do balde seguinte (as amostras deste vieram antes dele)
      [T0, -10, 5, 2],
      // fim = T0+10: o de T0+5 entra (1,5); o de T0+12 ainda não
      [T0 + 5, -1.5, 6.5, 6.5],
      // fim = T0+15: os dois (3,5)
      [T0 + 10, -0.5, 5.5, 0.5],
    ]);
    // entradas intactas
    expect(baldes[0]).toEqual([T0, -10, 5, 2]);
    expect(fechamentos[0]).toEqual([T0 + 12, 2]);
    // a saída alinhada ao múltiplo de 5 s (revisão de 23/09/2026): o balde anterior a ela não paga o custo
    expect(liquidarSerie([b(T0, 10, 10, 10), b(T0 + 5, 10, 10, 10)], [[T0 + 5, 1]], 5, { base: "liquido", unidade: "brl", valorPonto: 0.2 })).toEqual([
      [T0, 10, 10, 10],
      [T0 + 5, 9, 9, 9],
    ]);
  });

  it("em pontos divide pelo valor do ponto; base bruto não desconta nada", () => {
    const pontos = liquidarSerie(baldes, fechamentos, 5, { base: "liquido", unidade: "pontos", valorPonto: 0.2 });
    expect(pontos[0][1]).toBeCloseTo(-50, 10);
    expect(pontos[0][2]).toBeCloseTo(25, 10);
    expect(pontos[0][3]).toBeCloseTo(10, 10);
    expect(pontos[1][3]).toBeCloseTo(32.5, 10);
    expect(pontos[2][3]).toBeCloseTo(2.5, 10);
    expect(liquidarSerie(baldes, fechamentos, 5, { base: "bruto", unidade: "brl", valorPonto: 0.2 })).toEqual(baldes);
    const brutoEmPontos = liquidarSerie(baldes, fechamentos, 5, { base: "bruto", unidade: "pontos", valorPonto: 0.2 });
    expect(brutoEmPontos[1]).toEqual([T0 + 5, 0, 40, 40]);
    // sem fechamento, líquido = bruto
    expect(liquidarSerie(baldes, [], 5, { base: "liquido", unidade: "brl", valorPonto: 0.2 })).toEqual(baldes);
  });
});

describe("reduzirBaldes", () => {
  /** 6.500 baldes a 5 s (um dia de pregão inteiro) com uma onda por baixo, para os extremos variarem */
  function umDia(n = 6500): BaldeCompacto[] {
    return Array.from({ length: n }, (_, i) => {
      const v = Math.round(Math.sin(i / 50) * 10_000) / 100;
      return b(T0 + i * 5, v - (i % 3), v + (i % 4), v);
    });
  }

  it("6.500 baldes viram 1.500 grupos contíguos, com min dos mínimos, max dos máximos, o último do último e o t dele", () => {
    expect(PONTOS_SALDO).toBe(1500);
    const baldes = umDia();
    const grupos = reduzirBaldes(baldes, PONTOS_SALDO);
    expect(grupos).toHaveLength(1500);
    expect(grupos.reduce((s, g) => s + g[4], 0)).toBe(6500);
    let fim = 0;
    grupos.forEach((g, k) => {
      const de = Math.floor((k * 6500) / 1500);
      const ate = Math.max(de + 1, Math.floor(((k + 1) * 6500) / 1500));
      expect(de).toBe(fim);
      fim = ate;
      const fatia = baldes.slice(de, ate);
      expect(g[0]).toBe(fatia[0][0]);
      expect(g[1]).toBe(Math.min(...fatia.map((x) => x[1])));
      expect(g[2]).toBe(Math.max(...fatia.map((x) => x[2])));
      expect(g[3]).toBe(fatia[fatia.length - 1][3]);
      expect(g[4]).toBe(ate - de);
      // o t do último balde do grupo: é nele que o ponto se desenha (revisão de 23/09/2026)
      expect(g[5]).toBe(fatia[fatia.length - 1][0]);
    });
    expect(fim).toBe(6500);
    // o último grupo termina no último balde, e no t dele
    expect(grupos[1499][3]).toBe(baldes[6499][3]);
    expect(grupos[1499][5]).toBe(baldes[6499][0]);
  });

  it("n <= max não junta: cada balde vira grupo de 1, com tUltimo = tInicio", () => {
    const baldes = umDia(40);
    const grupos = reduzirBaldes(baldes, PONTOS_SALDO);
    expect(grupos).toHaveLength(40);
    grupos.forEach((g, i) => expect(g).toEqual([...baldes[i], 1, baldes[i][0]]));
    expect(reduzirBaldes([], 10)).toEqual([]);
  });
});

describe("mepMenDaSerie, fechamentosNaCurva e inicioDaMedicao", () => {
  const janela = { inicio: T0, fim: T0 + 100 };
  const baldes: BaldeCompacto[] = [b(T0, -30, 10, 5), b(T0 + 5, 5, 40, 40), b(T0 + 10, 20, 60, 25), b(T0 + 15, 10, 60, 30)];

  it("pico e vale da série, com o t do PRIMEIRO balde que os bateu", () => {
    expect(mepMenDaSerie(baldes)).toEqual({ mep: 60, mepT: T0 + 10, men: -30, menT: T0 });
    // só positivo: MEN 0 sem t; só negativo: MEP 0 sem t
    expect(mepMenDaSerie([b(T0, 1, 5, 3)])).toEqual({ mep: 5, mepT: T0, men: 0, menT: null });
    expect(mepMenDaSerie([b(T0, -5, -1, -3)])).toEqual({ mep: 0, mepT: null, men: -5, menT: T0 });
    expect(mepMenDaSerie([])).toEqual({ mep: 0, mepT: null, men: 0, menT: null });
    // também sobre a série reduzida
    expect(mepMenDaSerie(reduzirBaldes(baldes, 2))).toEqual({ mep: 60, mepT: T0 + 10, men: -30, menT: T0 });
  });

  it("um pontinho por fechamento, no último balde com início <= t; fechamento antes do primeiro balde não entra", () => {
    const fechamentos: FechamentoCompacto[] = [
      [T0 - 3, 1],
      [T0 + 5, 1],
      [T0 + 12, 1],
      [T0 + 90, 1],
    ];
    expect(fechamentosNaCurva(fechamentos, baldes, janela)).toEqual([
      { posicao: 0.05, valor: 40 },
      { posicao: 0.12, valor: 25 },
      { posicao: 0.9, valor: 30 },
    ]);
    expect(fechamentosNaCurva(fechamentos, [], janela)).toEqual([]);
    expect(fechamentosNaCurva([], baldes, janela)).toEqual([]);
  });

  it("inicioDaMedicao: o t do primeiro balde quando ele vem depois do primeiro fechamento", () => {
    expect(inicioDaMedicao(baldes, [[T0 - 60, 1]])).toBe(T0);
    expect(inicioDaMedicao(baldes, [[T0 + 30, 1], [T0 - 60, 1]])).toBe(T0);
    expect(inicioDaMedicao(baldes, [[T0, 1]])).toBeNull();
    expect(inicioDaMedicao(baldes, [[T0 + 30, 1]])).toBeNull();
    expect(inicioDaMedicao([], [[T0 - 60, 1]])).toBeNull();
    expect(inicioDaMedicao(baldes, [])).toBeNull();
  });

  it("inicioDaMedicao: ou mais de um minuto depois do início da janela, mesmo sem fechamento anterior (revisão de 23/09/2026)", () => {
    expect(TOLERANCIA_INICIO_SEG).toBe(60);
    // o coletor subiu às 10:00 num eixo que começa às 09:00, sem nenhuma saída antes: a nota aparece
    expect(inicioDaMedicao(baldes, [], epochBrasilia(DIA, "09:00"))).toBe(T0);
    expect(inicioDaMedicao(baldes, [[T0 + 30, 1]], epochBrasilia(DIA, "09:00"))).toBe(T0);
    // dentro da tolerância (primeiro balde até 60 s depois do início) não é "no meio do dia"
    expect(inicioDaMedicao(baldes, [], T0 - 60)).toBeNull();
    expect(inicioDaMedicao(baldes, [], T0 - 61)).toBe(T0);
    expect(inicioDaMedicao(baldes, [], T0)).toBeNull();
    // janela ilegível não conta; o fechamento anterior continua valendo sozinho
    expect(inicioDaMedicao(baldes, [], Number.NaN)).toBeNull();
    expect(inicioDaMedicao(baldes, [[T0 - 60, 1]], T0)).toBe(T0);
    expect(inicioDaMedicao([], [], epochBrasilia(DIA, "09:00"))).toBeNull();
  });
});

describe("dentes de MFE/MAE", () => {
  it("em R$: acumulado antes + MAE × valor do ponto até acumulado antes + MFE × valor do ponto", () => {
    const dentes = dentesPorOperacao(
      [
        { valor: 10, mfe: 200, mae: -75 },
        { valor: -5, mfe: null, mae: null },
        { valor: 3, mfe: 50, mae: null },
      ],
      { unidade: "brl", valorPonto: 0.2 },
    );
    expect(dentes).toEqual([
      { de: -15, ate: 40, mfe: 200, mae: -75 },
      null,
      // acumulado antes = 10 − 5 = 5; só o MFE medido, o MAE conta 0
      { de: 5, ate: 15, mfe: 50, mae: 0 },
    ]);
  });

  it("em pontos: × contratos (o valor da operação já vem na unidade da curva)", () => {
    const dentes = dentesPorOperacao([{ valor: 20, mfe: 200, mae: -75 }, { valor: 10, mfe: null, mae: -20 }], { unidade: "pontos", valorPonto: 0.2, contratos: 2 });
    expect(dentes).toEqual([
      { de: -150, ate: 400, mfe: 200, mae: -75 },
      { de: 20 - 40, ate: 20, mfe: 0, mae: -20 },
    ]);
    // em R$ com 2 contratos: × 0,2 × 2
    expect(dentesPorOperacao([{ valor: 4, mfe: 100, mae: -50 }], { unidade: "brl", valorPonto: 0.2, contratos: 2 })).toEqual([{ de: -20, ate: 40, mfe: 100, mae: -50 }]);
    expect(dentesPorOperacao([], { unidade: "brl", valorPonto: 0.2 })).toEqual([]);
  });

  it("envelopeDeDentes: menor de, maior ate, maior mfe, menor mae; null sem dente", () => {
    const dentes = dentesPorOperacao(
      [
        { valor: 10, mfe: 200, mae: -75 },
        { valor: -5, mfe: null, mae: null },
        { valor: 3, mfe: 50, mae: -300 },
      ],
      { unidade: "brl", valorPonto: 0.2 },
    );
    // 3ª: antes 5, de = 5 − 60 = −55, ate = 5 + 10 = 15
    expect(envelopeDeDentes(dentes)).toEqual({ de: -55, ate: 40, mfe: 200, mae: -300 });
    expect(envelopeDeDentes([null, null])).toBeNull();
    expect(envelopeDeDentes([])).toBeNull();
    // de um só, uma cópia
    const so = envelopeDeDentes([dentes[0]]);
    expect(so).toEqual(dentes[0]);
    expect(so).not.toBe(dentes[0]);
  });
});

describe("estado inicial, forma do corpo da rota e legenda", () => {
  it("SALDO_HOJE_VAZIO", () => {
    expect(SALDO_HOJE_VAZIO).toEqual({ baldes: [], aproximado: false, bucketSeg: 5, carregado: false, erro: null, atualizadoEm: null });
  });

  it("ehCorpoSaldoDoDia aceita o corpo bom e recusa lixo", () => {
    const bom: SaldoDoDia = {
      dia: DIA,
      baldes: [
        [T0, -10, 5, 2],
        [T0 + 5, 0, 8, 8],
      ],
      aproximado: false,
      bucketSeg: 5,
      fechamentos: [[T0 + 5, 1.5]],
      geradoEm: "2026-09-23T13:00:20.000Z",
    };
    expect(ehCorpoSaldoDoDia(bom)).toBe(true);
    expect(ehCorpoSaldoDoDia(JSON.parse(JSON.stringify(bom)))).toBe(true);
    // dia sem série: listas vazias valem
    expect(ehCorpoSaldoDoDia({ ...bom, baldes: [], fechamentos: [] })).toBe(true);
    for (const ruim of [
      null,
      undefined,
      "erro",
      42,
      {},
      { ...bom, dia: "23/09/2026" },
      { ...bom, baldes: [[T0, -10, 5]] },
      { ...bom, baldes: [[T0, -10, 5, "2"]] },
      { ...bom, baldes: "muitos" },
      { ...bom, aproximado: "não" },
      { ...bom, bucketSeg: 0 },
      { ...bom, fechamentos: [[T0]] },
      { ...bom, geradoEm: 1 },
    ]) {
      expect(ehCorpoSaldoDoDia(ruim)).toBe(false);
    }
  });

  it("legendaDoSaldo nas quatro variantes (sem a palavra 'balde': texto público fala em intervalo)", () => {
    expect(legendaDoSaldo({ bucketSeg: 5, aproximado: false, comFechamentos: true, medidoDesdeT: null })).toBe(
      "Saldo do dia medido no MT5 a cada 5 s (mín./máx. a cada intervalo) · fechamentos marcados",
    );
    expect(legendaDoSaldo({ bucketSeg: 5, aproximado: true, comFechamentos: true, medidoDesdeT: null })).toBe(
      "Saldo do dia medido no MT5 a cada 5 s · aproximado, sem faixa mín./máx. · fechamentos marcados",
    );
    expect(legendaDoSaldo({ bucketSeg: 10, aproximado: false, comFechamentos: false, medidoDesdeT: null })).toBe(
      "Saldo do dia medido no MT5 a cada 10 s (mín./máx. a cada intervalo)",
    );
    const desde = epochBrasilia(DIA, "10:15");
    expect(formatarHora(new Date(desde * 1000))).toBe("10:15");
    expect(legendaDoSaldo({ bucketSeg: 5, aproximado: false, comFechamentos: true, medidoDesdeT: desde })).toBe(
      "Saldo do dia medido no MT5 a cada 5 s (mín./máx. a cada intervalo) · fechamentos marcados · medido a partir de 10:15",
    );
    for (const variante of [
      legendaDoSaldo({ bucketSeg: 5, aproximado: false, comFechamentos: true, medidoDesdeT: desde }),
      legendaDoSaldo({ bucketSeg: 5, aproximado: true, comFechamentos: false, medidoDesdeT: null }),
    ]) {
      expect(variante).not.toMatch(/balde/i);
    }
  });
});
