// O que o desenho e a premissa do simulador precisam além da conta (lib/stats/simulador): onde a maior queda
// fica na curva e as frases que acompanham o número grande. Sem "use client": funções puras, testáveis, que o
// painel chama no navegador.
//
// 25/11/2026 (ficha Mesa): a curva simulada passou a ser a do GraficoResultado, a mesma da página inicial
// (linha fina, a maior queda em vermelho na própria linha, a leitura do pregão apontado no número grande).
// Até então este arquivo fatiava a série para o DesenhoDaCurva, no estilo do Profit, e escrevia a dica de
// cada ponto; o gráfico novo desenha um ponto por pregão e não tem dica flutuante.
//
// 25/11/2026 (DESIGN.md, seção 9): entraram as frases da revisão dos indicadores. "1 contrato" passou a ser
// dito "por entrada" (o robô acumula entradas, e a garantia da corretora é por contrato), a premissa diz o
// tamanho do histórico, cada robô escolhido diz quantas entradas abertas a conta considera e, quando dois
// robôs escolhidos ganham e perdem nos mesmos dias, uma frase conta em quantos pregões.

import type { QuedaDoGrafico } from "@/components/graficos/GraficoResultado";
import { formatarBRL, formatarData, formatarDataCurta, formatarDataLonga, formatarNumero, formatarPct } from "@/lib/formato";
import { tempoEmPalavras } from "@/lib/stats/indicadores-robo";
import { inicioPeriodo, somarDias, somarMeses } from "@/lib/stats/periodos";
import { LIMITE_APERTADO, type PeriodoSimulador, type PontoSimulado, type Semaforo } from "@/lib/stats/simulador";
import type { Drawdown } from "@/lib/stats/tipos";

/**
 * A maior queda da simulação nos índices da curva, para o desenho pintá-la de vermelho. Não refaz a conta:
 * parte do drawdown que `simular` já achou (início, fundo e valor) e só localiza os dois dias na série.
 * Quando a queda começa na partida (o capital inicial é o pico e o primeiro pregão já é o fundo), o início
 * é -1, a convenção do GraficoResultado. Nulo sem queda.
 */
export function quedaDaSimulacao(serie: readonly PontoSimulado[], drawdown: Drawdown): QuedaDoGrafico | null {
  if (drawdown.valor <= 0 || drawdown.fundo === null) return null;
  const iFundo = serie.findIndex((p) => p.dia === drawdown.fundo);
  if (iFundo < 0) return null;
  const i = drawdown.inicio === null ? -1 : serie.findIndex((p) => p.dia === drawdown.inicio);
  // drawdownMaximo devolve o primeiro dia da série quando nenhum pregão esteve no pico: aí o pico é a partida
  const noPico = i >= 0 && i < iFundo && serie[i].acumulado >= serie[iFundo].pico;
  return { iInicio: noPico ? i : -1, iFundo, valor: drawdown.valor };
}

const contratos = (n: number) => `${formatarNumero(n)} ${n === 1 ? "contrato" : "contratos"}`;

/** "1 pregão", "1.995 pregões". */
export const pregoes = (n: number) => (n === 1 ? "1 pregão" : `${formatarNumero(n)} pregões`);

/**
 * Os contratos da simulação em palavras, para a premissa do número: "1 contrato em cada um dos 3 robôs",
 * "2 contratos no Apollo", "2 contratos no Apollo e 1 no Orion". `totalDeRobos` é quantos robôs a tela
 * oferece: quando nem todos entraram, a frase diz "robôs escolhidos". Com `porEntrada`, o primeiro número
 * leva a unidade inteira: "1 contrato por entrada em cada um dos 3 robôs", "2 contratos por entrada no
 * Apollo e 1 no Orion".
 */
export function contratosEmPalavras(
  escolhidos: ReadonlyArray<{ nome: string; contratos: number }>,
  totalDeRobos: number,
  porEntrada = false,
): string {
  const comUnidade = (n: number) => `${contratos(n)}${porEntrada ? " por entrada" : ""}`;
  if (escolhidos.length === 0) return "";
  if (escolhidos.length === 1) return `${comUnidade(escolhidos[0].contratos)} no ${escolhidos[0].nome}`;
  const n = escolhidos[0].contratos;
  if (escolhidos.every((e) => e.contratos === n)) {
    const quais = escolhidos.length === totalDeRobos ? "robôs" : "robôs escolhidos";
    return `${comUnidade(n)} em cada um dos ${formatarNumero(escolhidos.length)} ${quais}`;
  }
  const partes = escolhidos.map((e, i) => `${i === 0 ? comUnidade(e.contratos) : formatarNumero(e.contratos)} no ${e.nome}`);
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/**
 * Quantas entradas abertas ao mesmo tempo a conta do capital mínimo considera para um robô escolhido, no
 * texto pequeno debaixo do nome dele: "até 36 entradas abertas ao mesmo tempo"; com mais de 1 contrato por
 * entrada, quantos contratos isso dá ("até 36 entradas abertas ao mesmo tempo (72 contratos)"). Sem
 * operação acompanhada ao vivo não há medição, e o texto diz isso em vez de afirmar "1 entrada".
 */
export function entradasEmPalavras(r: { entradas: number; medidas: boolean; contratos: number; contratosAbertos: number }): string {
  if (!r.medidas) return "entradas ao mesmo tempo não medidas, a conta considera 1";
  const base = r.entradas > 1 ? `até ${formatarNumero(r.entradas)} entradas abertas ao mesmo tempo` : "1 entrada aberta por vez";
  return r.contratos > 1 ? `${base} (${contratos(r.contratosAbertos)})` : base;
}

export interface DadosDaResposta {
  semaforo: Semaforo;
  /** o capital da simulação, inteiro em R$ */
  capital: number;
  /** false = ninguém digitou capital e a simulação usa o capital mínimo da escolha */
  digitado: boolean;
  /** ResultadoSimulacao.capitalMinimo: null quando algum robô escolhido não tem garantia cadastrada */
  capitalMinimo: number | null;
  capitalMinimoConhecido: number;
  capitalQueFalta: number;
  /** contratosEmPalavras(…, true): "1 contrato por entrada em cada um dos 3 robôs" */
  escolha: string;
  /** nomes dos robôs escolhidos sem garantia cadastrada */
  semMinimo: readonly string[];
}

export interface RespostaDoSimulador {
  /** "minimo" = sem capital digitado: o título é o próprio capital mínimo, não um veredito */
  estado: Semaforo | "minimo";
  titulo: string;
  frase: string;
}

const TITULO_DO_SEMAFORO: Record<Semaforo, string> = { cabe: "Cabe", apertado: "Apertado", nao_cabe: "Não cabe" };

/**
 * A resposta que abre a tela (25/11/2026, DESIGN.md seção 9: "cabe, apertado ou não cabe" vem antes da
 * curva e dos números), em uma palavra e uma frase clara com os números que decidem: o capital, o capital
 * mínimo dos robôs e contratos escolhidos e, quando não cabe, quanto falta. A regra mora em semaforoDe
 * (lib/stats/simulador); aqui só se escreve a frase, na mesma ordem das regras. A maior queda em R$ e em %
 * do capital fica ao lado do resultado e por isso a frase cita só o limite.
 *
 * Sem capital digitado a simulação usa o capital mínimo: o título passa a ser esse número (o veredito de um
 * valor que ninguém digitou confundiria) e a frase diz como a conta fica com ele.
 */
export function respostaDoSimulador(d: DadosDaResposta): RespostaDoSimulador {
  const brl = (v: number) => formatarBRL(v, { inteiro: true });
  const limite = formatarPct(LIMITE_APERTADO, 0);
  const semGarantia =
    d.semMinimo.length > 0
      ? ` Sem garantia cadastrada: ${d.semMinimo.join(", ")}; ${d.capitalMinimoConhecido > 0 ? "a soma dos outros vale como piso" : "só a maior queda decide"}.`
      : "";

  if (!d.digitado && d.capitalMinimo !== null) {
    const comEle =
      d.semaforo === "apertado"
        ? `e com ele a maior queda do período passou de ${limite} do capital: fica apertado`
        : d.semaforo === "cabe"
          ? `e com ele a maior queda do período ficou dentro de ${limite} do capital`
          : "e a maior queda do período o teria consumido inteiro";
    return {
      estado: "minimo",
      titulo: `Capital mínimo de ${brl(d.capitalMinimo)}`,
      frase: `Para ${d.escolha}. Sem capital digitado, a simulação usa esse valor, ${comEle}.`,
    };
  }

  const um = d.capital === 1;
  // o piso que o capital precisa cobrir: o total ou, sem ele, a parte conhecida
  const piso = d.capitalMinimo ?? d.capitalMinimoConhecido;
  const qualMinimo = d.capitalMinimo !== null ? "o capital mínimo para estes robôs e contratos" : "o capital mínimo dos robôs com garantia cadastrada";
  let frase: string;
  if (d.semaforo === "nao_cabe") {
    frase =
      d.capital < piso
        ? `${brl(d.capital)} ${um ? "fica" : "ficam"} abaixo de ${brl(piso)}, ${qualMinimo}. ${d.capitalQueFalta === 1 ? "Falta" : "Faltam"} ${brl(d.capitalQueFalta)}.`
        : `A maior queda do período teria consumido ${um ? `${brl(d.capital)} inteiro` : `os ${brl(d.capital)} inteiros`}.`;
  } else {
    const queda = d.semaforo === "apertado" ? `mas a maior queda do período passou de ${limite} do capital` : `e a maior queda do período ficou dentro de ${limite} do capital`;
    if (piso <= 0) {
      frase = d.semaforo === "apertado" ? `A maior queda do período passou de ${limite} do capital.` : `A maior queda do período ficou dentro de ${limite} do capital.`;
    } else if (d.capital === piso) {
      frase = `${brl(d.capital)} ${um ? "é" : "são"} exatamente ${qualMinimo}, ${queda}.`;
    } else {
      frase = `${brl(d.capital)} ${um ? "cobre" : "cobrem"} ${qualMinimo}, ${brl(piso)}, ${queda}.`;
    }
  }
  return { estado: d.semaforo, titulo: TITULO_DO_SEMAFORO[d.semaforo], frase: `${frase}${semGarantia}` };
}

/** Quantos pares cabem na frase dos robôs que andam juntos; os outros viram "e mais N pares". */
export const MAXIMO_DE_PARES_NA_FRASE = 3;

/**
 * A nota dos robôs que andam juntos (lib/stats/simulador, paresQueAndamJuntos), com os números: "Apollo e
 * Orion ganharam ou perderam no mesmo dia em 114 de 131 pregões: usar os dois ao mesmo tempo soma o risco em
 * vez de dividir." Com mais de um par, um depois do outro e a conclusão no fim. Vazio sem par.
 */
export function fraseAndamJuntos(pares: ReadonlyArray<{ a: string; b: string; mesmoSentido: number; diasEmComum: number }>): string {
  if (pares.length === 0) return "";
  const emQuantos = (p: { mesmoSentido: number; diasEmComum: number }) => `em ${formatarNumero(p.mesmoSentido)} de ${pregoes(p.diasEmComum)}`;
  const [primeiro, ...resto] = pares;
  const comeco = `${primeiro.a} e ${primeiro.b} ganharam ou perderam no mesmo dia ${emQuantos(primeiro)}`;
  if (resto.length === 0) return `${comeco}: usar os dois ao mesmo tempo soma o risco em vez de dividir.`;
  const citados = resto.slice(0, MAXIMO_DE_PARES_NA_FRASE - 1).map((p) => `${p.a} e ${p.b}, ${emQuantos(p)}`);
  const sobra = pares.length - 1 - citados.length;
  const mais = sobra > 0 ? `; e mais ${sobra === 1 ? "1 par" : `${formatarNumero(sobra)} pares`}` : "";
  return `${comeco}; ${citados.join("; ")}${mais}. Usar ao mesmo tempo robôs que andam juntos soma o risco em vez de dividir.`;
}

/** O período em palavras: "nos últimos 12 meses", "em 2026", "desde 2 de janeiro de 2024" (o primeiro pregão da simulação). */
export function quandoEmPalavras(periodo: PeriodoSimulador, primeiroDia: string | null, hoje: string): string {
  switch (periodo) {
    case "3m":
      return "nos últimos 3 meses";
    case "12m":
      return "nos últimos 12 meses";
    case "ano":
      return `em ${hoje.slice(0, 4)}`;
    case "tudo":
      return primeiroDia ? `desde ${formatarDataLonga(primeiroDia)}` : "";
  }
}

/** Quantos dias depois do começo do período o histórico ainda pode começar sem a frase trocar "nos últimos 12 meses" por "desde…". */
const FOLGA_DO_PERIODO = 31;

/**
 * O período da simulação com o tamanho do histórico (DESIGN.md, seção 9: todo resultado diz de quanto
 * histórico saiu): "desde 3 de janeiro de 2018 (8 anos e 10 meses, 1.995 pregões)", "nos últimos 12 meses
 * (241 pregões)", "em 2026 (220 pregões)". Quando os robôs escolhidos só têm histórico de bem depois do
 * começo do período pedido (um robô de 9 meses visto em "12 meses"), a frase diz desde quando há dados, com
 * o tempo, em vez de afirmar o período inteiro. Vazio sem pregão.
 */
export function historicoEmPalavras(
  periodo: PeriodoSimulador,
  primeiroDia: string | null,
  ultimoDia: string | null,
  nDias: number,
  hoje: string,
): string {
  if (!primeiroDia || !ultimoDia || nDias <= 0) return "";
  const inicio = inicioPeriodo(periodo, hoje);
  const comecaDepois = inicio !== null && primeiroDia > somarDias(inicio, FOLGA_DO_PERIODO);
  if (periodo === "tudo" || comecaDepois) {
    return `desde ${formatarDataLonga(primeiroDia)} (${tempoEmPalavras(primeiroDia, ultimoDia)}, ${pregoes(nDias)})`;
  }
  return `${quandoEmPalavras(periodo, primeiroDia, hoje)} (${pregoes(nDias)})`;
}

/**
 * O tamanho do histórico de um robô quando ele é curto: menos de 12 meses do primeiro ao último pregão
 * ("9 meses"). Nulo com 12 meses ou mais, ou sem pregão. É o que a linha do robô diz no simulador (DESIGN.md,
 * seção 9: indicador de histórico curto diz o tamanho do histórico): somado a um robô de anos, o de meses
 * some dentro do "desde 2018" da premissa.
 */
export function historicoCurto(dias: ReadonlyArray<readonly [dia: string, valor: number]>): string | null {
  if (dias.length === 0) return null;
  const primeiro = dias[0][0];
  const ultimo = dias[dias.length - 1][0];
  return ultimo < somarMeses(primeiro, 12) ? tempoEmPalavras(primeiro, ultimo) : null;
}

/** "14/09 a 16/09/2026"; com a virada do ano no meio, as duas datas inteiras; no mesmo dia, uma data só. */
export function intervaloDeDatas(de: string, ate: string): string {
  if (de === ate) return formatarData(ate);
  return de.slice(0, 4) === ate.slice(0, 4) ? `${formatarDataCurta(de)} a ${formatarData(ate)}` : `${formatarData(de)} a ${formatarData(ate)}`;
}
