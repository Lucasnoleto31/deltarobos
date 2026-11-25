import { describe, expect, it } from "vitest";
import { casasDosAcertos, comoOpera, duracaoTipica, ganhoPorQueda, pregoesOperados, resumoDoPeriodo, situacaoDaQueda } from "./como-opera";
import type { LinhaDiaria } from "./tipos";

/** Um pregão com as operações informadas pelo resultado já com custos (ganhos positivos, perdas negativas). */
function pregao(dia: string, p: { ganhos?: number[]; perdas?: number[]; custoPorOperacao?: number }): LinhaDiaria {
  const ganhos = p.ganhos ?? [];
  const perdas = p.perdas ?? [];
  const n = ganhos.length + perdas.length;
  const custos = (p.custoPorOperacao ?? 0) * n;
  const liquido = [...ganhos, ...perdas].reduce((s, v) => s + v, 0);
  return {
    dia,
    pontos_por_contrato: (liquido + custos) / 0.2,
    resultado_brl_por_contrato: liquido + custos,
    custos_brl_por_contrato: custos,
    n_operacoes: n,
    n_gain: ganhos.length,
    n_loss: perdas.length,
    soma_gain_brl_por_contrato: ganhos.reduce((s, v) => s + v, 0),
    soma_loss_brl_por_contrato: perdas.reduce((s, v) => s + v, 0),
    maior_gain_brl_por_contrato: Math.max(0, ...ganhos),
    maior_loss_brl_por_contrato: Math.min(0, ...perdas),
  };
}

describe("situacaoDaQueda", () => {
  it("sem queda nenhuma", () => {
    expect(situacaoDaQueda({ valor: 0, diasAteRecuperar: null }, 0)).toEqual({ tipo: "sem-queda" });
  });

  it("recuperou: em quantos dias, e quanto está abaixo do topo agora por outra queda", () => {
    expect(situacaoDaQueda({ valor: 500, diasAteRecuperar: 12 }, 0)).toEqual({ tipo: "recuperou", dias: 12, abaixoDoTopo: 0 });
    expect(situacaoDaQueda({ valor: 500, diasAteRecuperar: 12 }, 80)).toEqual({ tipo: "recuperou", dias: 12, abaixoDoTopo: 80 });
  });

  it("ainda não recuperou: quanto falta para o topo", () => {
    expect(situacaoDaQueda({ valor: 500, diasAteRecuperar: null }, 320)).toEqual({ tipo: "nao-recuperou", abaixoDoTopo: 320 });
  });
});

describe("ganhoPorQueda", () => {
  it("resultado dividido pela maior queda", () => {
    expect(ganhoPorQueda(1100, 1000)).toBeCloseTo(1.1);
  });

  it("não existe sem queda nem com prejuízo", () => {
    expect(ganhoPorQueda(1100, 0)).toBeNull();
    expect(ganhoPorQueda(-200, 1000)).toBeNull();
    expect(ganhoPorQueda(0, 1000)).toBeNull();
  });
});

describe("resumoDoPeriodo", () => {
  const linhas = [
    pregao("2026-01-05", { ganhos: [300] }),
    pregao("2026-01-06", { perdas: [-500] }),
    pregao("2026-01-20", { ganhos: [100] }),
    pregao("2026-02-03", { ganhos: [400] }),
    pregao("2026-02-10", { perdas: [-50] }),
  ];

  it("resultado, pregões e o intervalo do histórico", () => {
    const r = resumoDoPeriodo(linhas);
    expect(r.resultado).toBe(250);
    expect(r.pregoes).toBe(5);
    expect(r.primeiroDia).toBe("2026-01-05");
    expect(r.ultimoDia).toBe("2026-02-10");
  });

  it("a maior queda recuperada, com o que falta para o topo agora", () => {
    const r = resumoDoPeriodo(linhas);
    // topo de 300 em 05/01, fundo de -200 em 06/01, de volta a 300 em 03/02 (29 dias depois do topo)
    expect(r.maiorQueda).toBe(500);
    expect(r.situacao).toEqual({ tipo: "recuperou", dias: 29, abaixoDoTopo: 50 });
    expect(r.ganhoPorQueda).toBeCloseTo(0.5);
  });

  it("a maior queda ainda aberta", () => {
    const r = resumoDoPeriodo(linhas.slice(0, 3));
    expect(r.maiorQueda).toBe(500);
    expect(r.situacao).toEqual({ tipo: "nao-recuperou", abaixoDoTopo: 400 });
    // terminou no prejuízo: não há ganho para cada R$ 1 de queda
    expect(r.ganhoPorQueda).toBeNull();
  });

  it("meses com ganho e o pior mês; dias com ganho e o pior dia", () => {
    const r = resumoDoPeriodo(linhas);
    expect(r.meses.meses).toBe(2);
    expect(r.meses.comGanho).toBe(1);
    expect(r.meses.pior).toEqual({ mes: "2026-01", valor: -100, nDias: 3 });
    expect(r.diasComGanho).toBe(3);
    expect(r.piorDia).toEqual({ dia: "2026-01-06", valor: -500 });
  });

  it("os custos entram: o resultado é o já descontado", () => {
    const r = resumoDoPeriodo([pregao("2026-03-02", { ganhos: [10, 10], custoPorOperacao: 0.25 })]);
    expect(r.resultado).toBe(20);
  });

  it("sem pregão, tudo zerado e sem queda", () => {
    const r = resumoDoPeriodo([]);
    expect(r.resultado).toBe(0);
    expect(r.pregoes).toBe(0);
    expect(r.primeiroDia).toBeNull();
    expect(r.situacao).toEqual({ tipo: "sem-queda" });
    expect(r.piorDia).toBeNull();
    expect(r.meses.meses).toBe(0);
  });
});

describe("comoOpera", () => {
  const linhas = [
    pregao("2026-01-05", { ganhos: [20, 30, 25, 25], perdas: [-100], custoPorOperacao: 0.25 }),
    pregao("2026-01-06", { ganhos: [20, 30, 25, 25], perdas: [-120], custoPorOperacao: 0.25 }),
  ];

  it("acertos com o necessário para empatar", () => {
    const c = comoOpera(linhas);
    expect(c.operacoes).toBe(10);
    expect(c.acertos).toBeCloseTo(0.8);
    // ganho típico de 25 e perda típica de 110: 110 / (25 + 110)
    expect(c.ganhoTipico).toBeCloseTo(25);
    expect(c.perdaTipica).toBeCloseTo(-110);
    expect(c.paraEmpatar).toBeCloseTo(110 / 135);
  });

  it("a maior perda numa operação, com o dia", () => {
    expect(comoOpera(linhas).maiorPerda).toEqual({ dia: "2026-01-06", valor: -120 });
  });

  it("resultado médio por operação já com o custo, e o custo ao lado", () => {
    const c = comoOpera(linhas);
    // 200 de ganho, 220 de perda: -20 em 10 operações
    expect(c.resultadoPorOperacao).toBeCloseTo(-2);
    expect(c.custoPorOperacao).toBeCloseTo(0.25);
  });

  it("fator de lucro e ritmo", () => {
    const c = comoOpera(linhas);
    expect(c.fatorLucro).toBeCloseTo(200 / 220);
    expect(c.pregoes).toBe(2);
    expect(c.operacoesPorDia).toBeCloseTo(5);
  });

  it("sem perda não há fator de lucro, perda típica nem acertos para empatar", () => {
    const c = comoOpera([pregao("2026-01-05", { ganhos: [10, 20] })]);
    expect(c.acertos).toBe(1);
    expect(c.fatorLucro).toBeNull();
    expect(c.perdaTipica).toBeNull();
    expect(c.maiorPerda).toBeNull();
    expect(c.paraEmpatar).toBeNull();
  });

  it("sem operação, nada a dizer", () => {
    const c = comoOpera([]);
    expect(c.operacoes).toBe(0);
    expect(c.acertos).toBeNull();
    expect(c.resultadoPorOperacao).toBeNull();
    expect(c.custoPorOperacao).toBeNull();
    expect(c.operacoesPorDia).toBeNull();
  });
});

describe("casasDosAcertos", () => {
  it("inteiro quando os dois números se distinguem", () => {
    expect(casasDosAcertos(0.83, 0.81)).toBe(0);
    expect(casasDosAcertos(0.5, null)).toBe(0);
  });

  it("uma casa quando são diferentes e arredondam para o mesmo inteiro", () => {
    expect(casasDosAcertos(0.806, 0.809)).toBe(1);
  });

  it("iguais de verdade continuam inteiros", () => {
    expect(casasDosAcertos(0.8, 0.8)).toBe(0);
  });
});

describe("duracaoTipica", () => {
  it("é a mediana das durações medidas", () => {
    expect(duracaoTipica([60, 240, 120])).toBe(120);
    expect(duracaoTipica([60, 120, 240, 600])).toBe(180);
  });

  it("uma operação que atravessa a tarde não muda o normal", () => {
    expect(duracaoTipica([200, 220, 240, 260, 18_000])).toBe(240);
  });

  it("duração zero (histórico importado) não conta; sem nenhuma medida, nulo", () => {
    expect(duracaoTipica([0, 0, 90, 0, 150])).toBe(120);
    expect(duracaoTipica([0, 0])).toBeNull();
    expect(duracaoTipica([])).toBeNull();
    expect(duracaoTipica([Number.NaN, -5])).toBeNull();
  });
});

describe("pregoesOperados", () => {
  const feriados2026 = ["2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03"];

  it("conta os pregões operados contra os que a bolsa teve no intervalo", () => {
    // de segunda 09/02 a sexta 20/02/2026: 10 dias úteis, menos o carnaval (16 e 17)
    const p = pregoesOperados(["2026-02-09", "2026-02-10", "2026-02-12", "2026-02-20"], feriados2026);
    expect(p).toEqual({ operou: 4, daBolsa: 8, de: "2026-02-09", ate: "2026-02-20" });
  });

  it("dia repetido conta uma vez, em qualquer ordem", () => {
    const p = pregoesOperados(["2026-02-10", "2026-02-09", "2026-02-10"], feriados2026);
    expect(p.operou).toBe(2);
    expect(p.daBolsa).toBe(2);
  });

  it("ano do histórico sem feriado cadastrado: não compara com a bolsa", () => {
    const p = pregoesOperados(["2025-12-29", "2026-01-05"], feriados2026);
    expect(p.operou).toBe(2);
    expect(p.daBolsa).toBeNull();
  });

  it("calendário que não bate com o histórico (operou em feriado cadastrado): não compara", () => {
    const p = pregoesOperados(["2026-02-16", "2026-02-17"], feriados2026);
    expect(p.operou).toBe(2);
    expect(p.daBolsa).toBeNull();
  });

  it("sem pregão", () => {
    expect(pregoesOperados([], feriados2026)).toEqual({ operou: 0, daBolsa: null, de: null, ate: null });
  });
});
