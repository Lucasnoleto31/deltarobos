import { describe, expect, it } from "vitest";
import { classificarFaixa, drawdownPorOperacao, PARAMETROS_FAIXAS_PADRAO, rotuloFaixa, validarFaixas } from "./faixas";
import type { OperacaoCompacta } from "./operacoes";

// [dia, hora, diaSemana, pontos, brl, custos, duracao, lado, simbolo]
function op(dia: string, diaSemana: number, hora: number, liquido: number): OperacaoCompacta {
  return [dia, hora, diaSemana, liquido / 0.2, liquido, 0, 60, 1, "WINV26"];
}

function serie(diaSemana: number, hora: number, valores: number[], mes = "2026-09"): OperacaoCompacta[] {
  return valores.map((v, i) => op(`${mes}-${String((i % 28) + 1).padStart(2, "0")}`, diaSemana, hora, v));
}

describe("drawdownPorOperacao / rotuloFaixa", () => {
  it("drawdown da curva operação a operação", () => {
    expect(drawdownPorOperacao([10, -8, 10, -8])).toBe(8);
    expect(drawdownPorOperacao([30, 30, 30])).toBe(0);
    expect(drawdownPorOperacao([-50, -50])).toBe(100);
    expect(drawdownPorOperacao([])).toBe(0);
  });
  it("rótulo em pt-BR", () => {
    expect(rotuloFaixa(1, 9)).toBe("Segunda 09:00");
    expect(rotuloFaixa(5, 17)).toBe("Sexta 17:00");
  });
});

describe("classificarFaixa (parâmetros padrão)", () => {
  const p = PARAMETROS_FAIXAS_PADRAO;
  it("amostra mínima", () => {
    expect(classificarFaixa({ n: 39, acerto: 1, recuperacao: null, ddRelativo: 0 }, p).classe).toBeNull();
  });
  it("qualquer condição de evitar decide sozinha", () => {
    expect(classificarFaixa({ n: 40, acerto: 0.3, recuperacao: 5, ddRelativo: 1 }, p).classe).toBe("evitar");
    expect(classificarFaixa({ n: 40, acerto: 0.9, recuperacao: 0.3, ddRelativo: 1 }, p).classe).toBe("evitar");
    expect(classificarFaixa({ n: 40, acerto: 0.9, recuperacao: 5, ddRelativo: 7 }, p).classe).toBe("evitar");
  });
  it("ligar exige as três condições", () => {
    expect(classificarFaixa({ n: 40, acerto: 0.6, recuperacao: 1, ddRelativo: 3 }, p).classe).toBe("ligar");
    expect(classificarFaixa({ n: 40, acerto: 0.6, recuperacao: 1, ddRelativo: 5 }, p).classe).toBe("cautela"); // DD relativo alto demais pra ligar
    expect(classificarFaixa({ n: 40, acerto: 0.6, recuperacao: null, ddRelativo: null }, p).classe).toBe("ligar"); // recuperação infinita
  });
  it("cautela e neutro", () => {
    expect(classificarFaixa({ n: 40, acerto: 0.5, recuperacao: 0.7, ddRelativo: 1 }, p).classe).toBe("cautela");
    expect(classificarFaixa({ n: 40, acerto: 0.45, recuperacao: 0.7, ddRelativo: 1 }, p).classe).toBe("neutro");
    expect(classificarFaixa({ n: 40, acerto: 0.5, recuperacao: 0.5, ddRelativo: 1 }, p).classe).toBe("neutro");
  });
  it("parâmetros customizados", () => {
    const solto = { ...p, amostraMinima: 5, ligar: { acertoMin: 0.5, recuperacaoMin: 0.5, ddRelativoMax: 10 } };
    expect(classificarFaixa({ n: 5, acerto: 0.5, recuperacao: 0.5, ddRelativo: 5 }, solto).classe).toBe("ligar");
    // evitar continua valendo antes de ligar: DD relativo 9 > 6 do padrão
    expect(classificarFaixa({ n: 5, acerto: 0.5, recuperacao: 0.5, ddRelativo: 9 }, solto).classe).toBe("evitar");
  });
});

describe("validarFaixas", () => {
  // segunda 9h: 40 gains de +30 em 2 meses -> ligar (recuperação infinita)
  const boa = [...serie(1, 9, Array(20).fill(30), "2026-08"), ...serie(1, 9, Array(20).fill(30), "2026-09")];
  // terça 10h: 40 losses de -50 -> evitar (acerto 0%)
  const ruim = serie(2, 10, Array(40).fill(-50));
  // quarta 11h: 50 ops alternando +10/-8 -> acerto 50%, recuperação 50/8 -> cautela
  const meio = serie(3, 11, Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? 10 : -8)));
  // quinta 12h: só 3 ops -> sem classificação
  const poucas = serie(4, 12, [5, 5, 5]);
  // fora da grade (sábado) é ignorada
  const fora = serie(6, 9, [100]);

  const r = validarFaixas([...boa, ...ruim, ...meio, ...poucas, ...fora]);
  const f = (d: number, h: number) => r.faixas.find((x) => x.diaSemana === d && x.hora === h)!;

  it("monta 45 faixas e conta só as operações da grade", () => {
    expect(r.faixas).toHaveLength(45);
    expect(r.nOperacoes).toBe(40 + 40 + 50 + 3);
    expect(r.comDados).toHaveLength(3);
    expect(r.parametros).toEqual(PARAMETROS_FAIXAS_PADRAO);
  });

  it("métricas por faixa e mediana de drawdown", () => {
    expect(f(1, 9)).toMatchObject({ n: 40, acerto: 1, dd: 0, recuperacao: null, classe: "ligar", lote: 1 });
    expect(f(2, 10)).toMatchObject({ n: 40, acerto: 0, dd: 2000, recuperacao: -1, classe: "evitar", lote: 0 });
    expect(f(3, 11)).toMatchObject({ n: 50, acerto: 0.5, dd: 8, recuperacao: 50 / 8, classe: "cautela", lote: 0.6 });
    expect(r.medianaDd).toBe((8 + 2000) / 2);
    expect(f(3, 11).ddRelativo).toBeCloseTo(8 / 1004);
    expect(f(4, 12).classe).toBeNull();
    expect(f(4, 12).motivo).toContain("mínimo 40");
    expect(f(2, 10).motivo).toContain("acerto 0%");
  });

  it("contagem, melhores e insights", () => {
    expect(r.contagem).toEqual({ ligar: 1, cautela: 1, neutro: 0, evitar: 1 });
    expect(r.melhores[0].rotulo).toBe("Segunda 09:00");
    expect(r.insights.some((i) => i.chave === "ligar")).toBe(true);
    expect(r.insights.find((i) => i.chave === "pior-hora")?.texto).toContain("10h");
  });

  it("lista vazia", () => {
    const v = validarFaixas([]);
    expect(v.comDados).toHaveLength(0);
    expect(v.insights).toHaveLength(0);
    expect(v.melhores).toHaveLength(0);
    expect(v.medianaDd).toBe(0);
  });
});
