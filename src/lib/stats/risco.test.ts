import { describe, expect, it } from "vitest";
import type { ExposicaoDoDia } from "./exposicao";
import type { DiaValor } from "./indicadores-robo";
import { capitalMinimoRecomendado } from "./kpis";
import {
  capitalParaAQuedaCaber,
  contaDoCapital,
  curvaDosDias,
  episodiosDrawdown,
  maiorSequenciaDePerdas,
  piorMomentoMedido,
  resultadoPorOperacao,
  resumoDiario,
  riscoDoRobo,
} from "./risco";
import { curvaAcumulada, drawdownMaximo } from "./serie";
import type { LinhaDiaria, OpcoesSerie } from "./tipos";

function linha(dia: string, brl: number, custos = 0, n = 1): LinhaDiaria {
  return {
    dia,
    pontos_por_contrato: brl / 0.2,
    resultado_brl_por_contrato: brl,
    custos_brl_por_contrato: custos,
    n_operacoes: n,
    n_gain: brl > 0 ? 1 : 0,
    n_loss: brl < 0 ? 1 : 0,
    soma_gain_brl_por_contrato: brl > 0 ? brl : 0,
    soma_loss_brl_por_contrato: brl < 0 ? brl : 0,
    maior_gain_brl_por_contrato: brl > 0 ? brl : 0,
    maior_loss_brl_por_contrato: brl < 0 ? brl : 0,
  };
}

const d = (dia: string, valor: number): DiaValor => ({ dia, valor });

const o: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: 0.2 };
const LINHAS = [
  linha("2026-09-01", 100), // pico 100
  linha("2026-09-02", -30), // queda de 30
  linha("2026-09-03", 40), // recupera (110)
  linha("2026-09-04", -80), // queda de 80
  linha("2026-09-07", -20), // queda de 100 (fundo)
  linha("2026-09-08", 50), // ainda 50 abaixo do topo
];
const curva = curvaAcumulada(LINHAS, o);
const DIAS: DiaValor[] = curva.map((p) => d(p.dia, p.valor));

describe("curvaDosDias", () => {
  it("é a mesma curva de curvaAcumulada, a partir de data e valor", () => {
    expect(curvaDosDias(DIAS)).toEqual(curva);
    expect(curvaDosDias([])).toEqual([]);
  });

  it("a partida, em zero, conta como topo", () => {
    const c = curvaDosDias([d("2026-09-01", -40), d("2026-09-02", 10)]);
    expect(c.map((p) => p.drawdown)).toEqual([-40, -30]);
    expect(c.map((p) => p.pico)).toEqual([0, 0]);
  });
});

describe("episodiosDrawdown", () => {
  it("separa episódios, ordena pelo maior e marca o aberto", () => {
    const eps = episodiosDrawdown(curva);
    expect(eps).toHaveLength(2);
    expect(eps[0]).toMatchObject({ inicio: "2026-09-03", fundo: "2026-09-07", recuperacao: null, valor: 100, diasAteFundo: 4, diasAteRecuperar: null });
    expect(eps[1]).toMatchObject({ inicio: "2026-09-01", fundo: "2026-09-02", recuperacao: "2026-09-03", valor: 30, diasAteFundo: 1, diasAteRecuperar: 2 });
  });

  it("limite, todos e curva vazia", () => {
    expect(episodiosDrawdown([])).toEqual([]);
    expect(episodiosDrawdown(curva, 1)).toHaveLength(1);
    expect(episodiosDrawdown(curva, Infinity)).toHaveLength(2);
  });
});

describe("maiorSequenciaDePerdas", () => {
  it("conta os pregões seguidos com perda, com as datas e a soma", () => {
    expect(maiorSequenciaDePerdas(DIAS)).toEqual({ dias: 2, de: "2026-09-04", ate: "2026-09-07", soma: -100 });
  });

  it("dia zerado interrompe, como em resumoDiario", () => {
    const dias = [d("2026-09-01", -10), d("2026-09-02", 0), d("2026-09-03", -10), d("2026-09-04", -5)];
    const seq = maiorSequenciaDePerdas(dias);
    expect(seq).toEqual({ dias: 2, de: "2026-09-03", ate: "2026-09-04", soma: -15 });
    expect(seq?.dias).toBe(resumoDiario(curvaDosDias(dias), []).maiorSequenciaNegativa);
  });

  it("entre duas do mesmo tamanho, fica a que perdeu mais", () => {
    const dias = [d("2026-09-01", -10), d("2026-09-02", -10), d("2026-09-03", 5), d("2026-09-04", -30), d("2026-09-07", -1)];
    expect(maiorSequenciaDePerdas(dias)).toMatchObject({ dias: 2, de: "2026-09-04", soma: -31 });
  });

  it("sem pregão com perda, nulo", () => {
    expect(maiorSequenciaDePerdas([])).toBeNull();
    expect(maiorSequenciaDePerdas([d("2026-09-01", 10), d("2026-09-02", 0)])).toBeNull();
  });
});

describe("piorMomentoMedido", () => {
  const medicao = (dia: string, men: number | null, saidas = 0, parcial = false): ExposicaoDoDia => ({
    dia,
    mep_ea: men === null ? null : 50,
    men_ea: men,
    mep_ea_n_saidas: 0,
    men_ea_n_saidas: saidas,
    excursao_ea_parcial: parcial,
    men_ea_em: men === null ? null : `${dia}T14:30:00Z`,
  });

  it("acha o dia que foi mais fundo, já com o custo das operações fechadas até ali, e diz como ele fechou", () => {
    const pior = piorMomentoMedido([medicao("2026-09-01", -200), medicao("2026-09-02", -480, 8), medicao("2026-09-03", -100)], DIAS, 2.5, 0.2);
    // -480 bruto, 8 operações já fechadas a R$ 2,50 = -500; o dia 02/09 da série fechou em -30
    expect(pior).toEqual({ valor: -500, dia: "2026-09-02", em: "2026-09-02T14:30:00Z", fechamento: -30, pregoesMedidos: 3, parcial: false });
  });

  it("dia sem medição não conta; a marca de parcial vem do dia escolhido", () => {
    const pior = piorMomentoMedido([medicao("2026-09-01", null), medicao("2026-09-02", -90, 0, true)], DIAS, 0, 0.2);
    expect(pior).toMatchObject({ valor: -90, pregoesMedidos: 1, parcial: true });
  });

  it("medição de um dia que não está na série pública fica de fora", () => {
    // 05/09 e 06/09 não têm resultado publicado: o -900 não pode ser o pior momento da tela
    const pior = piorMomentoMedido([medicao("2026-09-05", -900), medicao("2026-09-04", -120), medicao("2026-09-06", -50)], DIAS, 0, 0.2);
    expect(pior).toMatchObject({ valor: -120, dia: "2026-09-04", fechamento: -80, pregoesMedidos: 1 });
    expect(piorMomentoMedido([medicao("2026-09-05", -900)], DIAS, 0, 0.2)).toBeNull();
  });

  it("sem medição, ou sem nenhum dia no negativo, nulo", () => {
    expect(piorMomentoMedido([], DIAS, 2.5, 0.2)).toBeNull();
    expect(piorMomentoMedido([medicao("2026-09-01", null)], DIAS, 2.5, 0.2)).toBeNull();
    expect(piorMomentoMedido([medicao("2026-09-01", 0)], DIAS, 0, 0.2)).toBeNull();
  });
});

describe("resultadoPorOperacao", () => {
  it("resultado já com o custo, dividido pelas operações, e o custo médio descontado", () => {
    const r = resultadoPorOperacao([linha("2026-09-01", 100, 10, 40), linha("2026-09-02", -20, 15, 60)]);
    expect(r).not.toBeNull();
    expect(r!.operacoes).toBe(100);
    expect(r!.resultado).toBeCloseTo((80 - 25) / 100);
    expect(r!.custo).toBeCloseTo(0.25);
  });

  it("sem operação, nulo", () => {
    expect(resultadoPorOperacao([])).toBeNull();
    expect(resultadoPorOperacao([linha("2026-09-01", 0, 0, 0)])).toBeNull();
  });
});

describe("riscoDoRobo", () => {
  it("lê o histórico inteiro: maior queda, as outras, os dias ruins e o ganho contra a queda", () => {
    const r = riscoDoRobo(DIAS);
    expect(r.pregoes).toBe(6);
    expect(r.primeiroDia).toBe("2026-09-01");
    expect(r.ultimoDia).toBe("2026-09-08");
    expect(r.resultado).toBe(60);
    expect(r.maiorQueda).toBe(100);
    // a mesma maior queda que a conta do capital usa (drawdownMaximo em consultas/capital.ts)
    expect(r.maiorQueda).toBe(drawdownMaximo(curva).valor);
    expect(r.maior).toMatchObject({ inicio: "2026-09-03", fundo: "2026-09-07", recuperacao: null });
    expect(r.outras).toHaveLength(1);
    expect(r.outras[0].valor).toBe(30);
    expect(r.diasAbaixoDoTopo).toBe(4);
    expect(r.atual).toEqual({ valor: 50, desde: "2026-09-03" });
    expect(r.piorDia).toEqual({ dia: "2026-09-04", valor: -80 });
    expect(r.meses).toMatchObject({ meses: 1, comGanho: 1 });
    expect(r.meses.pior).toMatchObject({ mes: "2026-09", valor: 60 });
    expect(r.sequencia).toMatchObject({ dias: 2, soma: -100 });
    expect(r.ganhoPorQueda).toBe(0.6);
    // seis pregões não sustentam "1 em cada 20"
    expect(r.diaRuim).toBeNull();
  });

  it("o dia ruim típico aparece com pregões suficientes", () => {
    const dias = Array.from({ length: 40 }, (_, i) => d(`2026-01-${String(i + 1).padStart(2, "0")}`, i < 2 ? -500 + i * 100 : 50));
    expect(riscoDoRobo(dias).diaRuim).toBe(-400);
  });

  it("histórico vazio e histórico que nunca recuou", () => {
    const vazio = riscoDoRobo([]);
    expect(vazio).toMatchObject({ pregoes: 0, primeiroDia: null, ultimoDia: null, resultado: 0, maiorQueda: 0, maior: null, piorDia: null, sequencia: null, ganhoPorQueda: null });
    expect(vazio.atual).toEqual({ valor: 0, desde: null });

    const soSobe = riscoDoRobo([d("2026-09-01", 10), d("2026-09-02", 20)]);
    expect(soSobe).toMatchObject({ maiorQueda: 0, maior: null, outras: [], diasAbaixoDoTopo: 0, piorDia: null, ganhoPorQueda: null });
  });

  it("com resultado negativo não há ganho para cada R$ 1 da maior queda", () => {
    const r = riscoDoRobo([d("2026-09-01", 50), d("2026-09-02", -200), d("2026-09-03", 30)]);
    expect(r.resultado).toBe(-120);
    expect(r.maiorQueda).toBe(200);
    expect(r.ganhoPorQueda).toBeNull();
    expect(r.atual).toEqual({ valor: 170, desde: "2026-09-01" });
  });
});

describe("contaDoCapital", () => {
  it("garantia mais folga fecha no capital mínimo publicado", () => {
    // 150 x 36 + 35.408,40 x 1,5 = 58.512,60 -> publicado 58.513
    const maiorQueda = 35408.4;
    const capitalMinimo = Math.round(capitalMinimoRecomendado(150, maiorQueda, 1.5, 36));
    const conta = contaDoCapital({ capitalMinimo, margem: 150, entradas: 36, maiorQueda }, 0.25);
    expect(conta).not.toBeNull();
    expect(conta!.garantia).toBe(5400);
    expect(conta!.total).toBe(58513);
    expect(conta!.garantia + conta!.folga).toBe(conta!.total);
    expect(conta!.quedaNoCapital).toBeCloseTo(maiorQueda / 58513);
    // para a maior queda ficar em um quarto da conta: 35.408,40 / 0,25, para cima
    expect(conta!.capitalNoLimite).toBe(141634);
  });

  it("sem medição de entradas a conta considera 1", () => {
    const conta = contaDoCapital({ capitalMinimo: 1650, margem: 150, entradas: 0, maiorQueda: 1000 }, 0.25);
    expect(conta).toMatchObject({ garantia: 150, folga: 1500, total: 1650 });
  });

  it("quando o mínimo já deixa a queda abaixo do limite, não há outro capital para mostrar", () => {
    // garantia grande e queda pequena: 150 x 40 + 1.000 x 1,5 = 7.500; a queda é 13% disso
    const conta = contaDoCapital({ capitalMinimo: 7500, margem: 150, entradas: 40, maiorQueda: 1000 }, 0.25);
    expect(conta!.quedaNoCapital).toBeCloseTo(1000 / 7500);
    expect(conta!.capitalNoLimite).toBeNull();
  });

  it("sem margem cadastrada não há conta; sem queda não há percentual", () => {
    expect(contaDoCapital({ capitalMinimo: null, margem: null, entradas: 3, maiorQueda: 1000 }, 0.25)).toBeNull();
    const semQueda = contaDoCapital({ capitalMinimo: 450, margem: 150, entradas: 3, maiorQueda: 0 }, 0.25);
    expect(semQueda).toMatchObject({ garantia: 450, folga: 0, total: 450, quedaNoCapital: null, capitalNoLimite: null });
  });
});

describe("capitalParaAQuedaCaber", () => {
  it("maior queda dividida pelo limite, para cima", () => {
    expect(capitalParaAQuedaCaber(7903, 0.25)).toBe(31612);
    expect(capitalParaAQuedaCaber(1000.1, 0.25)).toBe(4001);
  });

  it("sem queda ou com limite inválido, nulo", () => {
    expect(capitalParaAQuedaCaber(0, 0.25)).toBeNull();
    expect(capitalParaAQuedaCaber(1000, 0)).toBeNull();
    expect(capitalParaAQuedaCaber(1000, 1.5)).toBeNull();
  });
});

describe("resumoDiario", () => {
  it("dias com perda, sequência e recuperação", () => {
    const r = resumoDiario(curva, episodiosDrawdown(curva, Infinity));
    expect(r.nDias).toBe(6);
    expect(r.diasNegativos).toBe(3);
    expect(r.maiorSequenciaNegativa).toBe(2);
    expect(r.recuperacaoMediaDias).toBe(2);
    expect(r.episodiosRecuperados).toBe(1);
    expect(r.volatilidade).toBeGreaterThan(0);
  });
});

