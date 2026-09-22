import { describe, expect, it } from "vitest";
import {
  compactar,
  curvaPorOperacao,
  excursao,
  excursaoDoDia,
  histograma,
  mae,
  mfe,
  porDiaSemana,
  porHora,
  porSimbolo,
  resumoOperacoes,
  sequencias,
  temExcursao,
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

  // 22/09/2026: MFE/MAE do EA 1.1.0 nas posições 9 e 10, só quando medidos
  const base = {
    dia_pregao: "2026-09-22",
    abertura_em: "2026-09-22T13:05:00Z",
    pontos_por_contrato: 150,
    resultado_brl_por_contrato: 30,
    custos_brl_por_contrato: 0.25,
    duracao_seg: 120,
    lado: "compra" as const,
    simbolo: "WINV26",
  };

  it("sem MFE/MAE a tupla continua com 9 posições, e os acessores devolvem null", () => {
    const semCampos = compactar(base);
    expect(semCampos).toHaveLength(9);
    const nulos = compactar({ ...base, mfe_pontos_por_contrato: null, mae_pontos_por_contrato: null });
    expect(nulos).toHaveLength(9);
    for (const c of [semCampos, nulos]) {
      expect(mfe(c)).toBeNull();
      expect(mae(c)).toBeNull();
      expect(temExcursao(c)).toBe(false);
    }
    // a tupla escrita na mão, com 9 posições, lê igual
    expect(mfe(op("2026-09-22", 10, 2, 30))).toBeNull();
  });

  it("com MFE/MAE a tupla ganha as posições 9 e 10", () => {
    const c = compactar({ ...base, mfe_pontos_por_contrato: 320, mae_pontos_por_contrato: -85 });
    expect(c).toHaveLength(11);
    expect(c[9]).toBe(320);
    expect(c[10]).toBe(-85);
    expect(mfe(c)).toBe(320);
    expect(mae(c)).toBe(-85);
    expect(temExcursao(c)).toBe(true);
    // as 9 primeiras posições não mudam
    expect(c.slice(0, 9)).toEqual(compactar(base));
    // zero é medição (a operação nunca andou a favor), não ausência
    const zero = compactar({ ...base, mfe_pontos_por_contrato: 0, mae_pontos_por_contrato: -40 });
    expect(mfe(zero)).toBe(0);
    expect(temExcursao(zero)).toBe(true);
  });

  it("valor que não é número (NaN, texto vindo do banco) conta como não medido", () => {
    const c = compactar({ ...base, mfe_pontos_por_contrato: Number.NaN, mae_pontos_por_contrato: -85 });
    expect(mfe(c)).toBeNull();
    expect(mae(c)).toBe(-85);
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

describe("excursao / excursaoDoDia", () => {
  const d = "2026-09-14";

  it("só positivos: MEN é 0 e não tem operação do MEN", () => {
    const e = excursao([10, 20, 5]);
    expect(e).toEqual({ mep: 35, men: 0, iMep: 2, iMen: null, final: 35 });
    const r = excursaoDoDia([op(d, 9, 1, 10), op(d, 10, 1, 20), op(d, 11, 1, 5)], liq);
    expect(r).toEqual({ mep: 35, men: 0, final: 35, nOperacoes: 3, operacaoMep: 3, operacaoMen: null });
  });

  it("só negativos: MEP é 0 e não tem operação do MEP", () => {
    const e = excursao([-10, -20, -5]);
    expect(e).toEqual({ mep: 0, men: -35, iMep: null, iMen: 2, final: -35 });
    const r = excursaoDoDia([op(d, 9, 1, -10), op(d, 10, 1, -20), op(d, 11, 1, -5)], liq);
    expect(r).toEqual({ mep: 0, men: -35, final: -35, nOperacoes: 3, operacaoMep: null, operacaoMen: 3 });
  });

  it("cruza o zero: +10, -30, +50 dá MEP 30 na 3ª e MEN -20 na 2ª", () => {
    const e = excursao([10, -30, 50]);
    expect(e).toEqual({ mep: 30, men: -20, iMep: 2, iMen: 1, final: 30 });
    const r = excursaoDoDia([op(d, 9, 1, 10), op(d, 10, 1, -30), op(d, 11, 1, 50)], liq);
    expect(r).toEqual({ mep: 30, men: -20, final: 30, nOperacoes: 3, operacaoMep: 3, operacaoMen: 2 });
  });

  it("empate no extremo fica com a primeira operação em que ocorreu", () => {
    // acumulado: 30, 10, 30, -5, 30 → MEP 30 na 1ª; MEN -5 na 4ª
    const e = excursao([30, -20, 20, -35, 35]);
    expect(e.mep).toBe(30);
    expect(e.iMep).toBe(0);
    expect(e.men).toBe(-5);
    expect(e.iMen).toBe(3);
    // acumulado: -40, -20, -40 → MEN -40 na 1ª
    expect(excursao([-40, 20, -20])).toMatchObject({ men: -40, iMen: 0, mep: 0, iMep: null });
  });

  it("lista vazia devolve tudo 0 e índices null", () => {
    expect(excursao([])).toEqual({ mep: 0, men: 0, iMep: null, iMen: null, final: 0 });
    expect(excursaoDoDia([], liq)).toEqual({
      mep: 0,
      men: 0,
      final: 0,
      nOperacoes: 0,
      operacaoMep: null,
      operacaoMen: null,
    });
  });

  it("acumulado que volta a zero sem cruzar não conta como exposição", () => {
    expect(excursao([10, -10])).toEqual({ mep: 10, men: 0, iMep: 0, iMen: null, final: 0 });
    expect(excursao([0, 0])).toEqual({ mep: 0, men: 0, iMep: null, iMen: null, final: 0 });
  });

  it("ruído de ponto flutuante não vira exposição nem desempata", () => {
    // 9,70 + (-9,70) dá -1,8e-15 em double: continua sendo "nunca ficou negativo"
    const r = excursaoDoDia([op(d, 9, 1, 10, 0.3), op(d, 10, 1, -9.4, 0.3)], liq);
    expect(r).toMatchObject({ mep: 9.7, men: 0, operacaoMep: 1, operacaoMen: null });
    // volta ao mesmo pico com diferença de 1e-15: o empate continua com a primeira operação
    const e = excursaoDoDia([op(d, 9, 1, 10, 0.3), op(d, 10, 1, -9.4, 0.3), op(d, 11, 1, 10, 0.3)], liq);
    expect(e).toMatchObject({ men: 0, operacaoMep: 1, operacaoMen: null });
    expect(e.mep).toBeCloseTo(9.7);
  });

  it("bruto e líquido dão números diferentes (e podem mudar a operação do extremo)", () => {
    // bruto: 30, -25, +30 → acumulado 30, 5, 35 → MEP 35 na 3ª, MEN 0
    // líquido (custo 10 cada): 20, -35, 20 → acumulado 20, -15, 5 → MEP 20 na 1ª, MEN -15 na 2ª
    const opsDia = [op(d, 9, 1, 30, 10), op(d, 10, 1, -25, 10), op(d, 11, 1, 30, 10)];
    expect(excursaoDoDia(opsDia, { ...liq, base: "bruto" })).toEqual({
      mep: 35,
      men: 0,
      final: 35,
      nOperacoes: 3,
      operacaoMep: 3,
      operacaoMen: null,
    });
    expect(excursaoDoDia(opsDia, liq)).toEqual({
      mep: 20,
      men: -15,
      final: 5,
      nOperacoes: 3,
      operacaoMep: 1,
      operacaoMen: 2,
    });
  });

  it("pontos e R$ seguem valorOperacao (mesma base, unidade diferente)", () => {
    const opsDia = [op(d, 9, 1, 10, 2), op(d, 10, 1, -30, 2), op(d, 11, 1, 50, 2)];
    const brl = excursaoDoDia(opsDia, liq);
    const pts = excursaoDoDia(opsDia, { base: "liquido", unidade: "pontos", valorPonto: 0.2 });
    // líquido em R$: 8, -32, 48 → acumulado 8, -24, 24
    expect(brl).toMatchObject({ mep: 24, men: -24, final: 24, operacaoMep: 3, operacaoMen: 2 });
    // em pontos (valorPonto 0,20): 40, -160, 240 → acumulado 40, -120, 120
    expect(pts.mep).toBeCloseTo(120);
    expect(pts.men).toBeCloseTo(-120);
    expect(pts.final).toBeCloseTo(120);
    expect(pts).toMatchObject({ nOperacoes: 3, operacaoMep: 3, operacaoMen: 2 });
  });
});
