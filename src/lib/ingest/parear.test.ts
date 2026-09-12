import { describe, expect, it } from "vitest";
import { parearPosicao, type DealParaParear } from "./parear";

let ticket = 1000;
function deal(
  p: Partial<DealParaParear> & { tipo: "buy" | "sell"; volume: number; preco: number; em: string },
): DealParaParear {
  ticket += 1;
  return {
    ticket: p.ticket ?? ticket,
    posicao_id: p.posicao_id ?? 500,
    simbolo: p.simbolo ?? "WINV26",
    tipo: p.tipo,
    entry: p.entry ?? (p.tipo === "buy" ? "in" : "out"),
    volume: p.volume,
    preco: p.preco,
    lucro: p.lucro ?? 0,
    executado_em: p.em,
  };
}

const o = { custoPorContrato: 1.5 };

describe("parearPosicao", () => {
  it("entrada e saída simples (compra)", () => {
    const r = parearPosicao(
      [
        deal({ tipo: "buy", volume: 2, preco: 135000, em: "2026-09-11T13:00:00.000Z" }),
        deal({ tipo: "sell", volume: 2, preco: 135200, lucro: 80, em: "2026-09-11T13:05:00.000Z" }),
      ],
      o,
    );
    expect(r.aberta).toBeNull();
    expect(r.fechadas).toHaveLength(1);
    const op = r.fechadas[0];
    expect(op.lado).toBe("compra");
    expect(op.contratos).toBe(2);
    expect(op.preco_entrada).toBe(135000);
    expect(op.preco_saida).toBe(135200);
    expect(op.pontos_por_contrato).toBe(200);
    expect(op.pontos).toBe(400);
    expect(op.resultado_brl).toBe(80);
    expect(op.resultado_brl_por_contrato).toBe(40);
    expect(op.custos_brl).toBe(3);
    expect(op.custos_brl_por_contrato).toBe(1.5);
    expect(op.duracao_seg).toBe(300);
    expect(op.dia_pregao).toBe("2026-09-11");
    expect(op.ciclo).toBe(1);
  });

  it("venda a descoberto com pontos positivos quando o preço cai", () => {
    const r = parearPosicao(
      [
        deal({ tipo: "sell", volume: 1, preco: 5400.5, em: "2026-09-11T13:00:00Z", simbolo: "WDOV26" }),
        deal({ tipo: "buy", volume: 1, preco: 5398.0, lucro: 25, em: "2026-09-11T13:02:00Z", simbolo: "WDOV26" }),
      ],
      o,
    );
    const op = r.fechadas[0];
    expect(op.lado).toBe("venda");
    expect(op.pontos_por_contrato).toBe(2.5);
    expect(op.resultado_brl).toBe(25);
  });

  it("saídas parciais viram uma operação só, com VWAP", () => {
    const r = parearPosicao(
      [
        deal({ tipo: "buy", volume: 3, preco: 100, em: "2026-09-11T13:00:00Z" }),
        deal({ tipo: "sell", volume: 1, preco: 110, lucro: 2, em: "2026-09-11T13:01:00Z" }),
        deal({ tipo: "sell", volume: 2, preco: 120, lucro: 8, em: "2026-09-11T13:02:00Z" }),
      ],
      o,
    );
    expect(r.fechadas).toHaveLength(1);
    const op = r.fechadas[0];
    expect(op.contratos).toBe(3);
    expect(op.preco_saida).toBeCloseTo((110 + 240) / 3, 3);
    expect(op.resultado_brl).toBe(10);
    expect(op.fechamento_em).toBe("2026-09-11T13:02:00Z");
  });

  it("múltiplas entradas usam VWAP de entrada", () => {
    const r = parearPosicao(
      [
        deal({ tipo: "buy", volume: 1, preco: 100, em: "2026-09-11T13:00:00Z" }),
        deal({ tipo: "buy", volume: 1, preco: 120, em: "2026-09-11T13:01:00Z" }),
        deal({ tipo: "sell", volume: 2, preco: 130, lucro: 8, em: "2026-09-11T13:02:00Z" }),
      ],
      o,
    );
    const op = r.fechadas[0];
    expect(op.preco_entrada).toBe(110);
    expect(op.pontos_por_contrato).toBe(20);
    expect(op.abertura_em).toBe("2026-09-11T13:00:00Z");
  });

  it("reversão (inout) fecha um ciclo e abre outro no mesmo posicao_id", () => {
    const r = parearPosicao(
      [
        deal({ tipo: "buy", volume: 1, preco: 100, em: "2026-09-11T13:00:00Z" }),
        // vende 2: fecha a compra de 1 e abre venda de 1
        deal({ tipo: "sell", volume: 2, preco: 110, lucro: 2, entry: "inout", em: "2026-09-11T13:01:00Z" }),
        deal({ tipo: "buy", volume: 1, preco: 105, lucro: 1, em: "2026-09-11T13:02:00Z" }),
      ],
      o,
    );
    expect(r.fechadas).toHaveLength(2);
    expect(r.fechadas[0]).toMatchObject({ ciclo: 1, lado: "compra", contratos: 1, pontos_por_contrato: 10, resultado_brl: 2 });
    expect(r.fechadas[1]).toMatchObject({ ciclo: 2, lado: "venda", contratos: 1, pontos_por_contrato: 5, resultado_brl: 1 });
    expect(r.aberta).toBeNull();
  });

  it("posição ainda aberta não gera operação", () => {
    const r = parearPosicao(
      [
        deal({ tipo: "buy", volume: 2, preco: 100, em: "2026-09-11T13:00:00Z" }),
        deal({ tipo: "sell", volume: 1, preco: 110, lucro: 2, em: "2026-09-11T13:01:00Z" }),
      ],
      o,
    );
    expect(r.fechadas).toHaveLength(0);
    expect(r.aberta).toMatchObject({ lado: "compra", volume: 1, preco_medio: 100, aberta_em: "2026-09-11T13:00:00Z" });
  });

  it("deals fora de ordem são ordenados por horário", () => {
    const r = parearPosicao(
      [
        deal({ tipo: "sell", volume: 1, preco: 110, lucro: 2, em: "2026-09-11T13:05:00Z" }),
        deal({ tipo: "buy", volume: 1, preco: 100, em: "2026-09-11T13:00:00Z" }),
      ],
      o,
    );
    expect(r.fechadas[0]).toMatchObject({ lado: "compra", pontos_por_contrato: 10 });
  });

  it("ignora deals que não são negociação e sem volume", () => {
    const r = parearPosicao(
      [
        { ...deal({ tipo: "buy", volume: 1, preco: 100, em: "2026-09-11T13:00:00Z" }), tipo: "balance", ticket: 1 },
        { ...deal({ tipo: "buy", volume: 0, preco: 100, em: "2026-09-11T13:00:00Z" }), ticket: 2 },
      ],
      o,
    );
    expect(r.fechadas).toHaveLength(0);
    expect(r.aberta).toBeNull();
    expect(r.ignorados.sort()).toEqual([1, 2]);
  });

  it("dia de pregão segue Brasília: 02:30Z é o dia anterior", () => {
    const r = parearPosicao(
      [
        deal({ tipo: "buy", volume: 1, preco: 100, em: "2026-09-12T02:00:00Z" }),
        deal({ tipo: "sell", volume: 1, preco: 101, lucro: 0.2, em: "2026-09-12T02:30:00Z" }),
      ],
      o,
    );
    expect(r.fechadas[0].dia_pregao).toBe("2026-09-11");
  });
});
