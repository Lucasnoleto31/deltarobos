import { describe, expect, it } from "vitest";
import { periodoInicial } from "./periodos-resumo";

const linha = (dia: string, n_operacoes = 3) => ({ dia, n_operacoes });

// sábado 19/09/2026, pregão fechado; a semana de pregão começou na segunda 14/09
const SABADO = "2026-09-19";
const fechado = { operacoesHoje: 0, pregaoAberto: false };

describe("periodoInicial", () => {
  it("abre em Hoje com o pregão aberto, mesmo antes da primeira operação", () => {
    expect(periodoInicial([linha("2026-09-18")], "2026-09-21", { operacoesHoje: 0, pregaoAberto: true })).toBe("hoje");
  });

  it("abre em Hoje depois do fechamento quando o dia teve operação", () => {
    expect(periodoInicial([linha("2026-09-18")], "2026-09-18", { operacoesHoje: 12, pregaoAberto: false })).toBe("hoje");
  });

  it("no sábado abre na semana que acabou de fechar", () => {
    expect(periodoInicial([linha("2026-08-28"), linha("2026-09-18")], SABADO, fechado)).toBe("semana");
  });

  it("na segunda antes da abertura pula a semana vazia e abre no mês", () => {
    expect(periodoInicial([linha("2026-09-18")], "2026-09-21", fechado)).toBe("mes");
  });

  it("segue para o ano e para tudo quando os períodos menores estão vazios", () => {
    expect(periodoInicial([linha("2026-03-02")], SABADO, fechado)).toBe("ano");
    expect(periodoInicial([linha("2025-11-03")], SABADO, fechado)).toBe("tudo");
  });

  it("ignora linha sem operação e dia depois de hoje", () => {
    expect(periodoInicial([linha("2026-09-15", 0), linha("2026-09-22"), linha("2026-09-01")], SABADO, fechado)).toBe("mes");
  });

  it("fica em Hoje quando o robô não tem operação nenhuma", () => {
    expect(periodoInicial([], SABADO, fechado)).toBe("hoje");
  });
});
