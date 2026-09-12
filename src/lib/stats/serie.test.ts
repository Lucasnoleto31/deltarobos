import { describe, expect, it } from "vitest";
import { curvaAcumulada, drawdownMaximo, somaPeriodo, valorDia } from "./serie";
import type { LinhaDiaria, OpcoesSerie } from "./tipos";

function linha(dia: string, brl: number, custos = 0): LinhaDiaria {
  const liquido = brl - custos;
  return {
    dia,
    pontos_por_contrato: brl / 0.2,
    resultado_brl_por_contrato: brl,
    custos_brl_por_contrato: custos,
    n_operacoes: 1,
    n_gain: liquido > 0 ? 1 : 0,
    n_loss: liquido < 0 ? 1 : 0,
    soma_gain_brl_por_contrato: liquido > 0 ? liquido : 0,
    soma_loss_brl_por_contrato: liquido < 0 ? liquido : 0,
    maior_gain_brl_por_contrato: liquido > 0 ? liquido : 0,
    maior_loss_brl_por_contrato: liquido < 0 ? liquido : 0,
  };
}

const brlBruto: OpcoesSerie = { base: "bruto", unidade: "brl", valorPonto: 0.2 };

describe("valorDia", () => {
  it("bruto em R$ ignora custos", () => {
    expect(valorDia(linha("2026-09-01", 100, 3), brlBruto)).toBe(100);
  });

  it("líquido em R$ desconta custos", () => {
    expect(valorDia(linha("2026-09-01", 100, 3), { ...brlBruto, base: "liquido" })).toBe(97);
  });

  it("líquido em pontos converte o custo pelo valor do ponto", () => {
    // 100 R$ = 500 pts; custo R$ 2 = 10 pts
    expect(
      valorDia(linha("2026-09-01", 100, 2), { base: "liquido", unidade: "pontos", valorPonto: 0.2 }),
    ).toBeCloseTo(490);
  });

  it("multiplica pelos contratos", () => {
    expect(valorDia(linha("2026-09-01", 100, 2), { ...brlBruto, contratos: 5 })).toBe(500);
  });
});

describe("curvaAcumulada", () => {
  it("acumula, marca pico e drawdown, ordenando por dia", () => {
    const curva = curvaAcumulada(
      [linha("2026-09-03", 30), linha("2026-09-01", 100), linha("2026-09-02", -50)],
      brlBruto,
    );
    expect(curva.map((p) => p.dia)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(curva.map((p) => p.acumulado)).toEqual([100, 50, 80]);
    expect(curva.map((p) => p.pico)).toEqual([100, 100, 100]);
    expect(curva.map((p) => p.drawdown)).toEqual([0, -50, -20]);
  });

  it("curva vazia", () => {
    expect(curvaAcumulada([], brlBruto)).toEqual([]);
  });
});

describe("drawdownMaximo", () => {
  it("sem recuperação", () => {
    const dd = drawdownMaximo(
      curvaAcumulada(
        [linha("2026-09-01", 100), linha("2026-09-02", -50), linha("2026-09-03", 30)],
        brlBruto,
      ),
    );
    expect(dd.valor).toBe(50);
    expect(dd.inicio).toBe("2026-09-01");
    expect(dd.fundo).toBe("2026-09-02");
    expect(dd.recuperacao).toBeNull();
    expect(dd.diasAteRecuperar).toBeNull();
  });

  it("com recuperação conta os dias", () => {
    const dd = drawdownMaximo(
      curvaAcumulada(
        [
          linha("2026-09-01", 100),
          linha("2026-09-02", -50),
          linha("2026-09-03", 30),
          linha("2026-09-04", 30),
        ],
        brlBruto,
      ),
    );
    expect(dd.valor).toBe(50);
    expect(dd.recuperacao).toBe("2026-09-04");
    expect(dd.diasAteRecuperar).toBe(3);
  });

  it("começando no vermelho o início é o primeiro dia", () => {
    const dd = drawdownMaximo(
      curvaAcumulada([linha("2026-09-01", -20), linha("2026-09-02", -30)], brlBruto),
    );
    expect(dd.valor).toBe(50);
    expect(dd.inicio).toBe("2026-09-01");
    expect(dd.fundo).toBe("2026-09-02");
  });

  it("curva só positiva não tem drawdown", () => {
    const dd = drawdownMaximo(
      curvaAcumulada([linha("2026-09-01", 10), linha("2026-09-02", 20)], brlBruto),
    );
    expect(dd.valor).toBe(0);
    expect(dd.fundo).toBeNull();
  });
});

describe("somaPeriodo", () => {
  it("soma nas unidades pedidas", () => {
    expect(somaPeriodo([linha("2026-09-01", 10), linha("2026-09-02", -4)], brlBruto)).toBe(6);
  });
});
