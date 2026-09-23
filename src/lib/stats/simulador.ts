// Simulador "com o meu capital" (aprovado em 23/09/2026, spec §8.6): aritmética sobre o histórico
// público, por contrato, aplicada ao capital e aos contratos que o visitante informa. Não é
// recomendação nem projeção de resultado. Tudo aqui é função pura: a página monta a série diária de
// cada robô no servidor (R$ líquido por 1 contrato, já filtrada até hoje) e o painel roda `simular`
// no navegador a cada mudança de capital, contratos ou período.
//
// Regras que a tela repete: o resultado do dia da carteira é a soma, sobre os robôs escolhidos, de
// contratos × resultado líquido por contrato do robô no dia (dia sem operação conta zero); o
// patrimônio simulado é o capital mais o acumulado; o drawdown em % é sempre sobre o CAPITAL INICIAL
// informado; o capital mínimo é só a regra já publicada na aba Risco (margem de referência + drawdown
// máximo de TODO o histórico do robô, 1 contrato, × fator de segurança), somada por robô × contratos.
//
// Bordas fechadas na revisão de 23/09/2026: o capital mínimo por contrato é o INTEIRO que a aba Risco
// mostra (Math.round), para quem digita exatamente o número publicado não ler "não cabe"; as
// comparações do semáforo são a centavos, porque o acumulado é soma de centavos em ponto flutuante;
// com robô sem margem configurada, a soma dos mínimos conhecidos vale como piso; e drawdown simulado
// maior ou igual ao capital é "não cabe" (o patrimônio simulado teria zerado).

import { capitalMinimoRecomendado } from "./kpis";
import { PERIODOS, filtrarPeriodo, mesDe, type Periodo } from "./periodos";
import { episodiosDrawdown, resumoDiario } from "./risco";
import { drawdownMaximo } from "./serie";
import type { Drawdown, PontoCurva } from "./tipos";

/**
 * R$ líquido por 1 contrato num dia de pregão (YYYY-MM-DD), como valorDia(l, { base: "liquido",
 * unidade: "brl", valorPonto }) devolve, SEM arredondar: o banco guarda 4 casas e a aba Risco também não
 * arredonda, então o capital mínimo por contrato bate com o dela; somarCarteira arredonda a soma do dia
 * a centavos, e a curva simulada fica a centavos.
 */
export type DiaLiquido = readonly [dia: string, liquido: number];

export type PeriodoSimulador = Extract<Periodo, "3m" | "12m" | "ano" | "tudo">;
export const PERIODOS_SIMULADOR: readonly PeriodoSimulador[] = ["3m", "12m", "ano", "tudo"];
export const PERIODO_SIMULADOR_PADRAO: PeriodoSimulador = "tudo";

/** Rótulos reaproveitados de PERIODOS: "3 meses", "12 meses", "Ano", "Tudo". */
export const OPCOES_PERIODO_SIMULADOR: ReadonlyArray<{ valor: PeriodoSimulador; rotulo: string }> =
  PERIODOS_SIMULADOR.map((valor) => ({
    valor,
    rotulo: PERIODOS.find((p) => p.valor === valor)?.rotulo ?? valor,
  }));

export function ehPeriodoSimulador(v: unknown): v is PeriodoSimulador {
  return typeof v === "string" && (PERIODOS_SIMULADOR as readonly string[]).includes(v);
}

/** Drawdown máximo simulado acima disto (fração do capital inicial) = "apertado". */
export const LIMITE_APERTADO = 0.25;
export const MAX_CONTRATOS = 1000;

export interface RoboSimulador {
  slug: string;
  nome: string;
  /** "WIN" */
  ativo: string;
  /** "Mini índice" */
  ativoNome: string;
  /** robo.conta_tipo */
  contaTipo: "real" | "demo" | null;
  /** série diária INTEIRA do robô até hoje, em ordem de dia (ordenarPorDia), R$ líquido por 1 contrato */
  dias: readonly DiaLiquido[];
  /** capitalMinimoDoRobo(...) calculado no servidor, inteiro em R$; null = margem de referência não configurada */
  capitalMinimoPorContrato: number | null;
}

export interface EntradaSimulacao {
  /** > 0, inteiro em R$ */
  capital: number;
  robos: readonly RoboSimulador[];
  /** slug → contratos; ausente ou 0 = robô fora da simulação; máximo MAX_CONTRATOS */
  contratos: Readonly<Record<string, number>>;
  periodo: PeriodoSimulador;
  /** hojeSP() */
  hoje: string;
}

/** Um dia da curva simulada: valor = resultado do dia da carteira; acumulado 0-based; patrimonio = capital + acumulado. */
export interface PontoSimulado extends PontoCurva {
  patrimonio: number;
}

export type Semaforo = "cabe" | "apertado" | "nao_cabe";

export interface CapitalMinimoRobo {
  slug: string;
  contratos: number;
  porContrato: number | null;
  total: number | null;
}

export interface ResultadoSimulacao {
  /** só os dias do período (filtrarPeriodo), em ordem */
  serie: PontoSimulado[];
  /** dias em que algum robô escolhido operou (dia sem operação de nenhum não entra) */
  nDias: number;
  /** acumulado do último ponto, a centavos (0 se vazio) */
  resultado: number;
  /** resultado / capital */
  resultadoPct: number;
  /** drawdownMaximo(serie): valor, inicio, fundo, recuperacao, diasAteRecuperar */
  drawdown: Drawdown;
  /** drawdown.valor (magnitude, >= 0), a centavos */
  ddMax: number;
  /** ddMax / capital (sobre o capital inicial informado) */
  ddMaxPct: number;
  /**
   * mes "YYYY-MM" (mesDe), menor soma mensal; null sem dias. Os meses das pontas do período podem estar
   * incompletos (3m e 12m começam no dia do mês de hoje, e o mês corrente está em andamento): nDias diz
   * quantos pregões entraram, e a tela mostra.
   */
  piorMes: { mes: string; valor: number; nDias: number } | null;
  piorDia: { dia: string; valor: number } | null;
  /** resumoDiario(serie, episodios).maiorSequenciaNegativa (dia zerado interrompe) */
  maiorSequenciaNegativa: number;
  diasNegativos: number;
  /** soma de total por robô selecionado; null se ALGUM selecionado tem porContrato null */
  capitalMinimo: number | null;
  /** soma dos mínimos conhecidos dos robôs selecionados (= capitalMinimo quando todos têm margem): o piso do semáforo */
  capitalMinimoConhecido: number;
  /** só robôs com contratos > 0, na ordem de `robos` */
  capitalMinimoPorRobo: CapitalMinimoRobo[];
  /** slugs selecionados com porContrato null */
  robosSemCapitalMinimo: string[];
  semaforo: Semaforo;
}

const centavos = (v: number) => Math.round(v * 100) / 100;
const emCentavos = (v: number) => Math.round(v * 100);

/** Contratos de um robô como inteiro em 0..MAX_CONTRATOS; ausente, inválido ou negativo = 0 (fora). */
function contratosDe(contratos: Readonly<Record<string, number>>, slug: string): number {
  const bruto = contratos[slug];
  if (typeof bruto !== "number" || !Number.isFinite(bruto)) return 0;
  return Math.min(MAX_CONTRATOS, Math.max(0, Math.round(bruto)));
}

const ordenar = <T extends { dia: string }>(itens: readonly T[]): T[] =>
  [...itens].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));

/**
 * Soma ponderada da carteira, generalizando somarSeries de comparativo/page.tsx: Map por dia; robô sem
 * linha no dia contribui 0; só entram robôs com contratos > 0; devolve em ordem de dia, a centavos.
 */
export function somarCarteira(
  robos: readonly RoboSimulador[],
  contratos: Readonly<Record<string, number>>,
): Array<{ dia: string; valor: number }> {
  const porDia = new Map<string, number>();
  for (const robo of robos) {
    const n = contratosDe(contratos, robo.slug);
    if (n <= 0) continue;
    for (const [dia, liquido] of robo.dias) {
      porDia.set(dia, (porDia.get(dia) ?? 0) + n * liquido);
    }
  }
  return ordenar(Array.from(porDia, ([dia, valor]) => ({ dia, valor: centavos(valor) })));
}

/** Mesmo laço de curvaAcumulada (serie.ts) sobre {dia, valor}, mais patrimonio = capital + acumulado. Entrada vazia → []. */
export function curvaSimulada(dias: ReadonlyArray<{ dia: string; valor: number }>, capital: number): PontoSimulado[] {
  let acumulado = 0;
  let pico = 0;
  return ordenar(dias).map((d) => {
    acumulado += d.valor;
    if (acumulado > pico) pico = acumulado;
    return { dia: d.dia, valor: d.valor, acumulado, pico, drawdown: acumulado - pico, patrimonio: capital + acumulado };
  });
}

/**
 * Capital mínimo por 1 contrato pela regra publicada na aba Risco: margem de referência + drawdown máximo
 * de TODO o histórico (1 contrato, R$ líquido) × fator de segurança, no INTEIRO que a aba mostra
 * (formatarBRL com inteiro): tela e regra usam o mesmo número, e quem digita exatamente o publicado não
 * lê "não cabe" por meio centavo. null sem margem configurada.
 */
export function capitalMinimoDoRobo(dias: readonly DiaLiquido[], margem: number | null, fatorSeguranca: number): number | null {
  if (margem === null) return null;
  const curva = curvaSimulada(
    dias.map(([dia, valor]) => ({ dia, valor })),
    0,
  );
  return Math.round(capitalMinimoRecomendado(margem, drawdownMaximo(curva).valor, fatorSeguranca));
}

/**
 * Soma de contratos × capital mínimo por contrato dos robôs escolhidos. `total` é null quando algum deles
 * não tem margem configurada; `conhecido` é a soma dos que têm (um piso: o total, se existisse, seria
 * maior), e `semMinimo` diz quais ficaram de fora.
 */
export function capitalMinimoDaCarteira(
  robos: readonly RoboSimulador[],
  contratos: Readonly<Record<string, number>>,
): { total: number | null; conhecido: number; porRobo: CapitalMinimoRobo[]; semMinimo: string[] } {
  const porRobo: CapitalMinimoRobo[] = [];
  const semMinimo: string[] = [];
  let conhecido = 0;
  for (const robo of robos) {
    const n = contratosDe(contratos, robo.slug);
    if (n <= 0) continue;
    const porContrato = robo.capitalMinimoPorContrato;
    const total = porContrato === null ? null : n * porContrato;
    porRobo.push({ slug: robo.slug, contratos: n, porContrato, total });
    if (total === null) semMinimo.push(robo.slug);
    else conhecido += total;
  }
  return { total: semMinimo.length > 0 ? null : conhecido, conhecido, porRobo, semMinimo };
}

/**
 * nao_cabe: capital < capital mínimo publicado (sem o total, por robô sem margem configurada, vale o
 * piso: a soma dos mínimos conhecidos, porque um piso já basta para concluir que não cabe) ou drawdown
 * máximo simulado >= capital (o patrimônio simulado teria zerado); apertado: ddMax > LIMITE_APERTADO ×
 * capital (igual = cabe); cabe: o resto. Comparações a centavos: ddMax é soma de centavos em ponto
 * flutuante e 25% exatos passavam por 1e-13.
 */
export function semaforoDe(
  capital: number,
  capitalMinimo: number | null,
  ddMax: number,
  capitalMinimoConhecido: number = capitalMinimo ?? 0,
): Semaforo {
  if (capital < (capitalMinimo ?? capitalMinimoConhecido)) return "nao_cabe";
  const dd = emCentavos(ddMax);
  if (dd >= emCentavos(capital)) return "nao_cabe";
  if (dd > emCentavos(LIMITE_APERTADO * capital)) return "apertado";
  return "cabe";
}

/**
 * Determinística: somarCarteira → filtrarPeriodo → curvaSimulada → drawdownMaximo, episodiosDrawdown,
 * resumoDiario, pior mês por mesDe, capitalMinimoDaCarteira, semaforoDe. Nunca lança; carteira vazia
 * devolve zeros, serie [], piorMes/piorDia null e semaforo "cabe".
 */
export function simular(e: EntradaSimulacao): ResultadoSimulacao {
  const capital = Number.isFinite(e.capital) && e.capital > 0 ? e.capital : 0;
  const fracao = (v: number) => (capital > 0 ? v / capital : 0);

  const carteira = somarCarteira(e.robos, e.contratos);
  const noPeriodo = filtrarPeriodo(carteira, e.periodo, e.hoje);
  const serie = curvaSimulada(noPeriodo, capital);

  const drawdown = drawdownMaximo(serie);
  const resumo = resumoDiario(serie, episodiosDrawdown(serie, Infinity));

  const porMes = new Map<string, { valor: number; nDias: number }>();
  let piorDia: ResultadoSimulacao["piorDia"] = null;
  for (const p of serie) {
    const mes = mesDe(p.dia);
    const m = porMes.get(mes) ?? { valor: 0, nDias: 0 };
    m.valor += p.valor;
    m.nDias += 1;
    porMes.set(mes, m);
    if (piorDia === null || p.valor < piorDia.valor) piorDia = { dia: p.dia, valor: p.valor };
  }
  let piorMes: ResultadoSimulacao["piorMes"] = null;
  for (const [mes, m] of porMes) {
    if (piorMes === null || m.valor < piorMes.valor) piorMes = { mes, valor: centavos(m.valor), nDias: m.nDias };
  }

  const minimo = capitalMinimoDaCarteira(e.robos, e.contratos);
  const resultado = centavos(serie.length > 0 ? serie[serie.length - 1].acumulado : 0);
  const ddMax = centavos(drawdown.valor);

  return {
    serie,
    nDias: serie.length,
    resultado,
    resultadoPct: fracao(resultado),
    drawdown,
    ddMax,
    ddMaxPct: fracao(ddMax),
    piorMes,
    piorDia,
    maiorSequenciaNegativa: resumo.maiorSequenciaNegativa,
    diasNegativos: resumo.diasNegativos,
    capitalMinimo: minimo.total,
    capitalMinimoConhecido: minimo.conhecido,
    capitalMinimoPorRobo: minimo.porRobo,
    robosSemCapitalMinimo: minimo.semMinimo,
    semaforo: semaforoDe(capital, minimo.total, ddMax, minimo.conhecido),
  };
}
