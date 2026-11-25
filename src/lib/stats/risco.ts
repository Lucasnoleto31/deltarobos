import { mepMenDoDia, temMedicaoEA, type ExposicaoDoDia } from "./exposicao";
import {
  diaRuimTipico,
  quedaAtual,
  resultadoPorMes,
  resumirMeses,
  type DiaValor,
  type QuedaAtual,
  type ResumoDosMeses,
} from "./indicadores-robo";
import { diffDias } from "./periodos";
import { ganhoPorQueda } from "./serie-casa";
import type { LinhaDiaria, PontoCurva } from "./tipos";

/**
 * As contas da aba "Quedas e risco" do robô. Desde a revisão de 25/11/2026 (DESIGN.md, seção 9) a aba
 * responde a "quanto posso perder e quanto capital preciso?": a maior queda por dentro, os dias ruins e a
 * conta do capital mínimo por extenso. Saíram da tela, e daqui, o Calmar, o índice de úlcera, o risco de
 * ruína, o retorno anualizado, o tempo abaixo do topo em fração e a distribuição por profundidade: ninguém
 * mais os usava. A regra do capital mínimo mora em ./kpis (capitalMinimoRecomendado) e quem a aplica a um
 * robô é src/lib/consultas/capital.ts.
 *
 * Usados fora da aba: episodiosDrawdown e resumoDiario (./simulador) e contaDoCapital (página Como funciona).
 */

// ---------------------------------------------------------------------------------------------------------
// A curva e as quedas
// ---------------------------------------------------------------------------------------------------------

/**
 * A curva do resultado (acumulado, topo e distância do topo em cada pregão) a partir dos pregões já
 * reduzidos a data e valor, em ordem de data. A partida, em zero, conta como topo: é a mesma conta de
 * curvaAcumulada (./serie), sem depender da linha do banco, para a tela mandar ao navegador só data e valor.
 */
export function curvaDosDias(dias: ReadonlyArray<DiaValor>): PontoCurva[] {
  let acumulado = 0;
  let pico = 0;
  return dias.map((d) => {
    acumulado += d.valor;
    if (acumulado > pico) pico = acumulado;
    return { dia: d.dia, valor: d.valor, acumulado, pico, drawdown: acumulado - pico };
  });
}

export interface EpisodioDrawdown {
  /** último dia no pico antes da queda */
  inicio: string;
  fundo: string;
  /** primeiro dia de volta ao pico; null = ainda em recuperação */
  recuperacao: string | null;
  /** magnitude (positiva) */
  valor: number;
  diasAteFundo: number;
  diasAteRecuperar: number | null;
}

/** Os N maiores drawdowns da curva, do maior pro menor. `limite` Infinity = todos. */
export function episodiosDrawdown(curva: readonly PontoCurva[], limite = 5): EpisodioDrawdown[] {
  const episodios: EpisodioDrawdown[] = [];
  if (curva.length === 0) return episodios;

  let ultimoPico = curva[0].dia;
  let emQueda = false;
  let inicio = ultimoPico;
  let fundo = ultimoPico;
  let menor = 0;

  for (const p of curva) {
    if (p.drawdown < 0) {
      if (!emQueda) {
        emQueda = true;
        inicio = ultimoPico;
        fundo = p.dia;
        menor = p.drawdown;
      } else if (p.drawdown < menor) {
        menor = p.drawdown;
        fundo = p.dia;
      }
    } else {
      if (emQueda) {
        episodios.push({
          inicio,
          fundo,
          recuperacao: p.dia,
          valor: Math.abs(menor),
          diasAteFundo: diffDias(inicio, fundo),
          diasAteRecuperar: diffDias(inicio, p.dia),
        });
        emQueda = false;
      }
      ultimoPico = p.dia;
    }
  }

  if (emQueda) {
    episodios.push({
      inicio,
      fundo,
      recuperacao: null,
      valor: Math.abs(menor),
      diasAteFundo: diffDias(inicio, fundo),
      diasAteRecuperar: null,
    });
  }

  const ordenados = episodios.sort((a, b) => b.valor - a.valor);
  return Number.isFinite(limite) ? ordenados.slice(0, limite) : ordenados;
}

// ---------------------------------------------------------------------------------------------------------
// Os dias ruins
// ---------------------------------------------------------------------------------------------------------

export interface SequenciaDePerdas {
  /** quantos pregões seguidos terminaram com perda */
  dias: number;
  /** o primeiro e o último pregão da sequência */
  de: string;
  ate: string;
  /** a soma dos resultados desses pregões (negativa) */
  soma: number;
}

/**
 * A maior sequência de pregões seguidos com perda: quantos foram, de quando a quando e quanto somaram.
 * Pregão que fecha em zero interrompe (a mesma regra de resumoDiario); entre duas sequências do mesmo
 * tamanho fica a que perdeu mais. Nulo quando nenhum pregão terminou com perda.
 */
export function maiorSequenciaDePerdas(dias: ReadonlyArray<DiaValor>): SequenciaDePerdas | null {
  let maior: SequenciaDePerdas | null = null;
  let atual: SequenciaDePerdas | null = null;
  for (const d of dias) {
    if (d.valor < 0) {
      atual = atual
        ? { dias: atual.dias + 1, de: atual.de, ate: d.dia, soma: atual.soma + d.valor }
        : { dias: 1, de: d.dia, ate: d.dia, soma: d.valor };
      if (maior === null || atual.dias > maior.dias || (atual.dias === maior.dias && atual.soma < maior.soma)) maior = atual;
    } else {
      atual = null;
    }
  }
  return maior;
}

export interface PiorMomento {
  /** o ponto mais baixo que o resultado de um dia alcançou, em R$ com 1 contrato por entrada, já com custos (negativo) */
  valor: number;
  dia: string;
  /** quando foi (ISO), se a medição traz o horário */
  em: string | null;
  /** com quanto esse pregão fechou: a distância entre o meio do dia e o fim dele */
  fechamento: number;
  /** em quantos pregões da série houve medição: o número só vale para eles */
  pregoesMedidos: number;
  /** o coletor não acompanhou esse dia inteiro: pode ter sido mais fundo */
  parcial: boolean;
}

/**
 * O pior momento dentro de um pregão, entre os dias que o coletor mediu a cada movimento do preço, com a
 * operação aberta (o fechamento do dia esconde o quanto ele chegou a ficar no prejuízo). Cada dia passa
 * por mepMenDoDia, que desconta o custo das operações já fechadas até o extremo.
 *
 * Só contam os pregões que estão na série pública (`dias`): uma medição de um dia sem resultado publicado
 * não teria com o que ser conferida na aba Dia a dia. Nulo sem medição, ou quando nenhum pregão medido
 * ficou no negativo: aí a tela não mostra a linha.
 */
export function piorMomentoMedido(
  exposicoes: ReadonlyArray<ExposicaoDoDia>,
  dias: ReadonlyArray<DiaValor>,
  custoPorContrato: number,
  valorPonto: number,
): PiorMomento | null {
  const fechamentos = new Map(dias.map((d) => [d.dia, d.valor]));
  let pior: Omit<PiorMomento, "pregoesMedidos"> | null = null;
  let pregoesMedidos = 0;
  for (const e of exposicoes) {
    const fechamento = fechamentos.get(e.dia);
    if (fechamento === undefined || !temMedicaoEA(e)) continue;
    const medido = mepMenDoDia(e, custoPorContrato, valorPonto, "liquido", "brl");
    if (!medido) continue;
    pregoesMedidos += 1;
    if (medido.men < 0 && (pior === null || medido.men < pior.valor)) {
      pior = { valor: medido.men, dia: e.dia, em: medido.menEm, fechamento, parcial: medido.parcial };
    }
  }
  return pior ? { ...pior, pregoesMedidos } : null;
}

// ---------------------------------------------------------------------------------------------------------
// A folga por operação
// ---------------------------------------------------------------------------------------------------------

export interface ResultadoPorOperacao {
  operacoes: number;
  /** resultado médio de uma operação, em R$ com 1 contrato, já com o custo */
  resultado: number;
  /** o custo médio que foi descontado de cada operação (0 = histórico sem custo) */
  custo: number;
}

/**
 * Resultado médio por operação e o custo que já está nele: a folga do robô contra um custo maior ou um
 * preço de execução pior na conta de quem usa. Nulo sem operação.
 */
export function resultadoPorOperacao(
  linhas: ReadonlyArray<Pick<LinhaDiaria, "resultado_brl_por_contrato" | "custos_brl_por_contrato" | "n_operacoes">>,
): ResultadoPorOperacao | null {
  let operacoes = 0;
  let bruto = 0;
  let custos = 0;
  for (const l of linhas) {
    operacoes += l.n_operacoes;
    bruto += l.resultado_brl_por_contrato;
    custos += l.custos_brl_por_contrato;
  }
  if (operacoes <= 0) return null;
  return { operacoes, resultado: (bruto - custos) / operacoes, custo: custos / operacoes };
}

// ---------------------------------------------------------------------------------------------------------
// A leitura inteira da aba
// ---------------------------------------------------------------------------------------------------------

export interface RiscoDoRobo {
  pregoes: number;
  primeiroDia: string | null;
  ultimoDia: string | null;
  /** o resultado desde o início */
  resultado: number;
  /** a maior queda de todo o histórico (positiva; 0 = o resultado nunca recuou) */
  maiorQueda: number;
  /** a maior queda com as datas e as durações, ou nulo se o resultado nunca recuou */
  maior: EpisodioDrawdown | null;
  /** as outras quedas, da maior para a menor */
  outras: EpisodioDrawdown[];
  /** em quantos pregões o resultado estava abaixo do ponto mais alto já alcançado */
  diasAbaixoDoTopo: number;
  /** quanto está abaixo do topo no último pregão */
  atual: QuedaAtual;
  /** a perda que só 1 em cada 20 pregões superou (negativa), ou nulo com poucos pregões */
  diaRuim: number | null;
  /** o pregão de menor resultado, ou nulo se nenhum terminou com perda */
  piorDia: DiaValor | null;
  /** os meses do histórico, com o pior e o melhor */
  meses: ResumoDosMeses;
  sequencia: SequenciaDePerdas | null;
  /**
   * quanto ganhou para cada R$ 1 da maior queda (ganhoPorQueda de ./serie-casa, a mesma conta que ordena a
   * lista de robôs); nulo quando o resultado não é positivo ou quando nunca houve queda
   */
  ganhoPorQueda: number | null;
}

/**
 * Tudo o que a aba "Quedas e risco" mostra sobre o histórico inteiro do robô, a partir dos pregões em ordem
 * de data (R$, 1 contrato por entrada, já com custos). Risco não tem período: a maior queda daqui é a mesma
 * que entra na conta do capital mínimo (src/lib/consultas/capital.ts).
 */
export function riscoDoRobo(dias: ReadonlyArray<DiaValor>): RiscoDoRobo {
  const curva = curvaDosDias(dias);
  const episodios = episodiosDrawdown(curva, Infinity);
  const maior = episodios[0] ?? null;
  const resultado = curva.length > 0 ? curva[curva.length - 1].acumulado : 0;
  const maiorQueda = maior?.valor ?? 0;
  let piorDia: DiaValor | null = null;
  for (const d of dias) {
    if (d.valor < 0 && (piorDia === null || d.valor < piorDia.valor)) piorDia = { dia: d.dia, valor: d.valor };
  }
  return {
    pregoes: dias.length,
    primeiroDia: dias[0]?.dia ?? null,
    ultimoDia: dias[dias.length - 1]?.dia ?? null,
    resultado,
    maiorQueda,
    maior,
    outras: episodios.slice(1),
    diasAbaixoDoTopo: curva.filter((p) => p.drawdown < 0).length,
    atual: quedaAtual(dias),
    diaRuim: diaRuimTipico(dias.map((d) => d.valor)),
    piorDia,
    meses: resumirMeses(resultadoPorMes(dias)),
    sequencia: maiorSequenciaDePerdas(dias),
    ganhoPorQueda: ganhoPorQueda(resultado, maiorQueda).valor,
  };
}

// ---------------------------------------------------------------------------------------------------------
// A conta do capital, por extenso
// ---------------------------------------------------------------------------------------------------------

export interface ContaDoCapital {
  /** garantia (margem) por contrato x entradas abertas ao mesmo tempo, em R$ inteiros */
  garantia: number;
  /** maior queda x fator de segurança, em R$ inteiros: o que falta da garantia até o capital mínimo */
  folga: number;
  /** o capital mínimo publicado */
  total: number;
  /** que parte do capital mínimo a maior queda representa (0 a 1); nulo sem queda */
  quedaNoCapital: number | null;
  /** o capital com que a maior queda ficaria no limite pedido da conta; nulo quando o mínimo já basta */
  capitalNoLimite: number | null;
}

/**
 * Quanto capital é preciso para a maior queda ficar em `limite` da conta (0,25 = um quarto), em R$
 * inteiros, arredondado para cima. Nulo sem queda ou com limite fora de (0, 1].
 */
export function capitalParaAQuedaCaber(maiorQueda: number, limite: number): number | null {
  if (!(maiorQueda > 0) || !(limite > 0) || limite > 1) return null;
  return Math.ceil(maiorQueda / limite);
}

/**
 * As parcelas do capital mínimo para a tela escrever a conta: garantia + folga = total, sempre fechando
 * em R$ inteiros (a folga é o que sobra do total publicado depois da garantia, e difere de maior queda x
 * fator só pelo arredondamento). O total não é recalculado: é o capitalMinimo que capitalDoRobo publica,
 * para a aba mostrar o mesmo número das outras telas. `limite` é a parte da conta que a maior queda pode
 * levar sem o capital ficar "apertado" (LIMITE_APERTADO do simulador). Nulo sem margem cadastrada.
 */
export function contaDoCapital(
  c: { capitalMinimo: number | null; margem: number | null; entradas: number; maiorQueda: number },
  limite: number,
): ContaDoCapital | null {
  if (c.capitalMinimo === null || c.margem === null) return null;
  const total = c.capitalMinimo;
  const garantia = Math.round(c.margem * Math.max(1, c.entradas));
  const noLimite = capitalParaAQuedaCaber(c.maiorQueda, limite);
  return {
    garantia,
    folga: total - garantia,
    total,
    quedaNoCapital: c.maiorQueda > 0 && total > 0 ? c.maiorQueda / total : null,
    capitalNoLimite: noLimite !== null && noLimite > total ? noLimite : null,
  };
}

// ---------------------------------------------------------------------------------------------------------
// O resumo dos dias, que o simulador usa
// ---------------------------------------------------------------------------------------------------------

export interface ResumoDiario {
  nDias: number;
  diasNegativos: number;
  /** 0..1 */
  fracaoNegativa: number;
  maiorSequenciaNegativa: number;
  /** desvio padrão do resultado diário */
  volatilidade: number;
  /** média de dias corridos até recuperar, nos episódios recuperados */
  recuperacaoMediaDias: number | null;
  episodiosRecuperados: number;
}

export function resumoDiario(curva: readonly PontoCurva[], episodios: readonly EpisodioDrawdown[]): ResumoDiario {
  const n = curva.length;
  let neg = 0;
  let seq = 0;
  let maiorSeq = 0;
  let soma = 0;
  for (const p of curva) {
    soma += p.valor;
    if (p.valor < 0) {
      neg += 1;
      seq += 1;
      if (seq > maiorSeq) maiorSeq = seq;
    } else {
      seq = 0;
    }
  }
  const media = n > 0 ? soma / n : 0;
  const variancia = n > 1 ? curva.reduce((s, p) => s + (p.valor - media) ** 2, 0) / (n - 1) : 0;
  const recuperados = episodios.filter((e) => e.diasAteRecuperar !== null);
  return {
    nDias: n,
    diasNegativos: neg,
    fracaoNegativa: n > 0 ? neg / n : 0,
    maiorSequenciaNegativa: maiorSeq,
    volatilidade: Math.sqrt(variancia),
    recuperacaoMediaDias:
      recuperados.length > 0
        ? recuperados.reduce((s, e) => s + (e.diasAteRecuperar ?? 0), 0) / recuperados.length
        : null,
    episodiosRecuperados: recuperados.length,
  };
}
