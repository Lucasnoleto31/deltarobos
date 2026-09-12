import { describe, expect, it } from "vitest";
import { classificar, rotuloFaixa, validarFaixas } from "./faixas";
import type { OperacaoCompacta } from "./operacoes";

// [dia, hora, diaSemana, pontos, brl, custos, duracao, lado, simbolo]
function op(dia: string, diaSemana: number, hora: number, liquido: number): OperacaoCompacta {
  return [dia, hora, diaSemana, liquido / 0.2, liquido, 0, 60, 1, "WINV26"];
}

function serie(diaSemana: number, hora: number, valores: number[], mes = "2026-09"): OperacaoCompacta[] {
  return valores.map((v, i) => op(`${mes}-${String((i % 28) + 1).padStart(2, "0")}`, diaSemana, hora, v));
}

describe("classificar / rotuloFaixa", () => {
  it("limiares e amostra mínima", () => {
    expect(classificar(80, 50)).toBe("ligar");
    expect(classificar(60, 50)).toBe("cautela");
    expect(classificar(50, 50)).toBe("neutro");
    expect(classificar(30, 50)).toBe("evitar");
    expect(classificar(90, 5)).toBeNull();
  });
  it("rótulo em pt-BR", () => {
    expect(rotuloFaixa(1, 9)).toBe("Segunda 09:00");
    expect(rotuloFaixa(5, 17)).toBe("Sexta 17:00");
  });
});

describe("validarFaixas", () => {
  // segunda 9h: 30 gains de +30 (2 meses positivos) -> ligar
  const boa = [...serie(1, 9, Array(15).fill(30), "2026-08"), ...serie(1, 9, Array(15).fill(30), "2026-09")];
  // terça 10h: 20 losses de -50 -> evitar
  const ruim = serie(2, 10, Array(20).fill(-50));
  // quarta 11h: mistura fraca, 12 ops, +10/-8 alternando -> intermediária
  const meio = serie(3, 11, Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 10 : -8)));
  // quinta 12h: só 3 ops -> sem classificação
  const poucas = serie(4, 12, [5, 5, 5]);
  // fora da grade (sábado) é ignorada
  const fora = serie(6, 9, [100]);

  const r = validarFaixas([...boa, ...ruim, ...meio, ...poucas, ...fora]);

  it("monta 45 faixas e conta só as operações da grade", () => {
    expect(r.faixas).toHaveLength(45);
    expect(r.nOperacoes).toBe(30 + 20 + 12 + 3);
    expect(r.comDados).toHaveLength(3);
  });

  it("classifica extremos", () => {
    const f = (d: number, h: number) => r.faixas.find((x) => x.diaSemana === d && x.hora === h)!;
    expect(f(1, 9).classe).toBe("ligar");
    expect(f(1, 9).acerto).toBe(1);
    expect(f(1, 9).estabilidade).toBe(1);
    expect(f(1, 9).lote).toBe(1);
    expect(f(2, 10).classe).toBe("evitar");
    expect(f(2, 10).score).toBeLessThanOrEqual(40);
    expect(f(4, 12).classe).toBeNull();
    expect(f(4, 12).n).toBe(3);
  });

  it("contagem, melhores e insights", () => {
    expect(r.contagem.ligar).toBe(1);
    expect(r.contagem.evitar).toBe(1);
    expect(r.melhores[0].rotulo).toBe("Segunda 09:00");
    expect(r.insights.some((i) => i.chave === "ligar")).toBe(true);
    expect(r.insights.find((i) => i.chave === "pior-hora")?.texto).toContain("10h");
  });

  it("lista vazia", () => {
    const v = validarFaixas([]);
    expect(v.comDados).toHaveLength(0);
    expect(v.insights).toHaveLength(0);
    expect(v.melhores).toHaveLength(0);
  });
});
