import { describe, expect, it } from "vitest";
import {
  compactar,
  curvaPorOperacao,
  histograma,
  porDiaSemana,
  porHora,
  porSimbolo,
  resumoOperacoes,
  sequencias,
  valorOperacao,
  type OperacaoCompacta,
  type OpcoesOperacao,
} from "./operacoes";

// [dia, hora, diaSemana, pontos, brl, custos, duracao, lado, simbolo]
function op(dia: string, hora: number, diaSemana: number, brl: number, custos = 0, simbolo = "WINV26"): OperacaoCompacta {
  return [dia, hora, diaSemana, brl / 0.2, brl, custos, 300, 1, simbolo];
}

const liq: OpcoesOperacao = { base: "liquido", unidade: "brl", valorPonto: 0.2 };

const ops: OperacaoCompacta[] = [
  op("2026-09-07", 9, 1, 30), // seg
  op("2026-09-07", 9, 1, 30),
  op("2026-09-08", 10, 2, -60), // ter
  op("2026-09-09", 10, 3, 30, 5, "WINQ26"), // qua, líquido 25
  op("2026-09-09", 14, 3, -20), // qua
  op("2026-09-10", 16, 4, 0), // qui, zero
  op("2026-09-10", 16, 4, 30), // qui
];

describe("compactar / valorOperacao", () => {
  it("converte hora e dia da semana pra Brasília", () => {
    const c = compactar({
      dia_pregao: "2026-09-11",
      abertura_em: "2026-09-11T13:05:00Z", // 10:05 em Brasília, sexta
      pontos_por_contrato: 150,
      resultado_brl_por_contrato: 30,
      custos_brl_por_contrato: 0.25,
      duracao_seg: 120,
      lado: "venda",
      simbolo: "WINV26",
    });
    expect(c[1]).toBe(10);
    expect(c[2]).toBe(5);
    expect(c[7]).toBe(-1);
    expect(c[8]).toBe("WINV26");
  });

  it("valor bruto, líquido, pontos e contratos", () => {
    const o = op("2026-09-09", 10, 3, 30, 5);
    expect(valorOperacao(o, { ...liq, base: "bruto" })).toBe(30);
    expect(valorOperacao(o, liq)).toBe(25);
    expect(valorOperacao(o, { base: "liquido", unidade: "pontos", valorPonto: 0.2 })).toBeCloseTo(125);
    expect(valorOperacao(o, { ...liq, contratos: 3 })).toBe(75);
  });
});

describe("distribuições", () => {
  it("por dia da semana sempre traz seg a sex", () => {
    const f = porDiaSemana(ops, liq);
    expect(f.map((x) => x.rotulo)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex"]);
    expect(f[0]).toMatchObject({ total: 60, n: 2, nGain: 2, nLoss: 0, media: 30 });
    expect(f[2]).toMatchObject({ total: 5, n: 2, nGain: 1, nLoss: 1 });
    expect(f[4]).toMatchObject({ total: 0, n: 0 });
  });

  it("por hora sempre traz 9h a 17h", () => {
    const f = porHora(ops, liq);
    expect(f).toHaveLength(9);
    expect(f.find((x) => x.chave === 9)).toMatchObject({ total: 60, n: 2 });
    expect(f.find((x) => x.chave === 16)).toMatchObject({ total: 30, n: 2, nGain: 1, nLoss: 0 });
  });

  it("por símbolo ordena do melhor pro pior", () => {
    const f = porSimbolo(ops, liq);
    expect(f[0]).toMatchObject({ simbolo: "WINQ26", n: 1, total: 25, nGain: 1 });
    expect(f[1]).toMatchObject({ simbolo: "WINV26", n: 6, total: 10 });
  });

  it("histograma cobre min..max e conta tudo", () => {
    const h = histograma(ops, liq, 4);
    expect(h).toHaveLength(4);
    expect(h.reduce((s, f) => s + f.n, 0)).toBe(ops.length);
    expect(h[0].de).toBe(-60);
    expect(h[3].ate).toBe(30);
    expect(histograma([], liq)).toEqual([]);
  });
});

describe("sequencias / resumo", () => {
  it("maior sequência por operação, zero quebra a sequência", () => {
    const s = sequencias(ops);
    expect(s.maiorGains).toBe(2);
    expect(s.maiorLosses).toBe(1);
    expect(s.atual).toEqual({ tipo: "gain", n: 1 });
  });

  it("resumo por operação", () => {
    const r = resumoOperacoes(ops, liq);
    expect(r.n).toBe(7);
    expect(r.nGain).toBe(4);
    expect(r.nLoss).toBe(2);
    expect(r.mediaGain).toBeCloseTo((30 + 30 + 25 + 30) / 4);
    expect(r.mediaLoss).toBe(-40);
    expect(r.maiorGain).toBe(30);
    expect(r.maiorLoss).toBe(-60);
    expect(r.diasComOperacao).toBe(4);
    expect(r.mediaPorDia).toBe(1.75);
    expect(r.duracaoMediaSeg).toBe(300);
  });

  it("curva por operação acumula", () => {
    const c = curvaPorOperacao(ops.slice(0, 3), liq);
    expect(c.map((p) => p.acumulado)).toEqual([30, 60, 0]);
    expect(c[2].indice).toBe(3);
  });
});
