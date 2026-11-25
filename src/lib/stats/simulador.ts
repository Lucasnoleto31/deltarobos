// Simulador "com o meu capital" (aprovado em 23/09/2026, spec §8.6): aritmética sobre o histórico
// público, por contrato, aplicada ao capital e aos contratos que o visitante informa. Não é
// recomendação nem projeção de resultado. Tudo aqui é função pura: a página monta a série diária de
// cada robô no servidor (R$ líquido por 1 contrato, já filtrada até hoje) e o painel roda `simular`
// no navegador a cada mudança de capital, contratos ou período.
//
// Regras que a tela repete: o resultado do dia da carteira é a soma, sobre os robôs escolhidos, de
// contratos × resultado líquido por contrato do robô no dia (dia sem operação conta zero); o
// patrimônio simulado é o capital mais o acumulado; o drawdown em % é sempre sobre o CAPITAL INICIAL
// informado; o capital mínimo é só a regra já publicada na aba Quedas e risco, somada por robô × contratos.
//
// A regra do capital mínimo (25/11/2026, decisão do Lucas): a margem é POR CONTRATO e o robô acumula
// entradas, então "1 contrato" é por entrada. Para um robô, com 1 contrato por entrada:
//   margem por contrato × o máximo de entradas que ele já teve abertas ao mesmo tempo
//   + maior queda de TODO o histórico × fator de segurança.
// Com N contratos por entrada as duas parcelas multiplicam por N (N vezes mais contratos abertos, N vezes
// a queda), e a carteira soma os robôs. O número de cada robô chega pronto do servidor
// (lib/consultas/capital.ts, o mesmo de todas as telas); capitalMinimoDoRobo é a mesma regra, pura.
//
// Bordas fechadas na revisão de 23/09/2026: o capital mínimo por contrato é o INTEIRO que a aba Risco
// mostra (Math.round), para quem digita exatamente o número publicado não ler "não cabe"; as
// comparações do semáforo são a centavos, porque o acumulado é soma de centavos em ponto flutuante; e
// drawdown simulado maior ou igual ao capital é "não cabe" (o patrimônio simulado teria zerado).
//
// 25/11/2026 (DESIGN.md, seção 9): saiu o resultado em % do capital (percentual de retorno não entra em
// tela nenhuma; a queda em % do capital fica, porque mede risco) e entraram os meses com ganho, quanto
// falta para o capital mínimo e os pares de robôs que ganham e perdem nos mesmos dias. Robô escolhido sem
// capital mínimo (sem garantia cadastrada para o ativo, ou sem a leitura das entradas abertas) deixa a
// resposta em "sem_avaliacao": até então a soma dos mínimos conhecidos valia como piso e a tela dizia
// "cabe" sobre um número incompleto. A soma conhecida continua no resultado, para a frase dizer quanto os
// outros robôs já pedem.

import { andamJuntos, ehParQueAndaJunto, resultadoPorMes, resumirMeses } from "./indicadores-robo";
import { capitalMinimoRecomendado } from "./kpis";
import { PERIODOS, filtrarPeriodo, type Periodo } from "./periodos";
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
  /**
   * O capital mínimo publicado do robô com 1 contrato por entrada (lib/consultas/capital.ts, a regra de
   * capitalMinimoDoRobo), inteiro em R$; null = não há o número (veja semMinimoPorque).
   */
  capitalMinimoPorContrato: number | null;
  /**
   * Por que o capital mínimo é null: "garantia" = o ativo não tem a garantia (a margem) cadastrada;
   * "entradas" = a leitura das entradas abertas falhou, e o capital ficaria menor do que o real. null quando
   * há o número.
   */
  semMinimoPorque: "garantia" | "entradas" | null;
  /** o máximo de entradas abertas ao mesmo tempo que a conta do capital mínimo considera (1 sem medição) */
  entradasAbertas: number;
  /** false = não há operação acompanhada ao vivo para medir as entradas, e o 1 acima é só o piso da conta */
  entradasMedidas: boolean;
  /**
   * robo.custo_por_contrato. Só para a premissa do resultado (lib/premissa, custosDaSoma): sem custo cadastrado
   * a série do robô está antes dos custos, e a premissa diz isso no lugar de "já descontados os custos".
   */
  custoPorContrato: number;
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

/** "sem_avaliacao" = algum robô escolhido está sem capital mínimo, e sem ele não dá para dizer se cabe. */
export type Semaforo = "cabe" | "apertado" | "nao_cabe" | "sem_avaliacao";

export interface CapitalMinimoRobo {
  slug: string;
  /** contratos por entrada escolhidos para o robô */
  contratos: number;
  /** o capital mínimo do robô com 1 contrato por entrada; null sem margem cadastrada */
  porContrato: number | null;
  /** contratos × porContrato */
  total: number | null;
  /** o máximo de entradas abertas ao mesmo tempo que a conta considera para o robô */
  entradas: number;
  /** entradas × contratos: quantos contratos o robô chegaria a ter abertos ao mesmo tempo, e sobre os quais a corretora cobra a margem */
  contratosAbertos: number;
}

/** Dois robôs escolhidos que ganham e perdem nos mesmos dias (andamJuntos, em lib/stats/indicadores-robo). */
export interface ParQueAndaJunto {
  /** slugs, na ordem de `robos` */
  a: string;
  b: string;
  /** pregões em que os dois operaram */
  diasEmComum: number;
  /** em quantos deles os dois ganharam ou os dois perderam */
  mesmoSentido: number;
}

export interface ResultadoSimulacao {
  /** só os dias do período (filtrarPeriodo), em ordem */
  serie: PontoSimulado[];
  /** dias em que algum robô escolhido operou (dia sem operação de nenhum não entra) */
  nDias: number;
  /** acumulado do último ponto, a centavos (0 se vazio) */
  resultado: number;
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
  /** meses com pregão no período (os das pontas podem estar incompletos, como no pior mês) */
  meses: number;
  /** quantos deles fecharam com ganho (soma do mês, a centavos, acima de zero) */
  mesesComGanho: number;
  piorDia: { dia: string; valor: number } | null;
  /** resumoDiario(serie, episodios).maiorSequenciaNegativa (dia zerado interrompe) */
  maiorSequenciaNegativa: number;
  diasNegativos: number;
  /** soma de total por robô selecionado; null se ALGUM selecionado tem porContrato null */
  capitalMinimo: number | null;
  /**
   * soma dos mínimos conhecidos dos robôs selecionados (= capitalMinimo quando todos têm o número): sem o
   * total, quanto os outros robôs já pedem, que a frase da resposta cita
   */
  capitalMinimoConhecido: number;
  /** quanto falta para o capital alcançar o capital mínimo (ou a soma conhecida, sem o total); 0 quando cobre */
  capitalQueFalta: number;
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
 * Soma ponderada da carteira, a mesma soma dia a dia que somarSeries (lib/stats/serie-casa) faz para a casa
 * na Visão geral, mas com os contratos de cada robô: Map por dia; robô sem linha no dia contribui 0; só
 * entram robôs com contratos > 0; devolve em ordem de dia, a centavos.
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
 * Capital mínimo do robô com 1 contrato por entrada, pela regra publicada na aba Quedas e risco: margem
 * por contrato × o máximo de entradas que ele já teve abertas ao mesmo tempo + maior queda de TODO o
 * histórico (1 contrato por entrada, R$ líquido) × fator de segurança, no INTEIRO que a aba mostra
 * (formatarBRL com inteiro): tela e regra usam o mesmo número, e quem digita exatamente o publicado não
 * lê "não cabe" por meio centavo. null sem margem configurada.
 *
 * É a mesma conta de lib/consultas/capital.ts (capitaisDaCasa), de onde a página do simulador tira o
 * número de cada robô; o teste confere que as duas dão o mesmo resultado sobre a mesma série.
 */
export function capitalMinimoDoRobo(
  dias: readonly DiaLiquido[],
  margem: number | null,
  fatorSeguranca: number,
  /** o máximo de entradas que o robô já teve abertas ao mesmo tempo (a margem é por contrato); 1 sem medição */
  entradasAbertas = 1,
): number | null {
  if (margem === null) return null;
  const curva = curvaSimulada(
    dias.map(([dia, valor]) => ({ dia, valor })),
    0,
  );
  return Math.round(capitalMinimoRecomendado(margem, drawdownMaximo(curva).valor, fatorSeguranca, entradasAbertas));
}

/** O máximo de entradas abertas que a conta considera para um robô: inteiro, ao menos 1 (a regra de capitalMinimoRecomendado). */
function entradasDe(robo: RoboSimulador): number {
  const e = robo.entradasAbertas;
  return Number.isFinite(e) && e > 1 ? Math.floor(e) : 1;
}

/**
 * Soma, sobre os robôs escolhidos, de contratos × capital mínimo do robô com 1 contrato por entrada. Como o
 * capital mínimo de 1 contrato já é margem × entradas abertas + maior queda × fator, multiplicar pelos
 * contratos multiplica as duas parcelas: a margem passa a valer para entradas × contratos (`contratosAbertos`,
 * o que o robô chegaria a ter aberto ao mesmo tempo) e a queda cresce na mesma proporção. `total` é null
 * quando algum deles está sem o número (sem garantia cadastrada ou sem a leitura das entradas abertas);
 * `conhecido` é a soma dos que têm (o total, se existisse, seria maior), e `semMinimo` diz quais ficaram de
 * fora.
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
    const entradas = entradasDe(robo);
    porRobo.push({ slug: robo.slug, contratos: n, porContrato, total, entradas, contratosAbertos: entradas * n });
    if (total === null) semMinimo.push(robo.slug);
    else conhecido += total;
  }
  return { total: semMinimo.length > 0 ? null : conhecido, conhecido, porRobo, semMinimo };
}

/**
 * Os pares de robôs ESCOLHIDOS (contratos > 0) que ganham e perdem nos mesmos dias: quem liga os dois
 * achando que divide o risco, na prática o soma. Usa o histórico inteiro de cada robô, e não o período da
 * simulação: é uma característica do par, e não muda ao trocar o período. Só entra par com pregões em
 * comum suficientes (ehParQueAndaJunto); do que mais anda junto para o que menos. Os contratos não mudam a
 * conta (o sinal do dia é o mesmo com 1 ou com 10), só dizem quem está escolhido.
 */
export function paresQueAndamJuntos(
  robos: readonly RoboSimulador[],
  contratos: Readonly<Record<string, number>>,
): ParQueAndaJunto[] {
  const escolhidos = robos
    .filter((r) => contratosDe(contratos, r.slug) > 0)
    .map((r) => ({ slug: r.slug, dias: r.dias.map(([dia, valor]) => ({ dia, valor })) }));
  const pares: ParQueAndaJunto[] = [];
  for (let i = 0; i < escolhidos.length; i++) {
    for (let j = i + 1; j < escolhidos.length; j++) {
      const juntos = andamJuntos(escolhidos[i].dias, escolhidos[j].dias);
      if (!ehParQueAndaJunto(juntos)) continue;
      pares.push({ a: escolhidos[i].slug, b: escolhidos[j].slug, diasEmComum: juntos.diasEmComum, mesmoSentido: juntos.mesmoSentido });
    }
  }
  // a ordenação é estável: com a mesma fração, vale a ordem dos robôs
  return pares.sort((x, y) => y.mesmoSentido / y.diasEmComum - x.mesmoSentido / x.diasEmComum);
}

/** A maior queda simulada levaria o capital inteiro (o patrimônio simulado teria zerado), a centavos. */
export function consumiriaOCapital(capital: number, ddMax: number): boolean {
  return emCentavos(ddMax) >= emCentavos(capital);
}

/**
 * sem_avaliacao: capital mínimo null (algum robô escolhido sem garantia cadastrada ou sem a leitura das
 * entradas abertas): sem o número inteiro não se afirma nada, nem "não cabe"; nao_cabe: capital < capital
 * mínimo publicado ou drawdown máximo simulado >= capital (o patrimônio simulado teria zerado); apertado:
 * ddMax > LIMITE_APERTADO × capital (igual = cabe); cabe: o resto. Comparações a centavos: ddMax é soma de
 * centavos em ponto flutuante e 25% exatos passavam por 1e-13.
 */
export function semaforoDe(capital: number, capitalMinimo: number | null, ddMax: number): Semaforo {
  if (capitalMinimo === null) return "sem_avaliacao";
  if (capital < capitalMinimo) return "nao_cabe";
  if (consumiriaOCapital(capital, ddMax)) return "nao_cabe";
  if (emCentavos(ddMax) > emCentavos(LIMITE_APERTADO * capital)) return "apertado";
  return "cabe";
}

/**
 * Determinística: somarCarteira → filtrarPeriodo → curvaSimulada → drawdownMaximo, episodiosDrawdown,
 * resumoDiario, mês a mês (resultadoPorMes e resumirMeses, as mesmas do Resumo do robô),
 * capitalMinimoDaCarteira, semaforoDe. Nunca lança; carteira vazia devolve zeros, serie [], piorMes/piorDia
 * null e semaforo "cabe".
 */
export function simular(e: EntradaSimulacao): ResultadoSimulacao {
  const capital = Number.isFinite(e.capital) && e.capital > 0 ? e.capital : 0;

  const carteira = somarCarteira(e.robos, e.contratos);
  const noPeriodo = filtrarPeriodo(carteira, e.periodo, e.hoje);
  const serie = curvaSimulada(noPeriodo, capital);

  const drawdown = drawdownMaximo(serie);
  const resumo = resumoDiario(serie, episodiosDrawdown(serie, Infinity));

  let piorDia: ResultadoSimulacao["piorDia"] = null;
  for (const p of serie) {
    if (piorDia === null || p.valor < piorDia.valor) piorDia = { dia: p.dia, valor: p.valor };
  }
  // a soma do mês a centavos antes de contar: somas de centavos em ponto flutuante deixam 1e-13 num mês zerado
  const meses = resumirMeses(resultadoPorMes(serie).map((m) => ({ ...m, valor: centavos(m.valor) })));

  const minimo = capitalMinimoDaCarteira(e.robos, e.contratos);
  const resultado = centavos(serie.length > 0 ? serie[serie.length - 1].acumulado : 0);
  const ddMax = centavos(drawdown.valor);

  return {
    serie,
    nDias: serie.length,
    resultado,
    drawdown,
    ddMax,
    ddMaxPct: capital > 0 ? ddMax / capital : 0,
    piorMes: meses.pior,
    meses: meses.meses,
    mesesComGanho: meses.comGanho,
    piorDia,
    maiorSequenciaNegativa: resumo.maiorSequenciaNegativa,
    diasNegativos: resumo.diasNegativos,
    capitalMinimo: minimo.total,
    capitalMinimoConhecido: minimo.conhecido,
    capitalQueFalta: Math.max(0, (minimo.total ?? minimo.conhecido) - capital),
    capitalMinimoPorRobo: minimo.porRobo,
    robosSemCapitalMinimo: minimo.semMinimo,
    semaforo: semaforoDe(capital, minimo.total, ddMax),
  };
}
