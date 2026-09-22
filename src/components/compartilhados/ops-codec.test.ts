import { describe, expect, it } from "vitest";
import type { OperacaoCompacta } from "@/lib/stats/operacoes";
import type { LinhaDiaria } from "@/lib/stats/tipos";
import { desempacotar, empacotar, soLinhaDiaria } from "./ops-codec";

// amostra com vários dias (e um dia que volta depois de outro), os 5 símbolos, os dois lados,
// negativos, decimais, custos diferentes e -0
const AMOSTRA: OperacaoCompacta[] = [
  ["2026-02-13", 9, 5, -780, -156, 0.25, 0, 1, "WING26"],
  ["2026-02-13", 9, 5, 125.5, 25.1, 0.25, 42, -1, "WING26"],
  ["2026-02-13", 10, 5, 0, 0, 0.25, 7, -1, "WING26"],
  ["2026-03-16", 11, 1, 310.75, 62.15, 0.25, 180, 1, "WINJ26"],
  ["2026-03-16", 11, 1, -45.25, -9.05, 0.3, 3600, 1, "WINJ26"],
  ["2026-05-20", 14, 3, -0.5, -0.1, 0.25, 12, -1, "WINM26"],
  ["2026-07-08", 15, 3, 1000, 200, 0, 95, 1, "WINQ26"],
  ["2026-07-08", 17, 3, -0, -0, 0.25, 1, -1, "WINQ26"],
  ["2026-09-18", 9, 5, 12.25, 2.45, 0.25, 30, 1, "WINV26"],
  ["2026-09-18", 9, 5, 12.25, 2.45, 0.25, 30, 1, "WINV26"],
  ["2026-03-16", 12, 1, -3.333, -0.6666, 0.25, 8, -1, "WINJ26"],
];

describe("ops-codec", () => {
  it("desempacotar(empacotar(x)) devolve o mesmo array", () => {
    const volta = desempacotar(empacotar(AMOSTRA));
    expect(volta).toStrictEqual(AMOSTRA);
    // toStrictEqual trata -0 e 0 como diferentes: o -0 sobreviveu
    expect(Object.is(volta[7][3], -0)).toBe(true);
  });

  it("sobrevive a uma ida e volta por JSON, como no payload da página", () => {
    // JSON perde o -0 (o Flight do React não perde): compara com a amostra pelo mesmo caminho
    const pacote = JSON.parse(JSON.stringify(empacotar(AMOSTRA)));
    expect(desempacotar(pacote)).toStrictEqual(JSON.parse(JSON.stringify(AMOSTRA)));
  });

  it("guarda dia e símbolo uma vez só", () => {
    const p = empacotar(AMOSTRA);
    expect(p.dias).toEqual(["2026-02-13", "2026-03-16", "2026-05-20", "2026-07-08", "2026-09-18"]);
    expect(p.simbolos).toEqual(["WING26", "WINJ26", "WINM26", "WINQ26", "WINV26"]);
    expect(p.n).toBe(AMOSTRA.length);
  });

  it("lista vazia", () => {
    expect(desempacotar(empacotar([]))).toEqual([]);
  });

  // 22/09/2026: MFE/MAE do EA 1.1.0 nas posições 9 e 10, opcionais
  it("sem nenhuma operação medida, o pacote não tem excursão", () => {
    const p = empacotar(AMOSTRA);
    expect(p.excursao).toBeUndefined();
    // tupla com 11 posições, mas as duas null, também não entra
    const a = AMOSTRA[0];
    const q = empacotar([[a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], null, null]]);
    expect(q.excursao).toBeUndefined();
    expect(desempacotar(q)[0]).toHaveLength(9);
  });

  it("só as operações medidas vão no pacote (índices em deltas); a não medida volta com 9 posições", () => {
    const ops: OperacaoCompacta[] = [
      ["2026-09-21", 9, 1, -780, -156, 0.25, 0, 1, "WINV26"],
      ["2026-09-22", 10, 2, 125.5, 25.1, 0.25, 42, -1, "WINV26", 320, -85],
      ["2026-09-22", 10, 2, 0, 0, 0.25, 7, -1, "WINV26", 0, 0],
      ["2026-09-22", 11, 2, 30, 6, 0.25, 7, 1, "WINV26", null, null],
      ["2026-09-22", 11, 2, 30, 6, 0.25, 7, 1, "WINV26", null, -12],
      ["2026-09-22", 12, 2, 30, 6, 0.25, 7, 1, "WINV26", 7, null],
    ];
    const p = empacotar(ops);
    expect(p.excursao).toEqual({ indice: [1, 1, 2, 1], mfe: [320, 0, null, 7], mae: [-85, 0, -12, null] });
    const volta = desempacotar(JSON.parse(JSON.stringify(p)));
    expect(volta).toStrictEqual([ops[0], ops[1], ops[2], ops[3].slice(0, 9), ops[4], ops[5]]);
    expect(volta[0]).toHaveLength(9);
    expect(volta[3]).toHaveLength(9);
  });

  it("a primeira operação medida pode ser a de índice 0 e a última a de índice n-1", () => {
    const ops: OperacaoCompacta[] = [
      ["2026-09-22", 10, 2, 125.5, 25.1, 0.25, 42, -1, "WINV26", 320, -85],
      ["2026-09-22", 10, 2, 0, 0, 0.25, 7, -1, "WINV26"],
      ["2026-09-22", 11, 2, 30, 6, 0.25, 7, 1, "WINV26", 1, -1],
    ];
    const p = empacotar(ops);
    expect(p.excursao?.indice).toEqual([0, 2]);
    expect(desempacotar(JSON.parse(JSON.stringify(p)))).toStrictEqual(ops);
  });

  it("uma operação medida entre 15 mil não medidas custa só ela no pacote", () => {
    const muitas: OperacaoCompacta[] = Array.from({ length: 15_000 }, (_, i) => [
      `2026-0${1 + (i % 9)}-1${i % 9}`, 9 + (i % 8), i % 5, i % 7, (i % 7) / 5, 0.25, i % 100, i % 2 ? 1 : -1, "WINV26",
    ]);
    const sem = JSON.stringify(empacotar(muitas)).length;
    const m = muitas[7_000];
    muitas[7_000] = [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], 320, -85];
    const com = JSON.stringify(empacotar(muitas)).length;
    expect(com - sem).toBeLessThan(60);
    expect(desempacotar(JSON.parse(JSON.stringify(empacotar(muitas))))[7_000]).toStrictEqual(muitas[7_000]);
  });

  it("excursão desalinhada ou com índice fora da lista falha em vez de desalinhar", () => {
    const p = empacotar([["2026-09-22", 10, 2, 10, 2, 0.25, 42, 1, "WINV26", 50, -10], ...AMOSTRA]);
    expect(() => desempacotar({ ...p, excursao: { indice: [0], mfe: [50], mae: [] } })).toThrow();
    expect(() => desempacotar({ ...p, excursao: { indice: [0, 1], mfe: [50, 1], mae: [-10, -1] } })).not.toThrow();
    expect(() => desempacotar({ ...p, excursao: { indice: [p.n], mfe: [50], mae: [-10] } })).toThrow();
    expect(() => desempacotar({ ...p, excursao: { indice: [1, -1], mfe: [50, 1], mae: [-10, -1] } })).toThrow();
  });

  it("pacote com coluna do tamanho errado falha em vez de desalinhar", () => {
    const p = empacotar(AMOSTRA);
    expect(() => desempacotar({ ...p, pontos: p.pontos.slice(1) })).toThrow();
    expect(() => desempacotar({ ...p, hora: [9, 1] })).toThrow();
  });
});

describe("soLinhaDiaria", () => {
  it("tira robo_id, slug e atualizado_em e mantém o resto", () => {
    const linha: LinhaDiaria = {
      dia: "2026-09-18",
      pontos_por_contrato: 120.5,
      resultado_brl_por_contrato: 24.1,
      custos_brl_por_contrato: 2.5,
      n_operacoes: 10,
      n_gain: 6,
      n_loss: 4,
      soma_gain_brl_por_contrato: 80,
      soma_loss_brl_por_contrato: -58.4,
      maior_gain_brl_por_contrato: 30,
      maior_loss_brl_por_contrato: -20,
    };
    const daView = { ...linha, robo_id: "f2b32f0a", slug: "apollo", atualizado_em: "2026-09-18T19:07:49+00:00" };
    expect(soLinhaDiaria([daView])).toStrictEqual([linha]);
  });
});
