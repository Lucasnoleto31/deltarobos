import { describe, expect, it } from "vitest";
import { formatarBRL } from "@/lib/formato";
import type { BaldeCompacto } from "@/lib/tipos";
import {
  FRASE_LEGAL_PADRAO,
  PONTOS_CARD,
  caminhosDaCurva,
  comoOperou,
  dataPorExtenso,
  enderecoCurto,
  fimDoDia,
  fraseLegalCurta,
  montarCardDoDia,
  resumirMes,
  rotulosDoCard,
  tamanhoParaCaber,
  tempoDeHistorico,
  tomDoValor,
  type CurvaDoCard,
  type EntradaCardDoDia,
  type OperacaoDoCard,
  type RoboDoCard,
} from "./card-do-dia";
import type { ExposicaoHoje } from "./exposicao";
import { excursao } from "./operacoes";
import { epochBrasilia } from "./saldo-dia";
import type { LinhaDiaria } from "./tipos";

// Tudo com datas fixas (23/09/2026, quarta-feira, e 24/09/2026): nada aqui olha o relógio.
const DIA = "2026-09-23";
const HOJE = "2026-09-24";
/** 24/09/2026 12:00 em Brasília: o dia 23 já acabou */
const DEPOIS = new Date("2026-09-24T15:00:00Z");

const ROBO: RoboDoCard = {
  slug: "robo-teste",
  nome: "Robô Teste",
  ativo: "WIN",
  ativo_nome: "Mini Índice",
  conta_tipo: "real",
  valor_ponto_brl: 0.2,
  custo_por_contrato: 0.25,
  horario_inicio: "09:05",
  horario_fim: "17:30",
  posicionado: false,
};
const PREGAO = { inicio: "09:00", fim: "18:00" };

/** uma operação fechada às `hhmm` (Brasília) do dia, com o resultado bruto e o custo por contrato */
function op(hhmm: string, bruto: number, { dia = DIA, custos = 0.25, origem = "mt5" as OperacaoDoCard["origem"] } = {}): OperacaoDoCard {
  return {
    fechamento_em: new Date(epochBrasilia(dia, hhmm) * 1000).toISOString(),
    resultado_brl_por_contrato: bruto,
    custos_brl_por_contrato: custos,
    pontos_por_contrato: bruto / 0.2,
    origem,
  };
}

/** baldes a cada 5 s de `de` a `ate` (Brasília), com o último oscilando e a faixa de ±5 em volta */
function serie(de: string, ate: string, dia = DIA): BaldeCompacto[] {
  const lista: BaldeCompacto[] = [];
  const fim = epochBrasilia(dia, ate);
  for (let t = epochBrasilia(dia, de), k = 0; t <= fim; t += 5, k++) {
    const ultimo = Math.round(100 * Math.sin(k / 500) * 100) / 100;
    lista.push([t, ultimo - 5, ultimo + 5, ultimo]);
  }
  return lista;
}

const OPS = [op("09:30", 50), op("11:00", -20), op("14:00", 80), op("17:00", 30)];

function entrada(parcial: Partial<EntradaCardDoDia> = {}): EntradaCardDoDia {
  return {
    robo: ROBO,
    dia: DIA,
    agora: DEPOIS,
    pregao: PREGAO,
    operacoes: OPS,
    saldo: { baldes: [], aproximado: false },
    exposicao: null,
    disclaimer: "Resultados passados não garantem resultados futuros. Operações em mercado futuro envolvem risco.",
    site: "https://www.quantsrobos.com/",
    ...parcial,
  };
}

/** o card, sem o null (os casos com operação sempre montam) */
function montar(parcial: Partial<EntradaCardDoDia> = {}) {
  const dados = montarCardDoDia(entrada(parcial));
  if (!dados) throw new Error("card vazio");
  return dados;
}

const semNbsp = (s: string) => s.replace(/\u00a0/g, " ");
const dentroDe01 = (v: number) => v >= 0 && v <= 1;

describe("montarCardDoDia: a curva pela série do EA", () => {
  it("usa a série, corta ao pregão e reduz a no máximo 300 pontos, tudo em 0..1", () => {
    const d = montar({ saldo: { baldes: serie("09:05", "23:59"), aproximado: false } });
    const c = d.curva;
    expect(c.fonte).toBe("serie");
    expect(c.linha.length).toBeGreaterThan(0);
    expect(c.linha.length).toBeLessThanOrEqual(PONTOS_CARD);
    for (const p of c.linha) {
      expect(dentroDe01(p.x)).toBe(true);
      expect(dentroDe01(p.y)).toBe(true);
    }
    expect(c.faixa).not.toBeNull();
    for (const f of c.faixa ?? []) {
      expect(dentroDe01(f.yAlto) && dentroDe01(f.yBaixo)).toBe(true);
      // y cresce para baixo: o máximo fica acima do mínimo
      expect(f.yAlto).toBeLessThanOrEqual(f.yBaixo);
    }
    // 25/11/2026 (ficha Mesa): "MetaTrader 5" por extenso e sem o " · líquido" do fim (a premissa está no rodapé)
    expect(c.legenda).toBe("O dia, medido no MetaTrader 5 · a cada 5 s");
    // o coletor mandou até 23:59, mas o eixo termina 10 min depois do fim do horário (17:30): nada depois das 18:00
    expect(c.rotulosX.length).toBeGreaterThanOrEqual(3);
    expect(c.rotulosX.length).toBeLessThanOrEqual(5);
    for (const r of c.rotulosX) {
      expect(r.texto).toMatch(/^\d{2}:\d{2}$/);
      expect(r.texto <= "18:00").toBe(true);
      expect(dentroDe01(r.x)).toBe(true);
    }
    // o último dado é o último balde que ficou no pregão (17:40), depois da última saída (17:00)
    expect(d.valores.ultimoDadoT).toBe(epochBrasilia(DIA, "17:40"));
  });

  it("série que começa depois da primeira saída: legenda com 'desde HH:MM' e a linha nasce no meio do eixo", () => {
    const d = montar({ saldo: { baldes: serie("11:42", "17:30"), aproximado: false } });
    expect(d.curva.fonte).toBe("serie");
    expect(d.curva.legenda).toContain("desde 11:42");
    expect(d.curva.legenda).not.toContain("líquido");
    expect(d.curva.linha[0].x).toBeGreaterThan(0);
  });

  it("série aproximada: sem faixa e a legenda diz", () => {
    const d = montar({ saldo: { baldes: serie("09:05", "17:30"), aproximado: true } });
    expect(d.curva.fonte).toBe("serie");
    expect(d.curva.faixa).toBeNull();
    expect(d.curva.legenda).toContain("aproximado");
    expect(d.curva.legenda.startsWith("O dia, medido no MetaTrader 5 · a cada 5 s")).toBe(true);
  });
});

describe("montarCardDoDia: a curva por fechamento", () => {
  it("sem série: nasce no zero e dá um ponto por operação, com as horas no eixo", () => {
    const d = montar();
    const c = d.curva;
    expect(c.fonte).toBe("fechamento");
    // até 25/11/2026 terminava em " · por fechamento"
    expect(c.legenda).toBe("O dia, operação a operação");
    expect(c.linha[0]).toEqual({ x: 0, y: c.yZero });
    expect(c.linha.length).toBe(OPS.length + 1);
    expect(c.linha[c.linha.length - 1].x).toBe(1);
    expect(c.faixa).toBeNull();
    expect(c.rotulosX.length).toBeGreaterThan(0);
    for (const r of c.rotulosX) expect(r.texto).toMatch(/^\d{2}:\d{2}$/);
    // cada rótulo em cima do ponto da operação que ele nomeia: a j-ésima em x = j/n, a última em x = 1
    expect(c.rotulosX).toEqual([
      { x: 0.25, texto: "09:30" },
      { x: 0.5, texto: "11:00" },
      { x: 0.75, texto: "14:00" },
      { x: 1, texto: "17:00" },
    ]);
    // o último dado é a última saída
    expect(d.valores.ultimoDadoT).toBe(epochBrasilia(DIA, "17:00"));
  });

  it("importação manual, tudo no mesmo instante: eixo pela ordem ('1ª'...) e a série é ignorada", () => {
    const manuais = Array.from({ length: 31 }, (_, i) => op("00:00", i % 3 === 0 ? -10 : 20, { origem: "manual", custos: 0 }));
    const d = montar({ operacoes: manuais, saldo: { baldes: serie("09:05", "17:30"), aproximado: false } });
    expect(d.curva.fonte).toBe("fechamento");
    expect(d.curva.legenda).toContain("sem horário");
    expect(d.curva.rotulosX.length).toBe(5);
    for (const r of d.curva.rotulosX) expect(r.texto.endsWith("ª")).toBe(true);
    // 31 operações em 5 marcas: round((k + 1) × 31 / 5), cada uma no x do próprio ponto, a última na borda
    expect(d.curva.rotulosX.map((r) => r.texto)).toEqual(["6ª", "12ª", "19ª", "25ª", "31ª"]);
    expect(d.curva.rotulosX.map((r) => r.x)).toEqual([6 / 31, 12 / 31, 19 / 31, 25 / 31, 1]);
  });

  it("poucas operações: um rótulo por operação, em cima do ponto dela (nenhum sob a origem)", () => {
    const tres = [op("00:00", 20, { origem: "manual", custos: 0 }), op("00:00", -10, { origem: "manual", custos: 0 }), op("00:00", 60, { origem: "manual", custos: 0 })];
    const d = montar({ operacoes: tres });
    expect(d.curva.rotulosX).toEqual([
      { x: 1 / 3, texto: "1ª" },
      { x: 2 / 3, texto: "2ª" },
      { x: 1, texto: "3ª" },
    ]);
    // os pontos das operações estão nos mesmos x dos rótulos
    expect(d.curva.linha.slice(1).map((p) => p.x)).toEqual([1 / 3, 2 / 3, 1]);
  });

  it("ordena as operações pelo fechamento, sem mudar os totais", () => {
    const d = montar({ operacoes: [...OPS].reverse() });
    expect(d.curva.rotulosX[0].texto).toBe("09:30");
    expect(d.valores.resultado).toBeCloseTo(50 + -20 + 80 + 30 - 4 * 0.25, 9);
  });
});

describe("montarCardDoDia: números e textos", () => {
  it("totais líquidos, pontos, operações com ganho e os textos do cabeçalho e do rodapé", () => {
    const d = montar();
    // 50 − 20 + 80 + 30 brutos, menos 4 × 0,25
    expect(d.valores.resultado).toBeCloseTo(139, 9);
    expect(d.resultado).toBe(formatarBRL(139, { sinal: true }));
    expect(d.tomResultado).toBe("positivo");
    expect(d.pontos).toBe("+700 pts");
    expect(d.valores.nOperacoes).toBe(4);
    expect(d.valores.nGains).toBe(3);
    // "4 operações, 3 com ganho" em duas células (25/11/2026; a segunda dizia "75% · acerto · 3 gains")
    expect(d.numeros[0]).toEqual({ rotulo: "Operações", valor: "4", tom: null });
    expect(d.numeros[1]).toEqual({ rotulo: "Com ganho", valor: "3", tom: null });
    expect(d.numeros.map((n) => n.rotulo)).toEqual(["Operações", "Com ganho", "Melhor momento", "Pior momento"]);
    expect(d.nome).toBe("Robô Teste");
    // só o nome do ativo, como no cabeçalho do robô (era "Mini Índice · WIN")
    expect(d.ativo).toBe("Mini Índice");
    expect(d.data).toBe("quarta-feira, 23 de setembro de 2026");
    // a premissa uma vez na imagem: "com 1 contrato por entrada" junto do número e "Já descontados os custos" no
    // rodapé (25/11/2026; eram "Resultado do dia, por contrato" e "Por 1 contrato, líquido de custos · ...")
    expect(d.rodape).toBe("Já descontados os custos · quantsrobos.com/robos/robo-teste");
    expect(d.legal).toBe("Resultados passados não garantem resultados futuros.");
    expect(d.parcial).toBeNull();
    expect(d.rotuloResultado).toBe("Resultado do dia, com 1 contrato por entrada");
  });

  it("nenhum texto da imagem usa o jargão antigo (ficha Mesa, 25/11/2026)", () => {
    const jargao = /\bMEP\b|\bMEN\b|MFE|MAE|\bMT5\b|gains?\b|loss|acerto|drawdown|payoff|líquido|por contrato|tick|coletor|por fechamento/i;
    const exposicao: ExposicaoHoje = { mep_ea: 1311, mep_ea_n_saidas: 56, men_ea: -200, men_ea_n_saidas: 3, excursao_ea_parcial: true };
    const variantes = [
      montar(),
      montar({ exposicao }),
      montar({ exposicao: { ...exposicao, excursao_ea_parcial: false } }),
      montar({ saldo: { baldes: serie("11:42", "17:30"), aproximado: true } }),
      montar({ operacoes: [op("00:00", 20, { origem: "manual" }), op("00:00", -10, { origem: "manual" })] }),
      montar({ dia: HOJE, operacoes: [op("10:00", 30, { dia: HOJE })], agora: new Date("2026-09-24T17:32:00Z") }),
    ];
    for (const d of variantes) {
      const textos = [d.ativo, d.parcial ?? "", d.rotuloResultado, d.notaMepMen, d.curva.legenda, d.rodape, ...d.numeros.map((n) => n.rotulo)];
      for (const t of textos) expect(t).not.toMatch(jargao);
    }
  });

  it("os textos cabem numa linha da imagem: rótulos na célula do quadrado; notas, legenda e rodapé na largura do story", () => {
    const exposicao: ExposicaoHoje = { mep_ea: 1311, mep_ea_n_saidas: 56, men_ea: -200, men_ea_n_saidas: 3, excursao_ea_parcial: true };
    // o pior caso de texto: medição parcial, série aproximada que começou tarde e o slug mais comprido do site
    const pior = montar({
      robo: { ...ROBO, slug: "alaska-square" },
      exposicao,
      saldo: { baldes: serie("11:42", "17:30"), aproximado: true },
    });
    // célula de 222 px com rótulo de 22 px: tamanhoParaCaber não precisa encolher nenhum dos quatro
    for (const n of pior.numeros) expect(tamanhoParaCaber(n.rotulo, 222, 22, 18)).toBe(22);
    // A linha útil tem 936 px e o story escreve maior que o quadrado: nota e legenda a 24 px, rodapé a 26 px e o
    // rótulo do resultado a 30 px. Pela medida larga de tamanhoParaCaber (0,56 em por caractere; a Geist mede
    // uns 0,47), o texto cabe quando não precisaria encolher.
    const cabe = (t: string, px: number) => tamanhoParaCaber(t, 936, px, 1) === px;
    expect(pior.curva.legenda).toBe("O dia, medido no MetaTrader 5 · a cada 5 s · aproximado · desde 11:42");
    expect(cabe(pior.curva.legenda, 24)).toBe(true);
    expect(cabe(pior.notaMepMen, 24)).toBe(true);
    expect(cabe(montar().notaMepMen, 24)).toBe(true);
    expect(cabe(pior.rodape, 26)).toBe(true);
    expect(cabe(pior.rotuloResultado, 30)).toBe(true);
    // o rótulo parcial é o mais comprido dos dois ("Resultado parcial, com 1 contrato por entrada")
    const parcial = montar({ dia: HOJE, operacoes: [op("10:00", 30, { dia: HOJE })], agora: new Date("2026-09-24T17:32:00Z") });
    expect(cabe(parcial.rotuloResultado, 30)).toBe(true);
    // a frase inteira no rodapé não caberia: é por isso que o "com 1 contrato por entrada" fica só no rótulo do resultado
    expect(cabe(`Com 1 contrato por entrada, já descontados os custos · quantsrobos.com/robos/alaska-square`, 26)).toBe(false);
  });

  it("uma operação só: 'Operação' no singular e '1' com ganho; sem ativo_nome, só o código do ativo", () => {
    const d = montar({ operacoes: [op("10:00", 40)], robo: { ...ROBO, ativo_nome: "" } });
    expect(d.numeros[0]).toEqual({ rotulo: "Operação", valor: "1", tom: null });
    expect(d.numeros[1]).toEqual({ rotulo: "Com ganho", valor: "1", tom: null });
    expect(d.ativo).toBe("WIN");
  });

  it("dia negativo: resultado vermelho com '-R$' e a bolinha do fim negativa", () => {
    const d = montar({ operacoes: [op("09:30", 30), op("10:00", -50), op("11:00", -40)] });
    expect(d.tomResultado).toBe("negativo");
    expect(d.resultado.startsWith("-R$")).toBe(true);
    expect(d.curva.tomFinal).toBe("negativo");
  });

  it("conta demo só quando conta_tipo é 'demo'", () => {
    expect(montar({ robo: { ...ROBO, conta_tipo: "demo" } }).contaDemo).toBe(true);
    expect(montar({ robo: { ...ROBO, conta_tipo: "real" } }).contaDemo).toBe(false);
    expect(montar({ robo: { ...ROBO, conta_tipo: null } }).contaDemo).toBe(false);
  });

  it("sem operação: null", () => {
    expect(montarCardDoDia(entrada({ operacoes: [] }))).toBeNull();
  });
});

describe("montarCardDoDia: parcial", () => {
  const opsDeHoje = [op("10:00", 30, { dia: HOJE }), op("14:30", 20, { dia: HOJE })];

  it("hoje, antes do fim do pregão: selo com a hora do último dado e rótulo parcial", () => {
    const d = montar({ dia: HOJE, operacoes: opsDeHoje, agora: new Date("2026-09-24T17:32:00Z") });
    expect(d.parcial).toBe("Parcial · até 14:30");
    expect(d.rotuloResultado).toBe("Resultado parcial, com 1 contrato por entrada");
  });

  it("com série, a hora é a do último balde quando ele vem depois da última saída", () => {
    const d = montar({
      dia: HOJE,
      operacoes: opsDeHoje,
      agora: new Date("2026-09-24T17:32:00Z"),
      saldo: { baldes: serie("09:05", "14:31", HOJE), aproximado: false },
    });
    expect(d.parcial).toBe("Parcial · até 14:31");
  });

  it("vale o mais tarde entre o fim do robô e o do pregão: às 17:45 ainda é parcial (robô até 17:30, pregão até 18:00)", () => {
    const d = montar({ dia: HOJE, operacoes: opsDeHoje, agora: new Date("2026-09-24T20:45:00Z") });
    expect(d.parcial).not.toBeNull();
  });

  it("depois do fim (18:05) e em dia passado: definitivo, sem selo", () => {
    expect(montar({ dia: HOJE, operacoes: opsDeHoje, agora: new Date("2026-09-24T21:05:00Z") }).parcial).toBeNull();
    expect(montar({ agora: new Date("2026-09-24T17:32:00Z") }).parcial).toBeNull();
  });

  it("depois do fim com o robô ainda posicionado (a zeragem não virou operação): continua parcial", () => {
    const posicionado = { ...ROBO, posicionado: true };
    const d = montar({ robo: posicionado, dia: HOJE, operacoes: opsDeHoje, agora: new Date("2026-09-24T21:00:00.100Z") });
    expect(d.parcial).toBe("Parcial · até 14:30");
    expect(d.rotuloResultado).toBe("Resultado parcial, com 1 contrato por entrada");
    // em dia passado, posicionado não muda nada: o dia já fechou
    expect(montar({ robo: posicionado, agora: DEPOIS }).parcial).toBeNull();
  });

  it("parcial entre o fim do horário do robô + 10 min e o fim do pregão: a curva e o selo acompanham o dado", () => {
    // Apollo às 17:55 de hoje: horário até 17:30, última saída às 17:35 e posição aberta até a zeragem; a série
    // chega até 17:55 e o saldo muda depois de 17:45 (o flutuante da posição aberta)
    const ops = [op("10:00", 30, { dia: HOJE }), op("17:35", 20, { dia: HOJE })];
    const baldes: BaldeCompacto[] = [];
    const ultimo = epochBrasilia(HOJE, "17:55");
    const virada = epochBrasilia(HOJE, "17:45");
    for (let t = epochBrasilia(HOJE, "09:05"); t <= ultimo; t += 5) {
      const v = t <= virada ? 100 : 500;
      baldes.push([t, v - 5, v + 5, v]);
    }
    const saldo = { baldes, aproximado: false };
    const d = montar({ dia: HOJE, operacoes: ops, saldo, agora: new Date("2026-09-24T20:55:00Z") });
    expect(d.parcial).toBe("Parcial · até 17:55");
    expect(d.valores.ultimoDadoT).toBe(ultimo);
    // o eixo vai até o último balde: o x final é o das 17:55 na janela 09:05–17:55:05
    const inicio = epochBrasilia(HOJE, "09:05");
    expect(d.curva.linha[d.curva.linha.length - 1].x).toBeCloseTo((ultimo - inicio) / (ultimo + 5 - inicio), 6);
    // e o último ponto é o saldo depois da virada (mais alto que o começo do dia: y menor)
    expect(d.curva.linha[d.curva.linha.length - 1].y).toBeLessThan(d.curva.linha[0].y);

    // a mesma série vista no dia seguinte (definitiva): o corte do site, até a última saída + 10 min
    const definitiva = montar({ dia: HOJE, operacoes: ops, saldo, agora: new Date("2026-09-25T15:00:00Z") });
    expect(definitiva.parcial).toBeNull();
    expect(definitiva.valores.ultimoDadoT).toBe(epochBrasilia(HOJE, "17:45"));
  });

  it("fimDoDia: o mais tarde entre o fim do robô e o do pregão, em HH:MM", () => {
    expect(fimDoDia({ inicio: "09:05", fim: "17:30:00" }, { inicio: "09:00", fim: "18:00:00" })).toBe("18:00");
    expect(fimDoDia({ inicio: "09:05", fim: "18:20" }, { inicio: "09:00", fim: "18:00" })).toBe("18:20");
  });
});

describe("montarCardDoDia: MEP e MEN", () => {
  it("medidos pelo EA: líquidos como o Hoje ao vivo (1.311 − 56 × 0,25) e a nota diz a fonte", () => {
    const exposicao: ExposicaoHoje = {
      mep_ea: 1311,
      mep_ea_n_saidas: 56,
      men_ea: 0,
      men_ea_n_saidas: 0,
      excursao_ea_parcial: true,
    };
    const d = montar({ exposicao });
    expect(d.fonteMepMen).toBe("mt5");
    expect(d.valores.mep).toBe(1297);
    expect(d.numeros[2]).toEqual({ rotulo: "Melhor momento", valor: formatarBRL(1297, { sinal: true, inteiro: true }), tom: "positivo" });
    expect(d.numeros[3].rotulo).toBe("Pior momento");
    expect(semNbsp(d.numeros[3].valor)).toBe("R$ 0,00");
    expect(d.numeros[3].tom).toBe("neutro");
    // medição parcial (o EA subiu com o dia em andamento): a nota diz, sem a palavra "coletor" (25/11/2026)
    expect(d.notaMepMen).toBe("Melhor e pior momento medidos no MetaTrader 5, só em parte do dia");
    expect(montar({ exposicao: { ...exposicao, excursao_ea_parcial: false } }).notaMepMen).toBe("Melhor e pior momento medidos no MetaTrader 5");
  });

  it("sem medição (exposição nula ou sem números): por fechamento, iguais a excursao dos líquidos", () => {
    const liquidos = OPS.map((o) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato);
    const e = excursao(liquidos);
    const vazia: ExposicaoHoje = { mep_ea: null, men_ea: null, mep_ea_n_saidas: null, men_ea_n_saidas: null, excursao_ea_parcial: null };
    for (const exposicao of [null, vazia]) {
      const d = montar({ exposicao });
      expect(d.fonteMepMen).toBe("fechamento");
      expect(d.notaMepMen).toBe("Melhor e pior momento pelas operações fechadas");
      expect(d.valores.mep).toBe(e.mep);
      expect(d.valores.men).toBe(e.men);
    }
  });
});

describe("textos auxiliares", () => {
  it("fraseLegalCurta: a frase de 'passado não garante futuro' do aviso, ou a padrão", () => {
    const doBanco =
      "A Quants Robôs não é uma instituição financeira. As informações apresentadas têm caráter informativo e não constituem recomendação de investimento. Rentabilidade passada não garante rentabilidade futura. Operações em mercado futuro envolvem risco de perda superior ao capital investido.";
    expect(fraseLegalCurta(doBanco)).toBe("Rentabilidade passada não garante rentabilidade futura.");
    expect(fraseLegalCurta("Resultados passados não garantem resultados futuros. Operações em mercado futuro envolvem risco de perda superior ao capital investido.")).toBe(
      "Resultados passados não garantem resultados futuros.",
    );
    expect(fraseLegalCurta("Operações em mercado futuro envolvem risco.")).toBe(FRASE_LEGAL_PADRAO);
    expect(fraseLegalCurta("")).toBe(FRASE_LEGAL_PADRAO);
    // tem as palavras, mas não cabe numa linha da imagem
    const longa = `Resultados passados não garantem resultados futuros, ${"e isto é uma frase muito comprida ".repeat(3)}até o fim.`;
    expect(fraseLegalCurta(longa)).toBe(FRASE_LEGAL_PADRAO);
  });

  it("enderecoCurto tira protocolo, www. e barra final", () => {
    expect(enderecoCurto("https://www.quantsrobos.com/")).toBe("quantsrobos.com");
    expect(enderecoCurto("http://localhost:3000")).toBe("localhost:3000");
    expect(enderecoCurto("https://deltarobos-mu.vercel.app")).toBe("deltarobos-mu.vercel.app");
  });

  it("dataPorExtenso", () => {
    expect(dataPorExtenso("2026-09-23")).toBe("quarta-feira, 23 de setembro de 2026");
    expect(dataPorExtenso("2026-09-27")).toBe("domingo, 27 de setembro de 2026");
  });

  it("tomDoValor: neutro abaixo de meio centavo", () => {
    expect(tomDoValor(0)).toBe("neutro");
    expect(tomDoValor(-0.004)).toBe("neutro");
    expect(tomDoValor(0.01)).toBe("positivo");
    expect(tomDoValor(-0.01)).toBe("negativo");
  });

  it("tamanhoParaCaber respeita o mínimo e o máximo", () => {
    expect(tamanhoParaCaber("Apollo", 620, 60, 40)).toBe(60);
    expect(tamanhoParaCaber("Um nome de robô muito, muito comprido demais", 620, 60, 40)).toBe(40);
    expect(tamanhoParaCaber("", 620, 60, 40)).toBe(60);
    // no meio: floor(640 / (13 × 0,56)) = 87
    expect(tamanhoParaCaber("-R$ 12.345,67", 640, 112, 64)).toBe(87);
  });

  it("rotulosDoCard: 10 rótulos viram 5 (0, 2, 4, 6, 8) e x vai de 0..100 para 0..1", () => {
    const dez = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, rotulo: `${String(9 + i).padStart(2, "0")}:00` }));
    const cinco = rotulosDoCard(dez);
    expect(cinco.map((r) => r.texto)).toEqual(["09:00", "11:00", "13:00", "15:00", "17:00"]);
    expect(cinco.map((r) => r.x)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
    expect(rotulosDoCard(dez.slice(0, 4))).toHaveLength(4);
    expect(rotulosDoCard([])).toEqual([]);
  });
});

describe("caminhosDaCurva", () => {
  const caixa = { largura: 936, altura: 280 };
  /** todos os pares x,y de um caminho "M1.0,2.0L3.0,4.0Z" */
  const pares = (d: string) => [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);

  it("linha, área e faixa dentro da caixa, zero dentro da margem", () => {
    const d = montar({ saldo: { baldes: serie("09:05", "17:30"), aproximado: false } });
    const c = caminhosDaCurva(d.curva, caixa);
    expect(c.linha.startsWith("M")).toBe(true);
    expect(c.area.startsWith("M") && c.area.endsWith("Z")).toBe(true);
    expect(c.faixa).not.toBeNull();
    expect(c.faixa?.endsWith("Z")).toBe(true);
    for (const caminho of [c.linha, c.area, c.faixa ?? ""]) {
      const lista = pares(caminho);
      expect(lista.length).toBeGreaterThan(0);
      for (const [x, y] of lista) {
        expect(x >= 0 && x <= caixa.largura).toBe(true);
        expect(y >= 0 && y <= caixa.altura).toBe(true);
      }
    }
    expect(c.yZero).toBeGreaterThanOrEqual(12);
    expect(c.yZero).toBeLessThanOrEqual(caixa.altura - 12);
    const [ultimoX, ultimoY] = pares(c.linha).at(-1) ?? [];
    expect(c.ultimo.x).toBeCloseTo(ultimoX, 1);
    expect(c.ultimo.y).toBeCloseTo(ultimoY, 1);
    for (const r of c.rotulosX) expect(r.x >= 12 && r.x <= caixa.largura - 12).toBe(true);
  });

  it("sem faixa na curva, sem faixa no caminho; a área fecha no zero", () => {
    const curva: CurvaDoCard = {
      fonte: "fechamento",
      legenda: "",
      linha: [
        { x: 0, y: 0.5 },
        { x: 0.5, y: 0.1 },
        { x: 1, y: 0.9 },
      ],
      faixa: null,
      yZero: 0.5,
      rotulosX: [{ x: 0.5, texto: "12:00" }],
      tomFinal: "negativo",
    };
    const c = caminhosDaCurva(curva, { largura: 100, altura: 100, margem: 10 });
    expect(c.faixa).toBeNull();
    expect(c.linha).toBe("M10.0,50.0L50.0,18.0L90.0,82.0");
    expect(c.area).toBe("M10.0,50.0L10.0,50.0L50.0,18.0L90.0,82.0L90.0,50.0Z");
    expect(c.yZero).toBe(50);
    expect(c.ultimo).toEqual({ x: 90, y: 82 });
    expect(c.rotulosX).toEqual([{ x: 50, texto: "12:00" }]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// O resto do que sai do site: a prévia do robô, o widget e o relatório do mês (25/11/2026)
// ---------------------------------------------------------------------------------------------------------

/**
 * Um pregão da série diária. `ganhos` e `perdas` são o resultado de cada operação já com o custo descontado
 * (perdas negativas); `zeradas` são operações que fecharam em zero. O custo é de R$ 0,25 por operação.
 */
function pregao(dia: string, ganhos: number[], perdas: number[], zeradas = 0): LinhaDiaria {
  const soma = (v: number[]) => v.reduce((s, x) => s + x, 0);
  const n = ganhos.length + perdas.length + zeradas;
  const custos = n * 0.25;
  return {
    dia,
    pontos_por_contrato: 0,
    resultado_brl_por_contrato: soma(ganhos) + soma(perdas) + custos,
    custos_brl_por_contrato: custos,
    n_operacoes: n,
    n_gain: ganhos.length,
    n_loss: perdas.length,
    soma_gain_brl_por_contrato: soma(ganhos),
    soma_loss_brl_por_contrato: soma(perdas),
    maior_gain_brl_por_contrato: ganhos.length > 0 ? Math.max(...ganhos) : 0,
    maior_loss_brl_por_contrato: perdas.length > 0 ? Math.min(...perdas) : 0,
  };
}

describe("comoOperou", () => {
  it("acertos com o necessário para empatar, o tamanho do ganho e da perda e o fator de lucro em R$", () => {
    // ganho de R$ 24 e perda de R$ 105: acerta 9 de cada 10 e precisa de 81 de cada 100 só para empatar
    const o = comoOperou([pregao("2026-10-01", [24, 24, 24, 24], [-105]), pregao("2026-10-02", [24, 24, 24, 24, 24], [])]);
    expect(o.operacoes).toBe(10);
    expect(o.comGanho).toBe(9);
    expect(o.comPerda).toBe(1);
    expect(o.acertos).toBeCloseTo(0.9, 9);
    expect(o.ganhoTipico).toBeCloseTo(24, 9);
    expect(o.perdaTipica).toBeCloseTo(105, 9);
    expect(o.paraEmpatar).toBeCloseTo(105 / 129, 9);
    expect(Math.round((o.paraEmpatar ?? 0) * 100)).toBe(81);
    expect(o.maiorPerda).toBe(-105);
    // R$ 216 de ganho para R$ 105 de perda: R$ 2,06 para cada R$ 1 perdido
    expect(o.fatorLucro).toBeCloseTo(216 / 105, 9);
    // (216 − 105) ÷ 10 operações
    expect(o.porOperacao).toBeCloseTo(11.1, 9);
  });

  it("a maior perda é a da pior operação entre todos os pregões, e operação zerada entra só no total", () => {
    const o = comoOperou([pregao("2026-10-01", [10], [-40, -15]), pregao("2026-10-02", [10], [-70], 2)]);
    expect(o.maiorPerda).toBe(-70);
    expect(o.operacoes).toBe(7);
    expect(o.acertos).toBeCloseTo(2 / 7, 9);
    expect(o.perdaTipica).toBeCloseTo(125 / 3, 9);
  });

  it("sem operação com perda não há o que comparar: nada de 'para empatar' nem de fator de lucro", () => {
    const o = comoOperou([pregao("2026-10-01", [30, 20], [])]);
    expect(o.acertos).toBe(1);
    expect(o.paraEmpatar).toBeNull();
    expect(o.perdaTipica).toBeNull();
    expect(o.maiorPerda).toBeNull();
    expect(o.fatorLucro).toBeNull();
    expect(o.ganhoTipico).toBeCloseTo(25, 9);
  });

  it("sem operação com ganho também não; e sem pregão tudo vem vazio", () => {
    const soPerda = comoOperou([pregao("2026-10-01", [], [-30])]);
    expect(soPerda.acertos).toBe(0);
    expect(soPerda.paraEmpatar).toBeNull();
    expect(soPerda.ganhoTipico).toBeNull();
    expect(soPerda.fatorLucro).toBe(0);

    const vazio = comoOperou([]);
    expect(vazio.operacoes).toBe(0);
    expect(vazio.acertos).toBeNull();
    expect(vazio.porOperacao).toBeNull();
    expect(vazio.fatorLucro).toBeNull();
  });
});

describe("tempoDeHistorico", () => {
  const dias = (...lista: string[]) => lista.map((dia) => ({ dia }));

  it("do primeiro ao último pregão até hoje, em palavras; menos de 12 meses é curto", () => {
    const t = tempoDeHistorico(dias("2026-03-02", "2026-02-13", "2026-11-25", "2026-11-25", "2026-11-26"), "2026-11-25");
    // o dia 26 é depois de hoje e fica de fora; o dia repetido conta uma vez
    expect(t).toEqual({ de: "2026-02-13", ate: "2026-11-25", texto: "9 meses", curto: true, pregoes: 3 });
  });

  it("12 meses completos já não é curto; um dia a menos ainda é", () => {
    expect(tempoDeHistorico(dias("2025-11-25", "2026-11-25"), "2026-11-25")).toMatchObject({ texto: "1 ano", curto: false });
    expect(tempoDeHistorico(dias("2025-11-26", "2026-11-25"), "2026-11-25")).toMatchObject({ texto: "11 meses", curto: true });
    expect(tempoDeHistorico(dias("2018-01-15", "2026-11-25"), "2026-11-25")).toMatchObject({ texto: "8 anos e 10 meses", curto: false });
  });

  it("sem pregão até hoje: nulo", () => {
    expect(tempoDeHistorico([], "2026-11-25")).toBeNull();
    expect(tempoDeHistorico(dias("2026-11-26"), "2026-11-25")).toBeNull();
  });
});

describe("resumirMes", () => {
  // outubro de 2026 começa numa quinta-feira e tem 22 dias úteis
  const OUTUBRO = [
    pregao("2026-09-30", [999], []),
    pregao("2026-10-06", [400], []),
    pregao("2026-10-01", [100], []),
    pregao("2026-10-02", [], [-300]),
    pregao("2026-10-05", [50], []),
    pregao("2026-10-07", [], [-30]),
    pregao("2026-11-03", [], [-999]),
  ];
  const base = { mes: "2026-10", linhas: OUTUBRO, hoje: "2026-11-25", feriados: [] as string[], duracoesSeg: [] as number[] };

  it("o resultado do mês vem com a maior queda de dentro do mês, os dias com ganho e o pior dia", () => {
    const r = resumirMes(base);
    expect(r.emAndamento).toBe(false);
    expect(r.resultado).toBeCloseTo(220, 9);
    expect(r.pregoes).toBe(5);
    expect(r.ultimoDia).toBe("2026-10-07");
    // subiu a +100 no dia 1º, caiu a −200 no dia 2 e só passou de +100 de novo no dia 6
    expect(r.maiorQueda).toEqual({ valor: 300, inicio: "2026-10-01", fundo: "2026-10-02", recuperouEm: "2026-10-06" });
    expect(r.diasComGanho).toBe(3);
    expect(r.piorDia).toEqual({ dia: "2026-10-02", valor: -300 });
    // os dias em ordem, com o somado do mês; setembro e novembro ficam de fora
    expect(r.dias.map((d) => d.dia)).toEqual(["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(r.dias.map((d) => d.somado)).toEqual([100, -200, -150, 250, 220]);
    expect(r.dias[1]).toEqual({ dia: "2026-10-02", operacoes: 1, comGanho: 0, comPerda: 1, resultado: -300, somado: -200 });
    // como operou: 5 operações, 3 com ganho; ganho de R$ 183,33 e perda de R$ 165
    expect(r.operou.operacoes).toBe(5);
    expect(r.operou.acertos).toBeCloseTo(0.6, 9);
    expect(r.operou.paraEmpatar).toBeCloseTo(165 / (550 / 3 + 165), 9);
    expect(r.operou.porOperacao).toBeCloseTo(44, 9);
    expect(r.operacoesPorPregao).toBe(1);
  });

  it("pregões da bolsa no mês: dias úteis menos os feriados", () => {
    expect(resumirMes(base).pregoesDaBolsa).toBe(22);
    expect(resumirMes({ ...base, feriados: ["2026-10-12", "2026-11-02"] }).pregoesDaBolsa).toBe(21);
  });

  it("mês em andamento: conta só até hoje e a queda que não voltou fica sem data de recuperação", () => {
    const r = resumirMes({ ...base, hoje: "2026-10-05" });
    expect(r.emAndamento).toBe(true);
    expect(r.resultado).toBeCloseTo(-150, 9);
    expect(r.pregoes).toBe(3);
    expect(r.ultimoDia).toBe("2026-10-05");
    expect(r.maiorQueda).toEqual({ valor: 300, inicio: "2026-10-01", fundo: "2026-10-02", recuperouEm: null });
    // quinta, sexta e segunda
    expect(r.pregoesDaBolsa).toBe(3);
  });

  it("mês que só cai: a maior queda é o que perdeu, contada do zero do começo do mês", () => {
    const r = resumirMes({ ...base, linhas: [pregao("2026-10-01", [], [-100]), pregao("2026-10-02", [], [-50])] });
    expect(r.maiorQueda).toEqual({ valor: 150, inicio: "2026-10-01", fundo: "2026-10-02", recuperouEm: null });
    expect(r.diasComGanho).toBe(0);
    expect(r.resultado).toBeCloseTo(-150, 9);
  });

  it("mês que só sobe: sem queda, e o pior dia é o de menor ganho", () => {
    const r = resumirMes({ ...base, linhas: [pregao("2026-10-01", [80], []), pregao("2026-10-02", [20], [])] });
    expect(r.maiorQueda.valor).toBe(0);
    expect(r.piorDia).toEqual({ dia: "2026-10-02", valor: 20 });
    expect(r.diasComGanho).toBe(2);
  });

  it("duração típica: a média das operações que têm horário de entrada", () => {
    expect(resumirMes(base).duracaoTipicaSeg).toBeNull();
    expect(resumirMes({ ...base, duracoesSeg: [60, 180, Number.NaN, -5] }).duracaoTipicaSeg).toBe(120);
  });

  it("mês sem operação: zeros e nulos, sem quebrar", () => {
    const r = resumirMes({ ...base, mes: "2026-08" });
    expect(r.resultado).toBe(0);
    expect(r.pregoes).toBe(0);
    expect(r.ultimoDia).toBeNull();
    expect(r.piorDia).toBeNull();
    expect(r.maiorQueda.valor).toBe(0);
    expect(r.operacoesPorPregao).toBeNull();
    expect(r.dias).toEqual([]);
  });

  it("sem a conta fechar (mais dias operados que pregões da bolsa), o total de pregões não aparece", () => {
    const r = resumirMes({ ...base, hoje: "2026-10-02", feriados: ["2026-10-01", "2026-10-02"] });
    expect(r.pregoes).toBe(2);
    expect(r.pregoesDaBolsa).toBeNull();
  });
});
