import { describe, expect, it } from "vitest";
import { gradeMes, heatmapAnoMes, mesesComDados } from "./calendario";
import type { LinhaDiaria, OpcoesSerie } from "./tipos";

function linha(dia: string, brl: number, n = 1): LinhaDiaria {
  return {
    dia,
    pontos_por_contrato: brl / 0.2,
    resultado_brl_por_contrato: brl,
    custos_brl_por_contrato: 0,
    n_operacoes: n,
    n_gain: brl > 0 ? n : 0,
    n_loss: brl < 0 ? n : 0,
    soma_gain_brl_por_contrato: brl > 0 ? brl : 0,
    soma_loss_brl_por_contrato: brl < 0 ? brl : 0,
    maior_gain_brl_por_contrato: brl > 0 ? brl : 0,
    maior_loss_brl_por_contrato: brl < 0 ? brl : 0,
  };
}

const o: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: 0.2 };
const linhas = [
  linha("2026-08-31", 10),
  linha("2026-09-01", 100, 3),
  linha("2026-09-02", -40),
  linha("2026-09-04", 25),
];

describe("gradeMes", () => {
  const g = gradeMes(linhas, "2026-09", o, ["2026-09-07"]);

  it("setembro/2026 começa numa terça e ocupa 5 semanas", () => {
    expect(g.semanas).toHaveLength(5);
    expect(g.semanas[0][0].dia).toBe("2026-08-30"); // domingo anterior
    expect(g.semanas[0][0].foraDoMes).toBe(true);
    expect(g.semanas[0][2].dia).toBe("2026-09-01");
    expect(g.semanas[0][2].foraDoMes).toBe(false);
  });

  it("valores, totais e feriado", () => {
    expect(g.semanas[0][2].valor).toBe(100);
    expect(g.semanas[0][2].nOperacoes).toBe(3);
    expect(g.semanas[0][3].valor).toBe(-40);
    expect(g.semanas[0][4].valor).toBeNull(); // 03/09 sem operação
    expect(g.total).toBe(85);
    expect(g.nDias).toBe(3);
    expect(g.nPositivos).toBe(2);
    expect(g.nNegativos).toBe(1);
    const feriado = g.semanas[1].find((d) => d.dia === "2026-09-07");
    expect(feriado?.pregao).toBe(false);
    const sabado = g.semanas[0][6];
    expect(sabado.pregao).toBe(false);
  });

  it("dia de outro mês não conta mesmo com linha", () => {
    expect(g.semanas[0][1].dia).toBe("2026-08-31");
    expect(g.semanas[0][1].valor).toBeNull();
  });
});

describe("heatmapAnoMes / mesesComDados", () => {
  it("agrupa por ano e mês", () => {
    const h = heatmapAnoMes([...linhas, linha("2025-12-15", 7)], o);
    expect(h.map((l) => l.ano)).toEqual(["2025", "2026"]);
    expect(h[0].meses[11]).toMatchObject({ mes: "2025-12", total: 7, nDias: 1 });
    expect(h[1].meses[7]).toMatchObject({ mes: "2026-08", total: 10 });
    expect(h[1].meses[8]).toMatchObject({ mes: "2026-09", total: 85, nDias: 3 });
    expect(h[1].meses[0]).toBeNull();
    expect(h[1].total).toBe(95);
  });

  it("meses com dados em ordem", () => {
    expect(mesesComDados(linhas)).toEqual(["2026-08", "2026-09"]);
  });
});
