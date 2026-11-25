import { describe, expect, it } from "vitest";
import { acumular, maiorQueda, type DiaResultado } from "@/lib/stats/serie-casa";
import {
  PERIODOS_COMPARATIVO,
  curvaNoEixo,
  eixoComum,
  indiceDoMelhor,
  inicioNoComparativo,
  recortarPeriodo,
  resumirNoPeriodo,
} from "./resumo-por-periodo";

/** Um pregão: resultado em R$ (1 contrato, já com custos), operações fechadas e quantas com ganho. */
const dia = (d: string, valor: number, n: number, g = 0): DiaResultado => ({ dia: d, valor, n, g });

// hoje = sexta 18/09/2026: a semana começa na segunda 14/09
const HOJE = "2026-09-18";
const serie: DiaResultado[] = [
  dia("2025-09-18", 700, 5, 3), // exatamente um ano atrás: fora dos 12 meses, só em "tudo"
  dia("2025-12-30", 490, 4, 2), // ano passado: 12 meses e "tudo"
  dia("2026-01-05", -205, 2, 0), // ano
  dia("2026-09-01", 280, 6, 4), // mês
  dia("2026-09-15", 96, 3, 2), // semana
  dia("2026-09-18", -52, 1, 0), // hoje, entra na semana
  dia("2026-09-21", 999, 9, 9), // depois de hoje: fica de fora de tudo
];

describe("recortarPeriodo", () => {
  const dias = (p: Parameters<typeof recortarPeriodo>[1]) => recortarPeriodo(serie, p, HOJE).map((d) => d.dia);

  it("semana, mês e ano começam na segunda, no dia 1º e em 1º de janeiro, e vão até hoje", () => {
    expect(dias("semana")).toEqual(["2026-09-15", "2026-09-18"]);
    expect(dias("mes")).toEqual(["2026-09-01", "2026-09-15", "2026-09-18"]);
    expect(dias("ano")).toEqual(["2026-01-05", "2026-09-01", "2026-09-15", "2026-09-18"]);
  });

  it("12 meses deixam de fora o dia de hoje de um ano atrás, como na página inicial", () => {
    expect(inicioNoComparativo("12m", HOJE)).toBe("2025-09-19");
    expect(dias("12m")).toEqual(["2025-12-30", "2026-01-05", "2026-09-01", "2026-09-15", "2026-09-18"]);
  });

  it("desde o início leva tudo até hoje, e nada depois", () => {
    expect(inicioNoComparativo("tudo", HOJE)).toBeNull();
    expect(dias("tudo")).toEqual(["2025-09-18", "2025-12-30", "2026-01-05", "2026-09-01", "2026-09-15", "2026-09-18"]);
  });

  it("todo período da tela tem rótulo e nome de coluna", () => {
    expect(PERIODOS_COMPARATIVO.map((p) => p.valor)).toEqual(["12m", "tudo", "ano", "mes", "semana"]);
    for (const p of PERIODOS_COMPARATIVO) {
      expect(p.rotulo).not.toBe("");
      expect(p.coluna).not.toBe("");
    }
  });
});

describe("resumirNoPeriodo", () => {
  const robo = { slug: "apollo", dias: serie };

  it("soma o resultado, as operações e os pregões de cada período até hoje", () => {
    const semana = resumirNoPeriodo(robo, "semana", HOJE);
    expect(semana.resumo.total).toBe(96 - 52);
    expect(semana.resumo.operacoes).toBe(4);
    expect(semana.resumo.pregoes).toBe(2);

    const mes = resumirNoPeriodo(robo, "mes", HOJE);
    expect(mes.resumo.total).toBe(280 + 96 - 52);
    expect(mes.resumo.operacoes).toBe(10);
    expect(mes.resumo.pregoes).toBe(3);

    const ano = resumirNoPeriodo(robo, "ano", HOJE);
    expect(ano.resumo.total).toBe(-205 + 280 + 96 - 52);
    expect(ano.resumo.operacoes).toBe(12);
    expect(ano.resumo.pregoes).toBe(4);

    const tudo = resumirNoPeriodo(robo, "tudo", HOJE);
    expect(tudo.resumo.total).toBe(700 + 490 - 205 + 280 + 96 - 52);
    expect(tudo.resumo.operacoes).toBe(21);
    expect(tudo.resumo.pregoes).toBe(6);
  });

  it("a curva parte de zero no período, e a maior queda, os acertos e as operações por dia saem dela", () => {
    const ano = resumirNoPeriodo(robo, "ano", HOJE);
    expect(ano.curva.map((p) => p.acumulado)).toEqual([-205, 75, 171, 119]);
    // a partida (zero) é o pico da primeira queda, de 205; a do fim é de 52
    expect(ano.queda).toEqual({ iInicio: -1, iFundo: 0, valor: 205 });
    expect(ano.resumo.acertos).toBe(6 / 12);
    expect(ano.operacoesPorDia).toBe(12 / 4);
  });

  it("período sem pregão sai vazio, para a linha dizer \"sem operação\" em vez de uma fileira de zeros", () => {
    const r = resumirNoPeriodo({ slug: "orion", dias: [dia("2026-08-10", 100, 1, 1)] }, "semana", HOJE);
    expect(r.dias).toEqual([]);
    expect(r.curva).toEqual([]);
    expect(r.resumo.pregoes).toBe(0);
    expect(r.resumo.total).toBe(0);
    expect(r.queda).toBeNull();
    expect(r.operacoesPorDia).toBeNull();
    expect(resumirNoPeriodo({ slug: "orion", dias: [dia("2026-08-10", 100, 1, 1)] }, "ano", HOJE).resumo.pregoes).toBe(1);
  });

  it("diz desde quando o robô tem histórico só quando ele não cobre o período inteiro", () => {
    // histórico desde 18/09/2025: cobre a semana, o ano e os 12 meses (que começam em 19/09/2025)
    expect(resumirNoPeriodo(robo, "ano", HOJE).historicoDesde).toBeNull();
    expect(resumirNoPeriodo(robo, "semana", HOJE).historicoDesde).toBeNull();
    expect(resumirNoPeriodo(robo, "12m", HOJE).historicoDesde).toBeNull();
    // em "desde o início" cada robô começa num dia: a data aparece sempre
    expect(resumirNoPeriodo(robo, "tudo", HOJE).historicoDesde).toBe("2025-09-18");
    // um robô que estreou em agosto não tem o ano inteiro nem os 12 meses
    const novo = { slug: "novo", dias: [dia("2026-08-10", 100, 1, 1), dia("2026-09-16", 50, 1, 1)] };
    expect(resumirNoPeriodo(novo, "ano", HOJE).historicoDesde).toBe("2026-08-10");
    expect(resumirNoPeriodo(novo, "12m", HOJE).historicoDesde).toBe("2026-08-10");
    expect(resumirNoPeriodo(novo, "mes", HOJE).historicoDesde).toBeNull();
    expect(resumirNoPeriodo({ slug: "vazio", dias: [] }, "tudo", HOJE).historicoDesde).toBeNull();
  });
});

describe("eixoComum e curvaNoEixo", () => {
  const a = [dia("2026-09-14", 100, 1, 1), dia("2026-09-15", -300, 2, 0), dia("2026-09-17", 50, 1, 1)];
  const b = [dia("2026-09-15", 40, 1, 1), dia("2026-09-16", -10, 1, 0), dia("2026-09-18", 20, 1, 1)];

  it("o eixo é todo pregão em que algum robô operou, em ordem e sem repetir", () => {
    expect(eixoComum([{ dias: b }, { dias: a }, { dias: [] }])).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]);
    expect(eixoComum([])).toEqual([]);
  });

  it("no dia sem operação o acumulado fica onde estava; antes do primeiro pregão não há linha", () => {
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

    expect(curvaNoEixo(eixo, acumular(a), null).queda).toBeNull();
    expect(curvaNoEixo(eixo, [], null)).toEqual({ acumulado: [null, null, null, null, null], noDia: [null, null, null, null, null], queda: null });
  });
});

describe("indiceDoMelhor", () => {
  it("o maior ganha por padrão; com \"menor\", o menor (a maior queda)", () => {
    expect(indiceDoMelhor([10, 30, 20])).toBe(1);
    expect(indiceDoMelhor([10, 30, 20], "menor")).toBe(0);
    expect(indiceDoMelhor([-5, -1, -9])).toBe(1);
  });

  it("quem não tem valor fica fora da disputa", () => {
    expect(indiceDoMelhor([null, 5, undefined, 7])).toBe(3);
    expect(indiceDoMelhor([null, 5, Number.NaN, 2], "menor")).toBe(3);
  });

  it("sem o que comparar não destaca ninguém: menos de dois valores, ou todos iguais", () => {
    expect(indiceDoMelhor([])).toBeNull();
    expect(indiceDoMelhor([42])).toBeNull();
    expect(indiceDoMelhor([null, 42, null])).toBeNull();
    expect(indiceDoMelhor([0, 0, 0])).toBeNull();
  });

  it("no empate entre os melhores vale o primeiro", () => {
    expect(indiceDoMelhor([3, 7, 7])).toBe(1);
    expect(indiceDoMelhor([2, 2, 5], "menor")).toBe(0);
  });
});
