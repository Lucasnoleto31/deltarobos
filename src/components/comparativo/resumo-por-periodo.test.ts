import { describe, expect, it } from "vitest";
import type { LinhaDiaria } from "@/lib/stats/tipos";
import { resumirPorPeriodo } from "./resumo-por-periodo";

/** Dia com resultado bruto e custos em R$, por contrato. */
function dia(d: string, bruto: number, custos: number, nOps: number): LinhaDiaria {
  return {
    dia: d,
    pontos_por_contrato: bruto / 0.2,
    resultado_brl_por_contrato: bruto,
    custos_brl_por_contrato: custos,
    n_operacoes: nOps,
    n_gain: 0,
    n_loss: 0,
    soma_gain_brl_por_contrato: 0,
    soma_loss_brl_por_contrato: 0,
    maior_gain_brl_por_contrato: 0,
    maior_loss_brl_por_contrato: 0,
  };
}

// hoje = sexta 18/09/2026: a semana começa na segunda 14/09
const HOJE = "2026-09-18";
const serie: LinhaDiaria[] = [
  dia("2025-12-30", 500, 10, 4), // ano passado: só em "tudo"
  dia("2026-01-05", -200, 5, 2), // ano
  dia("2026-09-01", 300, 20, 6), // mês
  dia("2026-09-15", 100, 4, 3), // semana
  dia("2026-09-18", -50, 2, 1), // hoje, entra na semana
  dia("2026-09-21", 999, 0, 9), // depois de hoje: fica de fora de tudo
];

describe("resumirPorPeriodo", () => {
  it("soma o resultado líquido, as operações e os pregões de cada período até hoje", () => {
    const r = resumirPorPeriodo(serie, 0.2, HOJE);
    expect(r.semana).toEqual({ total: 96 - 52, nOps: 4, nDias: 2 });
    expect(r.mes).toEqual({ total: 280 + 96 - 52, nOps: 10, nDias: 3 });
    expect(r.ano).toEqual({ total: -205 + 280 + 96 - 52, nOps: 12, nDias: 4 });
    expect(r.tudo).toEqual({ total: 490 - 205 + 280 + 96 - 52, nOps: 16, nDias: 5 });
  });

  it("período sem pregão sai zerado, para a barra mostrar \"sem operações\"", () => {
    const r = resumirPorPeriodo([dia("2026-08-10", 100, 0, 1)], 0.2, HOJE);
    expect(r.semana).toEqual({ total: 0, nOps: 0, nDias: 0 });
    expect(r.mes).toEqual({ total: 0, nOps: 0, nDias: 0 });
    expect(r.ano.nDias).toBe(1);
  });
});
