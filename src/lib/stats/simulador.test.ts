import { describe, expect, it } from "vitest";
import { formatarBRL } from "@/lib/formato";
import { calcularKpis, capitalMinimoRecomendado } from "./kpis";
import { filtrarPeriodo, somarDias } from "./periodos";
import { drawdownMaximo } from "./serie";
import {
  LIMITE_APERTADO,
  MAX_CONTRATOS,
  OPCOES_PERIODO_SIMULADOR,
  PERIODOS_SIMULADOR,
  PERIODO_SIMULADOR_PADRAO,
  capitalMinimoDaCarteira,
  capitalMinimoDoRobo,
  curvaSimulada,
  ehPeriodoSimulador,
  semaforoDe,
  simular,
  somarCarteira,
  type DiaLiquido,
  type RoboSimulador,
} from "./simulador";
import type { LinhaDiaria } from "./tipos";

const HOJE = "2026-09-23";
const OPCOES = { base: "liquido", unidade: "brl", valorPonto: 0.2 } as const;

function robo(slug: string, dias: DiaLiquido[], capitalMinimoPorContrato: number | null = 1000): RoboSimulador {
  return {
    slug,
    nome: slug[0].toUpperCase() + slug.slice(1),
    ativo: "WIN",
    ativoNome: "Mini índice",
    contaTipo: "demo",
    dias,
    capitalMinimoPorContrato,
  };
}

/** A série diária como estatisticas_publico a entrega, com o líquido igual ao DiaLiquido. */
function linha(dia: string, liquido: number, custos = 2): LinhaDiaria {
  return {
    dia,
    pontos_por_contrato: (liquido + custos) / 0.2,
    resultado_brl_por_contrato: liquido + custos,
    custos_brl_por_contrato: custos,
    n_operacoes: 1,
    n_gain: liquido > 0 ? 1 : 0,
    n_loss: liquido < 0 ? 1 : 0,
    soma_gain_brl_por_contrato: liquido > 0 ? liquido : 0,
    soma_loss_brl_por_contrato: liquido < 0 ? liquido : 0,
    maior_gain_brl_por_contrato: liquido > 0 ? liquido : 0,
    maior_loss_brl_por_contrato: liquido < 0 ? liquido : 0,
  };
}

const APOLLO: DiaLiquido[] = [
  ["2025-12-10", 100],
  ["2026-05-05", -300],
  ["2026-08-20", 200],
  ["2026-09-01", -50],
  ["2026-09-02", -20],
  ["2026-09-03", 0],
  ["2026-09-04", -10],
  ["2026-09-08", 150],
];

const ORION: DiaLiquido[] = [
  ["2026-08-20", 50],
  ["2026-09-01", 30],
  ["2026-09-10", -80],
];

const apollo = robo("apollo", APOLLO, 5000);
const orion = robo("orion", ORION, 3000);

describe("períodos do simulador", () => {
  it("só 3m, 12m, ano e tudo, com os rótulos de PERIODOS", () => {
    expect(PERIODOS_SIMULADOR).toEqual(["3m", "12m", "ano", "tudo"]);
    expect(PERIODO_SIMULADOR_PADRAO).toBe("tudo");
    expect(OPCOES_PERIODO_SIMULADOR).toEqual([
      { valor: "3m", rotulo: "3 meses" },
      { valor: "12m", rotulo: "12 meses" },
      { valor: "ano", rotulo: "Ano" },
      { valor: "tudo", rotulo: "Tudo" },
    ]);
  });

  it("ehPeriodoSimulador aceita só os quatro", () => {
    expect(ehPeriodoSimulador("3m")).toBe(true);
    expect(ehPeriodoSimulador("tudo")).toBe(true);
    expect(ehPeriodoSimulador("7d")).toBe(false);
    expect(ehPeriodoSimulador("personalizado")).toBe(false);
    expect(ehPeriodoSimulador(null)).toBe(false);
    expect(ehPeriodoSimulador(3)).toBe(false);
  });
});

describe("somarCarteira", () => {
  it("um robô com 1 contrato = a própria série", () => {
    expect(somarCarteira([apollo], { apollo: 1 })).toEqual(APOLLO.map(([dia, valor]) => ({ dia, valor })));
  });

  it("dois robôs com dias diferentes alinham por dia; dia sem linha de um robô conta zero", () => {
    const soma = somarCarteira([apollo, orion], { apollo: 1, orion: 1 });
    expect(soma.map((p) => p.dia)).toEqual([
      "2025-12-10",
      "2026-05-05",
      "2026-08-20",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-08",
      "2026-09-10",
    ]);
    expect(soma.find((p) => p.dia === "2026-08-20")?.valor).toBe(250);
    expect(soma.find((p) => p.dia === "2026-09-01")?.valor).toBe(-20);
    // só o Orion operou
    expect(soma.find((p) => p.dia === "2026-09-10")?.valor).toBe(-80);
    // só o Apollo operou
    expect(soma.find((p) => p.dia === "2025-12-10")?.valor).toBe(100);
  });

  it("contratos 2 dobra o robô, e os pesos são por robô", () => {
    const soma = somarCarteira([apollo, orion], { apollo: 2, orion: 1 });
    expect(soma.find((p) => p.dia === "2025-12-10")?.valor).toBe(200);
    expect(soma.find((p) => p.dia === "2026-08-20")?.valor).toBe(450);
    expect(soma.find((p) => p.dia === "2026-09-01")?.valor).toBe(-70);
  });

  it("robô com 0 contratos, ausente, negativo ou inválido fica fora", () => {
    expect(somarCarteira([apollo, orion], { apollo: 0, orion: 1 })).toEqual(ORION.map(([dia, valor]) => ({ dia, valor })));
    expect(somarCarteira([apollo, orion], { orion: 1 })).toEqual(ORION.map(([dia, valor]) => ({ dia, valor })));
    expect(somarCarteira([apollo, orion], { apollo: -2, orion: Number.NaN })).toEqual([]);
  });

  it("clampa a MAX_CONTRATOS e arredonda contratos fracionários", () => {
    const soma = somarCarteira([apollo], { apollo: MAX_CONTRATOS * 10 });
    expect(soma[0].valor).toBe(100 * MAX_CONTRATOS);
    expect(somarCarteira([apollo], { apollo: 2.4 })[0].valor).toBe(200);
  });

  it("devolve em ordem de dia mesmo com séries fora de ordem, a centavos", () => {
    const bagunca = robo("x", [
      ["2026-09-03", 0.1],
      ["2026-09-01", 0.2],
      ["2026-09-02", 0.3],
    ]);
    const soma = somarCarteira([bagunca], { x: 3 });
    expect(soma.map((p) => p.dia)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(soma.map((p) => p.valor)).toEqual([0.6, 0.9, 0.3]);
  });

  it("as 4 casas do banco entram sem arredondar; a soma do dia sai a centavos", () => {
    const fino = robo("f", [
      ["2026-09-01", -10.004],
      ["2026-09-02", 0.125],
    ]);
    expect(somarCarteira([fino], { f: 3 }).map((p) => p.valor)).toEqual([-30.01, 0.38]);
  });
});

describe("curvaSimulada", () => {
  it("acumula, marca pico e drawdown, e patrimônio = capital + acumulado", () => {
    const curva = curvaSimulada(
      [
        { dia: "2026-09-03", valor: 30 },
        { dia: "2026-09-01", valor: 100 },
        { dia: "2026-09-02", valor: -50 },
      ],
      1000,
    );
    expect(curva.map((p) => p.dia)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(curva.map((p) => p.acumulado)).toEqual([100, 50, 80]);
    expect(curva.map((p) => p.pico)).toEqual([100, 100, 100]);
    expect(curva.map((p) => p.drawdown)).toEqual([0, -50, -20]);
    expect(curva.map((p) => p.patrimonio)).toEqual([1100, 1050, 1080]);
  });

  it("vazia", () => {
    expect(curvaSimulada([], 1000)).toEqual([]);
  });
});

describe("capitalMinimoDoRobo", () => {
  it("= capitalMinimoRecomendado(margem, drawdown de TODO o histórico, fator), no inteiro que a aba Risco publica", () => {
    const ddTudo = drawdownMaximo(curvaSimulada(APOLLO.map(([dia, valor]) => ({ dia, valor })), 0)).valor;
    expect(ddTudo).toBe(300);
    expect(capitalMinimoDoRobo(APOLLO, 1500, 1.5)).toBe(Math.round(capitalMinimoRecomendado(1500, 300, 1.5)));
    expect(capitalMinimoDoRobo(APOLLO, 1500, 1.5)).toBe(1950);
  });

  it("arredonda ao inteiro exibido: dd × 1,5 com meio centavo não deixa o número publicado abaixo da regra", () => {
    const meioCentavo: DiaLiquido[] = [
      ["2026-09-01", 100],
      ["2026-09-02", -2100.93],
    ];
    // 1.000 + 2.100,93 × 1,5 = 4.151,395; a aba Risco mostra "R$ 4.151", e é esse o número da regra
    const cru = capitalMinimoRecomendado(1000, 2100.93, 1.5);
    expect(cru).toBeCloseTo(4151.395, 3);
    expect(capitalMinimoDoRobo(meioCentavo, 1000, 1.5)).toBe(4151);
    expect(formatarBRL(cru, { inteiro: true })).toBe(formatarBRL(4151, { inteiro: true }));
  });

  it("bate com a aba Risco em Tudo (calcularKpis sobre a série diária líquida), inclusive com as 4 casas do banco", () => {
    const linhas = APOLLO.map(([dia, liquido]) => linha(dia, liquido));
    const dd = calcularKpis(linhas, OPCOES, { hoje: HOJE }).drawdown.valor;
    expect(capitalMinimoDoRobo(APOLLO, 1500, 1.5)).toBe(Math.round(capitalMinimoRecomendado(1500, dd, 1.5)));

    // 200 pregões de -10,004 (numeric(14,4)): dd 2.000,80 → R$ 4.001, o mesmo da aba Risco. Se cada dia
    // fosse arredondado a centavos antes (-10,00), o dd seria 2.000,00 e o mínimo R$ 4.000: outro número.
    const quatroCasas: DiaLiquido[] = Array.from({ length: 200 }, (_, i) => [somarDias("2025-01-01", i), -10.004]);
    const dd4 = calcularKpis(
      quatroCasas.map(([dia, v]) => linha(dia, v)),
      OPCOES,
      { hoje: HOJE },
    ).drawdown.valor;
    expect(dd4).toBeCloseTo(2000.8, 6);
    expect(capitalMinimoDoRobo(quatroCasas, 1000, 1.5)).toBe(4001);
    expect(capitalMinimoDoRobo(quatroCasas, 1000, 1.5)).toBe(Math.round(capitalMinimoRecomendado(1000, dd4, 1.5)));
    const aCentavos = quatroCasas.map(([dia, v]): DiaLiquido => [dia, Math.round(v * 100) / 100]);
    expect(capitalMinimoDoRobo(aCentavos, 1000, 1.5)).toBe(4000);
  });

  it("null sem margem de referência; margem zero ainda conta", () => {
    expect(capitalMinimoDoRobo(APOLLO, null, 1.5)).toBeNull();
    expect(capitalMinimoDoRobo(APOLLO, 0, 1.5)).toBe(450);
  });

  it("série vazia = só a margem", () => {
    expect(capitalMinimoDoRobo([], 1500, 1.5)).toBe(1500);
  });
});

describe("capitalMinimoDaCarteira", () => {
  it("soma contratos × capital mínimo por contrato, na ordem dos robôs", () => {
    const r = capitalMinimoDaCarteira([apollo, orion], { apollo: 2, orion: 1 });
    expect(r.total).toBe(13000);
    expect(r.conhecido).toBe(13000);
    expect(r.semMinimo).toEqual([]);
    expect(r.porRobo).toEqual([
      { slug: "apollo", contratos: 2, porContrato: 5000, total: 10000 },
      { slug: "orion", contratos: 1, porContrato: 3000, total: 3000 },
    ]);
  });

  it("robô com 0 contratos fica fora, inclusive da lista", () => {
    const r = capitalMinimoDaCarteira([apollo, orion], { apollo: 0, orion: 3 });
    expect(r.total).toBe(9000);
    expect(r.porRobo.map((p) => p.slug)).toEqual(["orion"]);
  });

  it("null quando algum robô escolhido não tem margem configurada, e diz qual; a soma dos outros fica como piso", () => {
    const semMargem = robo("alaska", [["2026-09-01", 10]], null);
    const r = capitalMinimoDaCarteira([apollo, semMargem], { apollo: 1, alaska: 1 });
    expect(r.total).toBeNull();
    expect(r.conhecido).toBe(5000);
    expect(r.semMinimo).toEqual(["alaska"]);
    expect(r.porRobo[1]).toEqual({ slug: "alaska", contratos: 1, porContrato: null, total: null });
    // desmarcado, o robô sem margem não atrapalha
    expect(capitalMinimoDaCarteira([apollo, semMargem], { apollo: 1, alaska: 0 }).total).toBe(5000);
    // só robôs sem margem: nada conhecido
    expect(capitalMinimoDaCarteira([semMargem], { alaska: 3 })).toMatchObject({ total: null, conhecido: 0, semMinimo: ["alaska"] });
  });

  it("carteira vazia soma zero", () => {
    expect(capitalMinimoDaCarteira([apollo, orion], {})).toEqual({ total: 0, conhecido: 0, porRobo: [], semMinimo: [] });
  });
});

describe("semaforoDe", () => {
  it("não cabe abaixo do capital mínimo, mesmo sem drawdown", () => {
    expect(semaforoDe(9999, 10000, 0)).toBe("nao_cabe");
  });

  it("capital igual ao mínimo publicado cabe: o mínimo é o inteiro exibido", () => {
    expect(semaforoDe(4151, 4151, 0)).toBe("cabe");
  });

  it("apertado quando cabe, mas o drawdown passa de 25% do capital", () => {
    expect(semaforoDe(10000, 10000, 2500.01)).toBe("apertado");
    expect(semaforoDe(10000, 5000, 4000)).toBe("apertado");
  });

  it("cabe no resto; 25% exato ainda cabe", () => {
    expect(semaforoDe(10000, 10000, 2500)).toBe("cabe");
    expect(semaforoDe(10000, 10000, 0)).toBe("cabe");
    expect(LIMITE_APERTADO).toBe(0.25);
  });

  it("compara a centavos: 25% exatos somados em ponto flutuante ainda cabem", () => {
    // 57 + 64,51 + 61,78 + 22,96 = 206,25 = 25% de 825, mas a soma em float passa disso por 1e-13
    const soma = [57, 64.51, 61.78, 22.96].reduce((a, b) => a + b, 0);
    expect(semaforoDe(825, 100, soma)).toBe("cabe");
    expect(semaforoDe(825, 100, 206.26)).toBe("apertado");
  });

  it("não cabe quando o drawdown simulado consumiria o capital inteiro", () => {
    expect(semaforoDe(1000, null, 1000)).toBe("nao_cabe");
    expect(semaforoDe(1000, null, 1059)).toBe("nao_cabe");
    expect(semaforoDe(1000, 100, 999.99)).toBe("apertado");
  });

  it("sem o total, a soma dos mínimos conhecidos é piso; acima dela só o drawdown decide", () => {
    expect(semaforoDe(1000, null, 0, 4290)).toBe("nao_cabe");
    expect(semaforoDe(4290, null, 0, 4290)).toBe("cabe");
    expect(semaforoDe(4290, null, 1073, 4290)).toBe("apertado");
    // nada conhecido (todos sem margem): só o drawdown
    expect(semaforoDe(100, null, 25)).toBe("cabe");
    expect(semaforoDe(100, null, 26)).toBe("apertado");
    expect(semaforoDe(100, null, 100)).toBe("nao_cabe");
  });
});

describe("simular", () => {
  const entrada = { capital: 10000, robos: [apollo, orion], contratos: { apollo: 2, orion: 1 }, periodo: "tudo" as const, hoje: HOJE };

  it("um robô com 1 contrato reproduz a série do robô", () => {
    const r = simular({ ...entrada, robos: [apollo], contratos: { apollo: 1 } });
    expect(r.serie.map((p) => [p.dia, p.valor])).toEqual(APOLLO);
    expect(r.nDias).toBe(APOLLO.length);
    expect(r.resultado).toBe(70);
    expect(r.ddMax).toBe(300);
    expect(r.capitalMinimo).toBe(5000);
    expect(r.capitalMinimoConhecido).toBe(5000);
  });

  it("carteira com pesos: resultado, % sobre o capital inicial e patrimônio", () => {
    const r = simular(entrada);
    expect(r.nDias).toBe(9);
    expect(r.serie.map((p) => p.valor)).toEqual([200, -600, 450, -70, -40, 0, -20, 300, -80]);
    expect(r.resultado).toBe(140);
    expect(r.resultadoPct).toBeCloseTo(0.014);
    expect(r.serie[r.serie.length - 1].patrimonio).toBe(10140);
  });

  it("drawdown máximo em R$ e em % do capital inicial, com início, fundo e recuperação", () => {
    const r = simular(entrada);
    expect(r.ddMax).toBe(600);
    expect(r.ddMaxPct).toBeCloseTo(0.06);
    expect(r.drawdown.inicio).toBe("2025-12-10");
    expect(r.drawdown.fundo).toBe("2026-05-05");
    expect(r.drawdown.recuperacao).toBe("2026-09-08");
    expect(r.drawdown.diasAteRecuperar).toBe(272);
    // a % é sobre o capital informado, não sobre o patrimônio do momento
    expect(simular({ ...entrada, capital: 20000 }).ddMaxPct).toBeCloseTo(0.03);
  });

  it("pior mês (menor soma mensal, com quantos pregões entraram) e pior dia", () => {
    const r = simular(entrada);
    expect(r.piorMes).toEqual({ mes: "2026-05", valor: -600, nDias: 1 });
    expect(r.piorDia).toEqual({ dia: "2026-05-05", valor: -600 });
    // o pior mês não precisa ser o pior dia: setembro fecha positivo apesar dos dias negativos
    const soPositivo = simular({ ...entrada, robos: [robo("x", [["2026-09-01", 10], ["2026-09-02", 5]])], contratos: { x: 1 } });
    expect(soPositivo.piorMes).toEqual({ mes: "2026-09", valor: 15, nDias: 2 });
    expect(soPositivo.piorDia).toEqual({ dia: "2026-09-02", valor: 5 });
  });

  it("o pior mês conta os meses parciais das pontas do período, e nDias mostra isso", () => {
    // 3m a partir de 23/09 começa em 23/06: junho entra só com os 5 últimos pregões
    const cortado = robo("c", [
      ["2026-06-10", 1000],
      ["2026-06-24", -100],
      ["2026-06-25", -100],
      ["2026-06-26", -100],
      ["2026-06-29", -100],
      ["2026-06-30", -100],
      ["2026-07-15", -450],
    ]);
    const base = { ...entrada, robos: [cortado], contratos: { c: 1 } };
    expect(simular({ ...base, periodo: "tudo" }).piorMes).toEqual({ mes: "2026-07", valor: -450, nDias: 1 });
    expect(simular({ ...base, periodo: "3m" }).piorMes).toEqual({ mes: "2026-06", valor: -500, nDias: 5 });
  });

  it("maior sequência negativa (dia zerado interrompe) e dias negativos", () => {
    const r = simular(entrada);
    // -70, -40 | 0 | -20 | +300 | -80
    expect(r.maiorSequenciaNegativa).toBe(2);
    expect(r.diasNegativos).toBe(5);
  });

  it("dia de pregão é o dia em que algum robô escolhido operou; sem dia em comum a sequência continua", () => {
    const a = robo("a", [
      ["2026-09-01", -10],
      ["2026-09-02", -10],
      ["2026-09-03", -10],
      ["2026-09-04", -10],
    ]);
    const b = robo("b", [["2026-09-03", 10]]);
    // -10, -10 | 0 (soma zerada interrompe) | -10
    const juntos = simular({ ...entrada, robos: [a, b], contratos: { a: 1, b: 1 } });
    expect(juntos.serie.map((p) => p.valor)).toEqual([-10, -10, 0, -10]);
    expect(juntos.nDias).toBe(4);
    expect(juntos.maiorSequenciaNegativa).toBe(2);
    expect(juntos.diasNegativos).toBe(3);
    // 01/09 só o A, 02/09 só o C: dois pregões, sequência de 2 (dia sem operação de nenhum não existe na série)
    const c = robo("c", [["2026-09-02", -5]]);
    const soA = robo("a", [["2026-09-01", -10]]);
    const separados = simular({ ...entrada, robos: [soA, c], contratos: { a: 1, c: 1 } });
    expect(separados.nDias).toBe(2);
    expect(separados.maiorSequenciaNegativa).toBe(2);
  });

  it("período recorta com filtrarPeriodo (3m, ano, 12m, tudo)", () => {
    const soma = somarCarteira([apollo, orion], { apollo: 2, orion: 1 });
    for (const periodo of PERIODOS_SIMULADOR) {
      const r = simular({ ...entrada, periodo });
      expect(r.serie.map((p) => p.dia)).toEqual(filtrarPeriodo(soma, periodo, HOJE).map((p) => p.dia));
    }
    const tresMeses = simular({ ...entrada, periodo: "3m" });
    expect(tresMeses.serie[0].dia).toBe("2026-08-20");
    expect(tresMeses.nDias).toBe(7);
    expect(tresMeses.resultado).toBe(540);
    // o acumulado e o drawdown recomeçam do zero no primeiro dia do período: 450, 380, 340, 340, 320 → -130
    expect(tresMeses.ddMax).toBe(130);
    const ano = simular({ ...entrada, periodo: "ano" });
    expect(ano.serie[0].dia).toBe("2026-05-05");
    expect(ano.nDias).toBe(8);
    expect(ano.resultado).toBe(-60);
    expect(simular({ ...entrada, periodo: "12m" }).nDias).toBe(9);
  });

  it("o capital mínimo usa todo o histórico, independente do período", () => {
    expect(simular({ ...entrada, periodo: "3m" }).capitalMinimo).toBe(13000);
    expect(simular({ ...entrada, periodo: "3m" }).capitalMinimoPorRobo.map((p) => p.total)).toEqual([10000, 3000]);
  });

  it("dias depois de hoje ficam fora", () => {
    const futuro = robo("f", [
      ["2026-09-22", 10],
      ["2026-09-24", 999],
    ]);
    const r = simular({ ...entrada, robos: [futuro], contratos: { f: 1 } });
    expect(r.nDias).toBe(1);
    expect(r.resultado).toBe(10);
  });

  it("capital abaixo do mínimo → não cabe; igual ao inteiro publicado → cabe", () => {
    const r = simular({ ...entrada, capital: 12999 });
    expect(r.capitalMinimo).toBe(13000);
    expect(r.semaforo).toBe("nao_cabe");
    expect(simular({ ...entrada, capital: 13000 }).semaforo).toBe("cabe");
    // o mínimo com meio centavo (4.151,395) é publicado como R$ 4.151, e R$ 4.151 digitados não podem dar "não cabe"
    const dias: DiaLiquido[] = [
      ["2026-09-01", 100],
      ["2026-09-02", -2100.93],
    ];
    const meio = robo("m", dias, capitalMinimoDoRobo(dias, 1000, 1.5));
    expect(meio.capitalMinimoPorContrato).toBe(4151);
    expect(simular({ ...entrada, capital: 4150, robos: [meio], contratos: { m: 1 } }).semaforo).toBe("nao_cabe");
    // cobre o mínimo; o dd de 2.100,93 é 50,6% do capital → apertado, não "não cabe"
    expect(simular({ ...entrada, capital: 4151, robos: [meio], contratos: { m: 1 } }).semaforo).toBe("apertado");
  });

  it("drawdown simulado acima de 25% do capital → apertado; 25% exato cabe, mesmo somado em centavos", () => {
    const queda = robo("q", [
      ["2026-09-01", 100],
      ["2026-09-02", -500],
    ], 100);
    expect(simular({ ...entrada, capital: 1000, robos: [queda], contratos: { q: 1 } }).semaforo).toBe("apertado");
    expect(simular({ ...entrada, capital: 2000, robos: [queda], contratos: { q: 1 } }).semaforo).toBe("cabe");
    expect(simular({ ...entrada, capital: 2000, robos: [queda], contratos: { q: 1 } }).ddMaxPct).toBe(0.25);
    // 57 + 64,51 + 61,78 + 22,96 = 206,25 = 25% de 825; a soma em float passa disso por 1e-13 e não pode virar apertado
    const centavos = robo("c", [
      ["2026-09-01", -57],
      ["2026-09-02", -64.51],
      ["2026-09-03", -61.78],
      ["2026-09-04", -22.96],
    ], 100);
    const r = simular({ ...entrada, capital: 825, robos: [centavos], contratos: { c: 1 } });
    expect(r.ddMax).toBe(206.25);
    expect(r.ddMaxPct).toBe(0.25);
    expect(r.semaforo).toBe("cabe");
  });

  it("cabe quando cobre o mínimo e o drawdown fica dentro", () => {
    const r = simular({ ...entrada, capital: 13000 });
    expect(r.semaforo).toBe("cabe");
  });

  it("robô com contratos 0 fica fora de tudo, inclusive do capital mínimo", () => {
    const r = simular({ ...entrada, contratos: { apollo: 0, orion: 1 } });
    expect(r.serie.map((p) => [p.dia, p.valor])).toEqual(ORION);
    expect(r.capitalMinimo).toBe(3000);
    expect(r.capitalMinimoPorRobo.map((p) => p.slug)).toEqual(["orion"]);
  });

  it("robô sem margem configurada: capital mínimo null, e a soma dos mínimos conhecidos vira piso", () => {
    const semMargem = robo("alaska", [["2026-05-05", -100]], null);
    const base = { ...entrada, robos: [apollo, semMargem], contratos: { apollo: 1, alaska: 1 } };
    const r = simular({ ...base, capital: 1000 });
    expect(r.capitalMinimo).toBeNull();
    expect(r.capitalMinimoConhecido).toBe(5000);
    expect(r.robosSemCapitalMinimo).toEqual(["alaska"]);
    // R$ 1.000 já fica abaixo dos R$ 5.000 do Apollo sozinho: não cabe, mesmo sem o total
    expect(r.semaforo).toBe("nao_cabe");
    // cobrindo o piso, só o drawdown decide: dd 400 (100 → -300) é 8% de 5.000
    const cobre = simular({ ...base, capital: 5000 });
    expect(cobre.ddMax).toBe(400);
    expect(cobre.semaforo).toBe("cabe");
    // só robôs sem margem: nada conhecido, e o drawdown decide sozinho, inclusive o "não cabe" por zerar o capital
    const so = { ...entrada, robos: [semMargem], contratos: { alaska: 1 } };
    expect(simular({ ...so, capital: 100 }).semaforo).toBe("nao_cabe");
    expect(simular({ ...so, capital: 101 }).semaforo).toBe("apertado");
    expect(simular({ ...so, capital: 400 }).semaforo).toBe("cabe");
  });

  it("carteira vazia devolve zeros, série vazia, pior mês/dia null e cabe", () => {
    const r = simular({ ...entrada, contratos: {} });
    expect(r).toMatchObject({
      serie: [],
      nDias: 0,
      resultado: 0,
      resultadoPct: 0,
      ddMax: 0,
      ddMaxPct: 0,
      piorMes: null,
      piorDia: null,
      maiorSequenciaNegativa: 0,
      diasNegativos: 0,
      capitalMinimo: 0,
      capitalMinimoConhecido: 0,
      capitalMinimoPorRobo: [],
      robosSemCapitalMinimo: [],
      semaforo: "cabe",
    });
    expect(r.drawdown).toEqual({ valor: 0, inicio: null, fundo: null, recuperacao: null, diasAteRecuperar: null });
  });

  it("sem pregão no período: zeros, e o semáforo cabe se o capital cobre o mínimo", () => {
    const antigo = robo("a", [["2024-01-10", 500]], 2000);
    const dentro = simular({ ...entrada, capital: 2000, robos: [antigo], contratos: { a: 1 }, periodo: "ano" });
    expect(dentro.nDias).toBe(0);
    expect(dentro.resultado).toBe(0);
    expect(dentro.piorMes).toBeNull();
    expect(dentro.capitalMinimo).toBe(2000);
    expect(dentro.semaforo).toBe("cabe");
    expect(simular({ ...entrada, capital: 1999, robos: [antigo], contratos: { a: 1 }, periodo: "ano" }).semaforo).toBe("nao_cabe");
  });

  it("nunca lança: capital zero, negativo ou NaN vira zero sem divisão por zero", () => {
    for (const capital of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = simular({ ...entrada, capital });
      expect(r.resultado).toBe(140);
      expect(r.resultadoPct).toBe(0);
      expect(r.ddMaxPct).toBe(0);
      expect(Number.isFinite(r.serie[0].patrimonio)).toBe(true);
    }
  });

  it("é determinística e não altera a entrada", () => {
    const contratos = { apollo: 2, orion: 1 };
    const a = simular({ ...entrada, contratos });
    const b = simular({ ...entrada, contratos });
    expect(a).toEqual(b);
    expect(contratos).toEqual({ apollo: 2, orion: 1 });
    expect(apollo.dias).toEqual(APOLLO);
  });
});
