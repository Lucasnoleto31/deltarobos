import { describe, expect, it } from "vitest";
import { resumirCardRobo } from "./resumo-robo";
import type { LinhaDiaria } from "./tipos";

function linha(dia: string, brl: number): LinhaDiaria {
  return {
    dia,
    pontos_por_contrato: brl / 0.2,
    resultado_brl_por_contrato: brl,
    custos_brl_por_contrato: 0,
    n_operacoes: 1,
    n_gain: brl > 0 ? 1 : 0,
    n_loss: brl < 0 ? 1 : 0,
    soma_gain_brl_por_contrato: brl > 0 ? brl : 0,
    soma_loss_brl_por_contrato: brl < 0 ? brl : 0,
    maior_gain_brl_por_contrato: brl > 0 ? brl : 0,
    maior_loss_brl_por_contrato: brl < 0 ? brl : 0,
  };
}

describe("resumirCardRobo", () => {
  const o = { base: "liquido" as const, unidade: "brl" as const, valorPonto: 0.2 };
  const r = resumirCardRobo(
    [
      linha("2026-07-10", 100),
      linha("2026-08-20", -40),
      linha("2026-09-10", 30),
      linha("2026-09-12", 50),
      linha("2026-09-13", 999), // futuro: ignorado
    ],
    o,
    "2026-09-12",
  );

  it("hoje, mês e acumulado", () => {
    expect(r.hoje).toBe(50);
    expect(r.mes).toBe(80);
    expect(r.acumulado).toBe(140);
    expect(r.nDias).toBe(4);
    expect(r.ultimoDia).toBe("2026-09-12");
  });

  it("drawdown máximo", () => {
    expect(r.drawdownMaximo).toBe(40);
  });

  it("sparkline só com os últimos 30 dias, acumulando do zero", () => {
    expect(r.sparkline).toEqual([-40, -10, 40]);
  });
});
