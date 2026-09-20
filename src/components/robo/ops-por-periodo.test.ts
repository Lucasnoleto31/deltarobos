import { describe, expect, it, vi } from "vitest";
import type { OperacaoCompacta } from "@/lib/stats/operacoes";
import { calcularPorPeriodo } from "./ops-por-periodo";

/** Operação com o dia e o R$ bruto; o resto não importa para o recorte. */
function op(dia: string, bruto: number): OperacaoCompacta {
  return [dia, 10, 1, bruto / 0.2, bruto, 1, 60, 1, "WINV26"];
}

// hoje = sexta 18/09/2026
const HOJE = "2026-09-18";
const dias = (ops: OperacaoCompacta[]) => ops.map((o) => o[0]);

describe("calcularPorPeriodo", () => {
  it("recorta mês, ano e tudo até hoje, como o painel fazia no navegador", () => {
    const ops = [op("2025-12-30", 100), op("2026-01-05", -50), op("2026-09-01", 30), op("2026-09-18", 5), op("2026-09-21", 999)];
    const r = calcularPorPeriodo(ops, HOJE, dias);
    expect(r.mes).toEqual(["2026-09-01", "2026-09-18"]);
    expect(r.ano).toEqual(["2026-01-05", "2026-09-01", "2026-09-18"]);
    // a operação depois de hoje fica de fora até de "tudo"
    expect(r.tudo).toEqual(["2025-12-30", "2026-01-05", "2026-09-01", "2026-09-18"]);
  });

  it("reaproveita o mesmo objeto quando dois períodos cobrem as mesmas operações", () => {
    // robô que começou neste ano: ano == tudo, e o mês é menor
    const ops = [op("2026-03-02", 10), op("2026-09-10", 20)];
    const calcular = vi.fn((o: OperacaoCompacta[]) => ({ n: o.length }));
    const r = calcularPorPeriodo(ops, HOJE, calcular);
    expect(r.ano).toBe(r.tudo);
    expect(r.mes).not.toBe(r.ano);
    expect(r.mes).toEqual({ n: 1 });
    expect(calcular).toHaveBeenCalledTimes(2);
  });

  it("calcula uma vez só quando os três períodos são iguais, inclusive sem operações", () => {
    const calcular = vi.fn((o: OperacaoCompacta[]) => ({ n: o.length }));
    const r = calcularPorPeriodo([], HOJE, calcular);
    expect(r.mes).toBe(r.tudo);
    expect(r.ano).toBe(r.tudo);
    expect(r.tudo).toEqual({ n: 0 });
    expect(calcular).toHaveBeenCalledTimes(1);
  });
});
