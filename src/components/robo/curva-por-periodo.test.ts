import { describe, expect, it } from "vitest";
import {
  PONTOS_FIEL,
  PONTOS_LEVE,
  expandirSerie,
  seriePorOperacao,
  seriePorOperacaoCompacta,
  type SerieCompacta,
} from "@/components/graficos/series-da-curva";
import type { OperacaoCompacta } from "@/lib/stats/operacoes";
import type { LinhaDiaria } from "@/lib/stats/tipos";
import { curvaDoPeriodo, mesmoRecorte, opcoesDaCurva, recorteDoPeriodo } from "./curva-por-periodo";
import { PERIODOS_FECHADOS, ehPeriodoFechado } from "./periodos-resumo";

// hoje = terça 22/09/2026: a semana de pregão começa na segunda 21/09
const HOJE = "2026-09-22";
const opcoes = opcoesDaCurva(0.2);

/** Operação do dia com o R$ bruto e a hora; custos fixos. */
function op(dia: string, bruto: number, hora = 10): OperacaoCompacta {
  return [dia, hora, 2, bruto / 0.2, bruto, 0.5, 60, 1, "WINV26"];
}

/** A linha da série diária que estatisticas_publico daria para essas operações. */
function linhaDe(dia: string, doDia: readonly OperacaoCompacta[]): LinhaDiaria {
  const liquidos = doDia.map((o) => o[4] - o[5]);
  const soma = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
  return {
    dia,
    pontos_por_contrato: soma(doDia.map((o) => o[3])),
    resultado_brl_por_contrato: soma(doDia.map((o) => o[4])),
    custos_brl_por_contrato: soma(doDia.map((o) => o[5])),
    n_operacoes: doDia.length,
    n_gain: liquidos.filter((v) => v > 0).length,
    n_loss: liquidos.filter((v) => v < 0).length,
    soma_gain_brl_por_contrato: soma(liquidos.filter((v) => v > 0)),
    soma_loss_brl_por_contrato: soma(liquidos.filter((v) => v < 0)),
    maior_gain_brl_por_contrato: Math.max(0, ...liquidos),
    maior_loss_brl_por_contrato: Math.min(0, ...liquidos),
  };
}

/** `porDia` operações em cada dia, com gains e losses que não se anulam, e a série diária delas. */
function gerar(dias: readonly string[], porDia: number): { ops: OperacaoCompacta[]; linhas: LinhaDiaria[] } {
  const ops: OperacaoCompacta[] = [];
  const linhas: LinhaDiaria[] = [];
  dias.forEach((dia, d) => {
    const doDia = Array.from({ length: porDia }, (_, k) => op(dia, (k + d) % 3 === 0 ? -15 : 10, 9 + (k % 9)));
    ops.push(...doDia);
    linhas.push(linhaDe(dia, doDia));
  });
  return { ops, linhas };
}

/** `n` dias seguidos terminando em `ate` (a série diária não liga para fim de semana). */
function diasAte(ate: string, n: number): string[] {
  const fim = new Date(`${ate}T12:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) => new Date(fim - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

describe("recorteDoPeriodo", () => {
  const dias = ["2025-12-30", "2026-01-05", "2026-09-01", "2026-09-21", "2026-09-22", "2026-09-23"];
  const { ops, linhas } = gerar(dias, 2);
  const diasDe = (r: { ops: OperacaoCompacta[] }) => [...new Set(r.ops.map((o) => o[0]))];

  it("recorta semana, mês, ano e tudo até hoje, operações e dias juntos", () => {
    const semana = recorteDoPeriodo(ops, linhas, "semana", HOJE, opcoes);
    expect(diasDe(semana)).toEqual(["2026-09-21", "2026-09-22"]);
    expect(semana.dias).toEqual(["2026-09-21", "2026-09-22"]);

    const mes = recorteDoPeriodo(ops, linhas, "mes", HOJE, opcoes);
    expect(diasDe(mes)).toEqual(["2026-09-01", "2026-09-21", "2026-09-22"]);
    expect(mes.dias).toEqual(["2026-09-01", "2026-09-21", "2026-09-22"]);

    const ano = recorteDoPeriodo(ops, linhas, "ano", HOJE, opcoes);
    expect(diasDe(ano)).toEqual(["2026-01-05", "2026-09-01", "2026-09-21", "2026-09-22"]);

    // o dia depois de hoje fica de fora até de "tudo"
    const tudo = recorteDoPeriodo(ops, linhas, "tudo", HOJE, opcoes);
    expect(diasDe(tudo)).toEqual(["2025-12-30", "2026-01-05", "2026-09-01", "2026-09-21", "2026-09-22"]);
    expect(tudo.dias).toEqual(["2025-12-30", "2026-01-05", "2026-09-01", "2026-09-21", "2026-09-22"]);
    expect(tudo.ops).toHaveLength(10);
  });

  it("mantém a ordem de fechamento das operações", () => {
    const { ops: doPeriodo } = recorteDoPeriodo(ops, linhas, "tudo", HOJE, opcoes);
    expect(doPeriodo).toEqual(ops.filter((o) => o[0] <= HOJE));
  });
});

describe("curvaDoPeriodo", () => {
  // 100 operações por dia em 10 dias de setembro: 1.000 no mês, muito acima dos 240 pontos da série leve
  const { ops, linhas } = gerar(diasAte("2026-09-18", 10), 100);

  it("a página e a rota montam a série do mesmo recorte, só com resoluções diferentes", () => {
    const recorte = recorteDoPeriodo(ops, linhas, "mes", HOJE, opcoes);
    const leve = curvaDoPeriodo(ops, linhas, "mes", HOJE, opcoes, PONTOS_LEVE);
    expect(leve).toEqual(seriePorOperacaoCompacta(recorte.ops, opcoes, recorte.dias, { maxPontos: PONTOS_LEVE }));
    const completa = curvaDoPeriodo(ops, linhas, "mes", HOJE, opcoes);
    expect(completa).toEqual(seriePorOperacaoCompacta(recorte.ops, opcoes, recorte.dias, { maxPontos: PONTOS_FIEL }));
    expect(leve.total).toBe(1000);
    expect(completa.total).toBe(1000);
  });

  it("a leve agrupa em 240 pontos; a completa (padrão) tem uma operação por ponto", () => {
    const leve = curvaDoPeriodo(ops, linhas, "mes", HOJE, opcoes, PONTOS_LEVE);
    expect(leve.pontos).toHaveLength(PONTOS_LEVE);
    const subtitulosLeves = expandirSerie(leve, opcoes).map((p) => p.dica.subtitulo ?? "");
    expect(subtitulosLeves.some((s) => /^\d+ operações \(/.test(s))).toBe(true);

    const completa = curvaDoPeriodo(ops, linhas, "mes", HOJE, opcoes);
    expect(completa.pontos).toHaveLength(1000);
    const pontos = expandirSerie(completa, opcoes);
    expect(pontos.every((p) => /^[\d.]+ª operação$/.test(p.dica.subtitulo ?? ""))).toBe(true);
    // cada ponto de operação única leva a hora de abertura
    expect(completa.pontos.every((p) => p.length === 7)).toBe(true);
  });

  it("a completa, depois do JSON da rota, mostra o mesmo que a curva do Desempenho monta no navegador", () => {
    const recorte = recorteDoPeriodo(ops, linhas, "mes", HOJE, opcoes);
    const noNavegador = seriePorOperacao(recorte.ops, opcoes, recorte.dias);
    const daRota = expandirSerie(JSON.parse(JSON.stringify(curvaDoPeriodo(ops, linhas, "mes", HOJE, opcoes))), opcoes);
    expect(daRota).toHaveLength(noNavegador.length);
    daRota.forEach((p, i) => {
      expect(p.dica).toEqual(noNavegador[i].dica);
      expect(p.eixo).toBe(noNavegador[i].eixo);
      expect(Math.abs(p.posicao - noNavegador[i].posicao)).toBeLessThan(1e-4);
      expect(p.acumulado).toBeCloseTo(noNavegador[i].acumulado, 2);
      expect(p.drawdown).toBeCloseTo(noNavegador[i].drawdown, 2);
    });
  });

  it("acima de PONTOS_FIEL operações a completa agrupa, e o total continua o de verdade", () => {
    const muitas = gerar(diasAte("2026-09-18", 21), 953); // 20.013 operações
    const completa = curvaDoPeriodo(muitas.ops, muitas.linhas, "tudo", HOJE, opcoes);
    expect(completa.total).toBe(20_013);
    expect(completa.pontos).toHaveLength(PONTOS_FIEL);
  });

  it("a leve e a completa do mesmo recorte levam os mesmos extremos", () => {
    const leve = curvaDoPeriodo(ops, linhas, "mes", HOJE, opcoes, PONTOS_LEVE);
    const completa = curvaDoPeriodo(ops, linhas, "mes", HOJE, opcoes);
    expect(leve.extremos).toBeDefined();
    expect(leve.extremos).toEqual(completa.extremos);
  });

  it("período sem operação dá a série vazia", () => {
    expect(curvaDoPeriodo([], [], "semana", HOJE, opcoes)).toEqual({ dias: [], total: 0, pontos: [] });
    // operações só de antes do período: o recorte é vazio mesmo com a série diária cheia
    const antigas = gerar(["2026-08-03", "2026-08-04"], 5);
    expect(curvaDoPeriodo(antigas.ops, antigas.linhas, "mes", HOJE, opcoes)).toEqual({ dias: [], total: 0, pontos: [] });
  });
});

describe("mesmoRecorte: a completa da rota só vale quando é a mesma foto da leve do HTML", () => {
  const { ops, linhas } = gerar(diasAte("2026-09-18", 10), 100);
  const leve = JSON.parse(JSON.stringify(curvaDoPeriodo(ops, linhas, "mes", HOJE, opcoes, PONTOS_LEVE))) as SerieCompacta;
  const viaRota = (serie: SerieCompacta): unknown => JSON.parse(JSON.stringify(serie));

  it("mesmo recorte, resoluções diferentes: vale", () => {
    expect(mesmoRecorte(leve, viaRota(curvaDoPeriodo(ops, linhas, "mes", HOJE, opcoes)))).toBe(true);
    // e a própria leve, quando a rota agrupa igual (robô com menos operações que pontos)
    expect(mesmoRecorte(leve, viaRota(leve))).toBe(true);
  });

  it("um pregão a mais no banco desde que a página foi montada: não vale", () => {
    const depois = gerar([...diasAte("2026-09-18", 10), "2026-09-21"], 100); // os mesmos 10 dias e mais 21/09
    const completa = curvaDoPeriodo(depois.ops, depois.linhas, "mes", HOJE, opcoes);
    expect(completa.total).toBe(1100);
    expect(mesmoRecorte(leve, viaRota(completa))).toBe(false);
  });

  it("uma operação a mais no último dia: não vale", () => {
    const maisUma = [...ops, op("2026-09-18", 10, 16)];
    const linhasComMaisUma = linhas.map((l) => (l.dia === "2026-09-18" ? linhaDe(l.dia, maisUma.filter((o) => o[0] === l.dia)) : l));
    const completa = curvaDoPeriodo(maisUma, linhasComMaisUma, "mes", HOJE, opcoes);
    expect(completa.total).toBe(leve.total + 1);
    expect(mesmoRecorte(leve, viaRota(completa))).toBe(false);
  });

  it("mesmo total, mas a última operação diferente (histórico corrigido): não vale", () => {
    const trocada = ops.map((o, i) => (i === ops.length - 1 ? op(o[0], o[4] + 5, o[1]) : o));
    const completa = curvaDoPeriodo(trocada, linhas, "mes", HOJE, opcoes);
    expect(completa.total).toBe(leve.total);
    expect(mesmoRecorte(leve, viaRota(completa))).toBe(false);
  });

  it("virou o mês entre a página e a rota (recorte vazio) ou JSON estranho: não vale", () => {
    expect(mesmoRecorte(leve, { dias: [], total: 0, pontos: [] })).toBe(false);
    expect(mesmoRecorte(leve, null)).toBe(false);
    expect(mesmoRecorte(leve, "erro")).toBe(false);
    expect(mesmoRecorte(leve, { total: leve.total })).toBe(false);
    expect(mesmoRecorte(leve, { ...leve, pontos: [] })).toBe(false);
  });
});

describe("ehPeriodoFechado", () => {
  it("aceita só os períodos fechados, como chegam na URL", () => {
    for (const p of PERIODOS_FECHADOS) expect(ehPeriodoFechado(p)).toBe(true);
    for (const v of ["hoje", "7d", "Semana", "", undefined, null, 1, ["tudo"]]) expect(ehPeriodoFechado(v)).toBe(false);
  });
});
