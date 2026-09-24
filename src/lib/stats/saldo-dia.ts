// A série do saldo do dia medida pelo EA DeltaReporter 1.1.2 (23/09/2026, Lucas: "quero ver de fato o que o
// robô passou de 'calor' até pagar, quero que mostre a real curva dele em todas as telas"). Até aqui a curva do
// dia era por fechamento (um degrau por operação fechada) e nunca mostrava a posição aberta oscilando. Agora o
// coletor fecha, a cada InpSaldoBucketSeg (padrão 5 s), um BALDE com o mínimo, o máximo e o último valor do
// saldo do dia (realizado + flutuante), em R$ BRUTOS por 1 contrato, já com as regras públicas aplicadas
// (migration 0024: tabela saldo_intradiario, view saldo_dia_publico, evento realtime "saldo").
//
// Aqui ficam as contas puras que a rota, o hook e as telas usam: fundir baldes (o mais recente é ATUALIZADO
// depois de gravado), bruto → líquido pelo custo de cada fechamento, reduzir a série para o desenho, o eixo do
// tempo (a janela do pregão), o MEP/MEN da própria série, os fechamentos sobre a linha, os dentes de MFE/MAE das
// curvas por operação, o estado inicial do "Hoje ao vivo" e a legenda. Sem React, sem banco e sem relógio: o
// instante sempre chega por parâmetro (os testes fixam as datas).

import { formatarHora, formatarNumero } from "@/lib/formato";
import type { BaldeCompacto, EventoSaldo, FechamentoCompacto, SaldoDiaPublico, SaldoDoDia } from "@/lib/tipos";
import { brlParaPontos } from "./normalizacao";
import type { HorarioPregao } from "./pregao";
import type { Base, Unidade } from "./tipos";

/** teto de pontos desenhados da série do dia (6.500 baldes a 5 s viram <= 1.500 grupos) */
export const PONTOS_SALDO = 1500;
/** tamanho do balde quando não dá para inferir (InpSaldoBucketSeg padrão do EA 1.1.2) */
export const BUCKET_SEG_PADRAO = 5;

/**
 * Brasília = UTC-3 sem horário de verão desde 2019 (mesma premissa de BRASILIA_OFFSET_SEG no EA). É a única premissa
 * de fuso fixa do front: a dica, a legenda e o dia usam Intl com America/Sao_Paulo (formatarHora, formatarHoraSeg,
 * hojeSP). Se o horário de verão voltar, o eixo daqui (epochBrasilia, rotulosDeHora) e o EA mudam juntos: aqui,
 * derivar o offset do dia por Intl (timeZoneName "longOffset" sobre `${dia}T12:00:00Z` dá "GMT-03:00") e deixar a
 * constante só de reserva; lá, BRASILIA_OFFSET_SEG (revisão de 23/09/2026: nada errado hoje, só o par que mudaria).
 */
export const OFFSET_BRASILIA_SEG = -3 * 3600;

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** "2026-09-23" + "09:00" (ou "09:00:00") → epoch UTC em segundos daquele instante em Brasília. NaN se ilegível. */
export function epochBrasilia(dia: string, hhmm: string): number {
  const d = RE_DIA.exec(dia);
  const h = RE_HORA.exec(hhmm);
  if (!d || !h) return Number.NaN;
  const comoSeFosseUtc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(h[1]), Number(h[2]), Number(h[3] ?? 0));
  // o relógio de parede de Brasília está 3 h atrás do UTC: 09:00 em Brasília é 12:00 UTC
  return comoSeFosseUtc / 1000 - OFFSET_BRASILIA_SEG;
}

/** A janela do eixo do tempo, em epoch segundos. */
export interface JanelaEpoch {
  inicio: number;
  fim: number;
}

/** O horário que dimensiona o eixo: o do robô quando cadastrado (horario_inicio/horario_fim), senão o do pregão do ativo. Campo a campo. */
export function horarioDaJanela(robo: { horario_inicio: string | null; horario_fim: string | null }, pregao: HorarioPregao): HorarioPregao {
  return { inicio: robo.horario_inicio || pregao.inicio, fim: robo.horario_fim || pregao.fim };
}

/**
 * Eixo = do início ao fim do horário do robô (ou do pregão), ESTICADO para conter todo balde e todo fechamento
 * (inicio = min(horário, 1º balde, 1º fechamento); fim = max(horário, último balde + bucketSeg, último fechamento)).
 * Fixo e não "do primeiro ao último balde" porque: ao vivo a curva cresce da esquerda para a direita como um gráfico
 * intradiário (o vazio à direita diz que o dia não acabou), 10:00 fica no mesmo x em todos os dias do calendário, e
 * os fechamentos e o MEP/MEN por hora caem no lugar sem recalcular a régua a cada balde. Garante fim > inicio
 * (fim = inicio + bucketSeg quando empatar).
 */
export function janelaDoDia(
  dia: string,
  horario: HorarioPregao,
  baldes: readonly BaldeCompacto[],
  bucketSeg: number,
  fechamentos: readonly FechamentoCompacto[] = [],
): JanelaEpoch {
  const passo = bucketSeg > 0 ? bucketSeg : BUCKET_SEG_PADRAO;
  let inicio = Number.POSITIVE_INFINITY;
  let fim = Number.NEGATIVE_INFINITY;
  const considerar = (de: number, ate: number) => {
    if (de < inicio) inicio = de;
    if (ate > fim) fim = ate;
  };
  const hInicio = epochBrasilia(dia, horario.inicio);
  const hFim = epochBrasilia(dia, horario.fim);
  if (Number.isFinite(hInicio)) considerar(hInicio, hInicio);
  if (Number.isFinite(hFim)) considerar(hFim, hFim);
  // sem supor ordem: o mínimo e o máximo de tudo o que há (custa nada mesmo com milhares de baldes)
  for (const b of baldes) considerar(b[0], b[0] + passo);
  for (const f of fechamentos) considerar(f[0], f[0]);
  if (!Number.isFinite(inicio)) inicio = 0;
  if (!(fim > inicio)) fim = inicio + passo;
  return { inicio, fim };
}

/** fração 0..1 de t na janela, presa às pontas */
export function posicaoNaJanela(t: number, janela: JanelaEpoch): number {
  const largura = janela.fim - janela.inicio;
  if (!(largura > 0)) return 0;
  return Math.min(1, Math.max(0, (t - janela.inicio) / largura));
}

/** Rótulos do eixo de baixo nas horas cheias de Brasília dentro da janela: { x: 0..100, rotulo: "09:00" }. Acima de 12 horas, uma sim outra não. */
export function rotulosDeHora(janela: JanelaEpoch): Array<{ x: number; rotulo: string }> {
  const rotulos: Array<{ x: number; rotulo: string }> = [];
  if (!(janela.fim > janela.inicio)) return rotulos;
  // hora cheia no relógio de Brasília: o epoch deslocado pelo fuso cai num múltiplo de 3.600
  const primeira = Math.ceil((janela.inicio + OFFSET_BRASILIA_SEG) / 3600) * 3600 - OFFSET_BRASILIA_SEG;
  // teto de segurança: uma janela absurda (dias) não pode virar milhares de rótulos
  for (let t = primeira; t <= janela.fim && rotulos.length < 100; t += 3600) {
    const local = t + OFFSET_BRASILIA_SEG;
    const hora = Math.floor((((local % 86400) + 86400) % 86400) / 3600);
    rotulos.push({ x: posicaoNaJanela(t, janela) * 100, rotulo: `${String(hora).padStart(2, "0")}:00` });
  }
  return janela.fim - janela.inicio > 12 * 3600 ? rotulos.filter((_, i) => i % 2 === 0) : rotulos;
}

/** Linha da view → balde compacto; null quando `em` não é data (ou algum valor não é número). t = Math.floor(Date.parse(em) / 1000). */
export function baldeDaLinha(
  l: Pick<SaldoDiaPublico, "em" | "min_brl_por_contrato" | "max_brl_por_contrato" | "ultimo_brl_por_contrato">,
): BaldeCompacto | null {
  const ms = Date.parse(l.em);
  if (!Number.isFinite(ms)) return null;
  // a linha vem de JSON (view pela rota, ou evento): o número passa por Number para um numeric serializado como texto não virar NaN silencioso
  const min = Number(l.min_brl_por_contrato);
  const max = Number(l.max_brl_por_contrato);
  const ultimo = Number(l.ultimo_brl_por_contrato);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(ultimo)) return null;
  return [Math.floor(ms / 1000), min, max, ultimo];
}

/** Evento "saldo" → baldes compactos válidos, em ordem de t (item ilegível é descartado). */
export function baldesDoEvento(evento: Pick<EventoSaldo, "baldes">): BaldeCompacto[] {
  const lista: BaldeCompacto[] = [];
  const itens: unknown[] = Array.isArray(evento.baldes) ? evento.baldes : [];
  for (const item of itens) {
    // o evento vem de fora: confere a forma em vez de confiar no tipo
    if (!item || typeof item !== "object") continue;
    const { em, min, max, ultimo } = item as Partial<EventoSaldo["baldes"][number]>;
    if (typeof em !== "string") continue;
    const balde = baldeDaLinha({
      em,
      min_brl_por_contrato: min as number,
      max_brl_por_contrato: max as number,
      ultimo_brl_por_contrato: ultimo as number,
    });
    if (balde) lista.push(balde);
  }
  return fundirBaldes([], lista);
}

/**
 * Upsert por t (o balde mais recente é ATUALIZADO depois de gravado): para t repetido min = menor dos dois,
 * max = maior dos dois, último = o de `novos` (o que chegou por último manda; a rota e o evento vêm os dois do
 * banco, e a janela em que uma foto de <= 15 s poderia regredir um "último" é fechada pelo evento seguinte).
 * Devolve lista nova, ordenada por t crescente, sem t repetido; não muta as entradas. fundirBaldes(x, []) devolve x.
 *
 * Limite conhecido (revisão de 23/09/2026), só com n_magics > 1, que hoje não existe (um magic por robô): o "último"
 * da view é a SOMA dos magics e muda quando o balde do segundo terminal chega depois; uma foto do CDN (até 30 s
 * velha) fundida DEPOIS do evento regride o "último" para a soma parcial, e nenhum evento posterior corrige, porque
 * o balde só é reemitido enquanto atualizado_em está nos últimos 30 s. Quando houver robô com dois magics medindo:
 * levar atualizado_em (epoch) na tupla e deixar o mais recente mandar. Com um magic o balde é imutável depois da
 * primeira gravação (o EA nunca reabre um t0), e nada disso acontece.
 */
export function fundirBaldes(atuais: readonly BaldeCompacto[], novos: readonly BaldeCompacto[]): BaldeCompacto[] {
  // nada novo: a mesma lista de volta (o estado do React não troca de referência à toa)
  if (novos.length === 0) return atuais as BaldeCompacto[];
  const porT = new Map<number, BaldeCompacto>();
  for (const b of atuais) porT.set(b[0], b);
  for (const n of novos) {
    const e = porT.get(n[0]);
    porT.set(n[0], e ? [n[0], Math.min(e[1], n[1]), Math.max(e[2], n[2]), n[3]] : n);
  }
  return [...porT.values()].sort((a, b) => a[0] - b[0]);
}

/** Menor diferença positiva entre t consecutivos; BUCKET_SEG_PADRAO com menos de 2 baldes. */
export function inferirBucketSeg(baldes: readonly BaldeCompacto[]): number {
  let menor = Number.POSITIVE_INFINITY;
  for (let i = 1; i < baldes.length; i++) {
    const d = baldes[i][0] - baldes[i - 1][0];
    if (d > 0 && d < menor) menor = d;
  }
  return Number.isFinite(menor) ? menor : BUCKET_SEG_PADRAO;
}

/** OperacaoPublica (ou qualquer objeto com fechamento_em e custos) → fechamentos compactos em ordem de t. */
export function fechamentosDasOperacoes(ops: ReadonlyArray<{ fechamento_em: string; custos_brl_por_contrato: number }>): FechamentoCompacto[] {
  const lista: FechamentoCompacto[] = [];
  for (const o of ops) {
    const ms = Date.parse(o.fechamento_em);
    if (!Number.isFinite(ms)) continue;
    lista.push([Math.floor(ms / 1000), Number.isFinite(o.custos_brl_por_contrato) ? o.custos_brl_por_contrato : 0]);
  }
  return lista.sort((a, b) => a[0] - b[0]);
}

export interface OpcoesLiquidar {
  base: Base;
  unidade: Unidade;
  valorPonto: number;
}

/**
 * Bruto → líquido, na unidade da curva: líquido(t) = bruto(t) − soma dos custos dos fechamentos ANTERIORES ao fim
 * do balde (tFechamento < t + bucketSeg). O balde é meio-aberto no EA ([t, t + bucketSeg), BaldeT0 = floor(t / seg)
 * × seg), então um fechamento exatamente em t + bucketSeg é do balde seguinte, e as amostras deste vieram todas antes
 * dele (revisão de 23/09/2026: a primeira versão descontava com <=, e uma saída alinhada ao múltiplo de 5 s pagava o
 * custo um balde cedo). Mesma ideia de mepMenDoDia (n_saidas × custo), mas com o custo gravado em cada operação.
 * base "bruto" não desconta nada. unidade "pontos" divide por valorPonto (brlParaPontos). Devolve a mesma forma
 * [t, min, max, ultimo], já convertida; não muta a entrada.
 */
export function liquidarSerie(
  baldes: readonly BaldeCompacto[],
  fechamentos: readonly FechamentoCompacto[],
  bucketSeg: number,
  opcoes: OpcoesLiquidar,
): BaldeCompacto[] {
  const converter = opcoes.unidade === "pontos" ? (v: number) => brlParaPontos(v, opcoes.valorPonto) : (v: number) => v;
  // os fechamentos em ordem de t com o custo acumulado até cada um: o custo até o fim de um balde é uma busca
  // binária, sem supor que os baldes cheguem em ordem
  const ordenados = opcoes.base === "liquido" ? [...fechamentos].sort((a, b) => a[0] - b[0]) : [];
  const acumulado: number[] = [];
  let soma = 0;
  for (const f of ordenados) {
    soma += f[1];
    acumulado.push(soma);
  }
  // o custo dos fechamentos ANTES de `t` (estrito: o fechamento em t já é do balde que começa em t)
  const custoAntesDe = (t: number): number => {
    let baixo = 0;
    let alto = ordenados.length;
    while (baixo < alto) {
      const meio = (baixo + alto) >> 1;
      if (ordenados[meio][0] < t) baixo = meio + 1;
      else alto = meio;
    }
    return baixo === 0 ? 0 : acumulado[baixo - 1];
  };
  const passo = bucketSeg > 0 ? bucketSeg : 0;
  return baldes.map(([t, min, max, ultimo]): BaldeCompacto => {
    const custo = custoAntesDe(t + passo);
    return [t, converter(min - custo), converter(max - custo), converter(ultimo - custo)];
  });
}

/**
 * [tInicio, min, max, ultimo, nBaldes, tUltimo]: um grupo de baldes vizinhos (nBaldes = 1 e tUltimo = tInicio quando
 * não houve redução). tUltimo é o início do último balde do grupo (revisão de 23/09/2026): o "último" é o valor DELE,
 * então é nele que o ponto se desenha; com 6.500 baldes em 1.500 grupos, desenhar no primeiro deixava cada vértice
 * até 20 s à esquerda do instante do valor e a linha terminava antes do fim real da série.
 */
export type BaldeReduzido = [number, number, number, number, number, number];
export type BaldeQualquer = BaldeCompacto | BaldeReduzido;

/**
 * Junta baldes vizinhos em no máximo `max` grupos contíguos (mesma divisão inteira de limitesDaFatia:
 * de = floor(k*n/max), ate = max(de+1, floor((k+1)*n/max))), guardando t do primeiro, min dos mínimos, max dos
 * máximos, último do último, quantos entraram e o t do último. n <= max devolve cada balde como grupo de 1.
 */
export function reduzirBaldes(baldes: readonly BaldeCompacto[], max: number): BaldeReduzido[] {
  const n = baldes.length;
  const teto = Math.max(1, Math.floor(max));
  if (n <= teto) return baldes.map((b): BaldeReduzido => [b[0], b[1], b[2], b[3], 1, b[0]]);
  const grupos: BaldeReduzido[] = [];
  for (let k = 0; k < teto; k++) {
    // só inteiros antes da divisão, como limitesDaFatia: `n / max` em ponto flutuante perdia o último item
    const de = Math.floor((k * n) / teto);
    const ate = Math.max(de + 1, Math.floor(((k + 1) * n) / teto));
    let menor = baldes[de][1];
    let maior = baldes[de][2];
    for (let i = de + 1; i < ate; i++) {
      if (baldes[i][1] < menor) menor = baldes[i][1];
      if (baldes[i][2] > maior) maior = baldes[i][2];
    }
    grupos.push([baldes[de][0], menor, maior, baldes[ate - 1][3], ate - de, baldes[ate - 1][0]]);
  }
  return grupos;
}

export interface MepMenDaSerie {
  mep: number;
  mepT: number | null;
  men: number;
  menT: number | null;
}

/**
 * O pico (maior max, >= 0) e o vale (menor min, <= 0) da série já líquida, com o t do PRIMEIRO balde que os bateu;
 * para conferir com exposicao_dia. Em BRUTO os dois batem (é o mesmo saldo do EA). Em LÍQUIDO podem diferir em um
 * custo por contrato quando a saída cai no mesmo balde do extremo (alvo ou stop batido e a saída logo em seguida, o
 * caso mais comum): aqui o custo entra no balde em que a saída aconteceu, o caminho líquido de verdade, e mepMenDoDia
 * desconta só as saídas ANTERIORES ao instante do extremo (n_saidas). Escolha registrada na revisão de 23/09/2026:
 * cada um mostra o número mais honesto da sua fonte, sem forçar um no outro; a Metodologia, a spec e o README dizem.
 */
export function mepMenDaSerie(baldes: ReadonlyArray<BaldeQualquer>): MepMenDaSerie {
  let mep = 0;
  let men = 0;
  let mepT: number | null = null;
  let menT: number | null = null;
  for (const b of baldes) {
    // "maior que" e não "maior ou igual": em empate vale o primeiro balde, como excursao faz por operação
    if (b[2] > mep) {
      mep = b[2];
      mepT = b[0];
    }
    if (b[1] < men) {
      men = b[1];
      menT = b[0];
    }
  }
  return { mep, mepT, men, menT };
}

export interface FechamentoNaCurva {
  posicao: number;
  valor: number;
}

/** O índice do último balde com início <= t numa lista em ordem de t (busca binária); -1 se t vem antes do primeiro. */
function indiceDoBaldeEm(baldes: ReadonlyArray<BaldeQualquer>, t: number): number {
  let baixo = 0;
  let alto = baldes.length;
  while (baixo < alto) {
    const meio = (baixo + alto) >> 1;
    if (baldes[meio][0] <= t) baixo = meio + 1;
    else alto = meio;
  }
  return baixo - 1;
}

/**
 * Um pontinho por fechamento: x pela janela; y = o "último" do último balde com tInicio <= tFechamento (o valor da
 * linha ali). Fechamento anterior ao primeiro balde (coletor subiu depois) não entra.
 */
export function fechamentosNaCurva(
  fechamentos: readonly FechamentoCompacto[],
  baldes: ReadonlyArray<BaldeQualquer>,
  janela: JanelaEpoch,
): FechamentoNaCurva[] {
  const saida: FechamentoNaCurva[] = [];
  if (baldes.length === 0) return saida;
  for (const [t] of fechamentos) {
    const i = indiceDoBaldeEm(baldes, t);
    if (i < 0) continue;
    saida.push({ posicao: posicaoNaJanela(t, janela), valor: baldes[i][3] });
  }
  return saida;
}

/** Quanto o primeiro balde pode vir depois do início da janela sem a legenda dizer "medido a partir de": um minuto (o rótulo é em HH:MM). */
export const TOLERANCIA_INICIO_SEG = 60;

/**
 * t do primeiro balde quando ele vem DEPOIS do primeiro fechamento do dia, ou mais de TOLERANCIA_INICIO_SEG depois
 * do início da janela (`janelaInicio`, o horário do robô ou do pregão): nos dois casos o coletor subiu com o dia em
 * andamento e a curva começa no meio do eixo. Senão null. O segundo caso é da revisão de 23/09/2026: sem fechamento
 * anterior a nota não aparecia, e um traçado que começa às 11:30 ficava sem explicação (hoje, o primeiro dia da 1.1.2,
 * e em todo reinício do coletor).
 */
export function inicioDaMedicao(baldes: ReadonlyArray<BaldeQualquer>, fechamentos: readonly FechamentoCompacto[], janelaInicio?: number): number | null {
  if (baldes.length === 0) return null;
  const t0 = baldes[0][0];
  let primeiroFechamento = Number.POSITIVE_INFINITY;
  for (const f of fechamentos) if (f[0] < primeiroFechamento) primeiroFechamento = f[0];
  if (t0 > primeiroFechamento) return t0;
  if (janelaInicio !== undefined && Number.isFinite(janelaInicio) && t0 > janelaInicio + TOLERANCIA_INICIO_SEG) return t0;
  return null;
}

// ── dentes de MFE/MAE ─────────────────────────────────────────────────────────
// A segunda metade de "em todas as telas" (23/09/2026): nas curvas POR OPERAÇÃO (o Hoje ao vivo sem série do
// EA, a aba Desempenho, a visão geral "Por operação", o calendário) o "calor" de cada operação, medido pelo EA
// 1.1.0 tick a tick (MFE/MAE em pontos por contrato, desde 22/09/2026), vira um traço vertical no ponto dela.

export interface DenteDoPonto {
  /** acumulado ANTES da operação + MAE convertido (<= acumulado antes) */
  de: number;
  /** acumulado antes + MFE convertido (>= acumulado antes) */
  ate: number;
  /** em pontos por contrato, para a dica ("+200 / -75 pts" por formatarMfeMae) */
  mfe: number;
  mae: number;
}
export type FaixaDoPonto = readonly [number, number];
/** O que a série do saldo e os dentes acrescentam a um PontoDoDesenho. B faz `PontoDoDesenho extends ExtrasDoPonto`. */
export interface ExtrasDoPonto {
  faixa?: FaixaDoPonto;
  dente?: DenteDoPonto;
}

export interface OperacaoParaDente {
  /** valor da operação na unidade da curva (o degrau que ela dá no acumulado) */
  valor: number;
  mfe: number | null;
  mae: number | null;
}
export interface OpcoesDente {
  unidade: Unidade;
  valorPonto: number;
  contratos?: number;
}

function numero(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Um dente por operação (null quando mfe e mae são null): acumulado antes = soma dos `valor` anteriores;
 * conversão pontos→curva: unidade "pontos" ⇒ × contratos; "brl" ⇒ × valorPonto × contratos. Só um dos dois medido ⇒
 * o outro conta 0 (como excursaoDaOperacao). O custo não entra no dente (só é pago no fechamento).
 */
export function dentesPorOperacao(ops: readonly OperacaoParaDente[], opcoes: OpcoesDente): Array<DenteDoPonto | null> {
  const contratos = opcoes.contratos ?? 1;
  const fator = (opcoes.unidade === "pontos" ? 1 : opcoes.valorPonto) * contratos;
  let antes = 0;
  return ops.map((op) => {
    const mfe = numero(op.mfe);
    const mae = numero(op.mae);
    const acumuladoAntes = antes;
    antes += op.valor;
    if (mfe === null && mae === null) return null;
    // `|| 0` também troca -0 por 0: o JSON da rota não distingue os dois, e a comparação da série antes e depois dele tem de bater
    const mfeV = mfe || 0;
    const maeV = mae || 0;
    // MFE é >= 0 e MAE <= 0 por definição; o min/max só garante o traço colado ao acumulado se vier algo estranho
    return {
      de: Math.min(acumuladoAntes, acumuladoAntes + maeV * fator),
      ate: Math.max(acumuladoAntes, acumuladoAntes + mfeV * fator),
      mfe: mfeV,
      mae: maeV,
    };
  });
}

/** Envelope de uma fatia: menor `de`, maior `ate`, maior mfe, menor mae; null se nenhum dente. */
export function envelopeDeDentes(dentes: ReadonlyArray<DenteDoPonto | null>): DenteDoPonto | null {
  let envelope: DenteDoPonto | null = null;
  for (const d of dentes) {
    if (!d) continue;
    envelope = envelope
      ? { de: Math.min(envelope.de, d.de), ate: Math.max(envelope.ate, d.ate), mfe: Math.max(envelope.mfe, d.mfe), mae: Math.min(envelope.mae, d.mae) }
      : { ...d };
  }
  return envelope;
}

// ── estado do "Hoje ao vivo" e legenda ────────────────────────────────────────

export interface SaldoHoje {
  baldes: BaldeCompacto[];
  aproximado: boolean;
  bucketSeg: number;
  /** a rota já respondeu 200 pelo menos uma vez nesta sessão (só então a série é desenhada) */
  carregado: boolean;
  /** última falha da rota, null quando ok */
  erro: string | null;
  /** ISO da última carga ou evento aplicado */
  atualizadoEm: string | null;
}

/** Estado inicial, o MESMO objeto no hook e no provider (constante para o inicializador não ter chave aninhada). */
export const SALDO_HOJE_VAZIO: SaldoHoje = { baldes: [], aproximado: false, bucketSeg: BUCKET_SEG_PADRAO, carregado: false, erro: null, atualizadoEm: null };

function ehTuplaNumerica(x: unknown, tamanho: number): boolean {
  return Array.isArray(x) && x.length === tamanho && x.every((v) => typeof v === "number" && Number.isFinite(v));
}

/** Confere a forma do JSON da rota (vem de fora), como mesmoRecorte faz com a curva. */
export function ehCorpoSaldoDoDia(x: unknown): x is SaldoDoDia {
  if (!x || typeof x !== "object") return false;
  const c = x as Partial<Record<keyof SaldoDoDia, unknown>>;
  return (
    typeof c.dia === "string" &&
    RE_DIA.test(c.dia) &&
    Array.isArray(c.baldes) &&
    c.baldes.every((b) => ehTuplaNumerica(b, 4)) &&
    typeof c.aproximado === "boolean" &&
    typeof c.bucketSeg === "number" &&
    c.bucketSeg > 0 &&
    Array.isArray(c.fechamentos) &&
    c.fechamentos.every((f) => ehTuplaNumerica(f, 2)) &&
    typeof c.geradoEm === "string"
  );
}

/**
 * "Saldo do dia medido no MT5 a cada 5 s (mín./máx. a cada intervalo) · fechamentos marcados" · aproximado troca o
 * parêntese por " · aproximado, sem faixa mín./máx." · comFechamentos=false tira " · fechamentos marcados" ·
 * medidoDesdeT acrescenta " · medido a partir de HH:MM" (formatarHora(new Date(t*1000))). "Intervalo", e não
 * "balde" (revisão de 23/09/2026): balde é jargão de implementação, e o glossário e a Metodologia falam em intervalo.
 */
export function legendaDoSaldo(o: { bucketSeg: number; aproximado: boolean; comFechamentos: boolean; medidoDesdeT: number | null }): string {
  let texto = `Saldo do dia medido no MT5 a cada ${o.bucketSeg} s`;
  texto += o.aproximado ? " · aproximado, sem faixa mín./máx." : " (mín./máx. a cada intervalo)";
  if (o.comFechamentos) texto += " · fechamentos marcados";
  if (o.medidoDesdeT !== null) texto += ` · medido a partir de ${formatarHora(new Date(o.medidoDesdeT * 1000))}`;
  return texto;
}

// ── a série do saldo do dia no desenho ─────────────────────────────────────────
// 24/09/2026 (Artur, com print do dia 23: "esse gráfico está estranho"): o coletor continua mandando o saldo
// depois do fechamento, até a meia-noite, e janelaDoDia estica o eixo até o último balde — o pregão ficava
// espremido em 40% da largura, o resto era linha reta e o cursor nascia em 23:59:25. Os 68 pontos brancos de
// fechamento viravam uma mancha em cima da linha, e a legenda dava duas linhas. As funções abaixo valem para o
// Hoje ao vivo, a tela cheia e o calendário, que montam a mesma curva.
// Movidas de series-da-curva em 24/09/2026: a imagem do dia (card-do-dia) monta a mesma curva sem importar
// componente (nenhum arquivo de src/lib importa de src/components). series-da-curva reexporta os três nomes.

/** folga do eixo antes do horário do robô e depois da última saída: dez minutos */
export const FOLGA_DO_EIXO_SEG = 10 * 60;

/**
 * Os baldes que entram no desenho: do início do horário do robô (menos a folga) até o maior entre o fim do
 * horário e o último fechamento do dia (mais a folga). O que o coletor manda depois disso, com o saldo parado,
 * fica de fora; nada de saldo se perde, porque depois da última saída ele não muda. Se o filtro não deixar
 * nenhum balde (horário cadastrado errado), vai tudo.
 */
export function baldesDoPregao<B extends readonly [number, ...unknown[]]>(
  baldes: readonly B[],
  dia: string,
  horario: HorarioPregao,
  fechamentos: ReadonlyArray<readonly [number, ...unknown[]]>,
): readonly B[] {
  const hIni = epochBrasilia(dia, horario.inicio);
  const hFim = epochBrasilia(dia, horario.fim);
  if (!Number.isFinite(hIni) || !Number.isFinite(hFim)) return baldes;
  let ultimaSaida = Number.NEGATIVE_INFINITY;
  for (const f of fechamentos) if (f[0] > ultimaSaida) ultimaSaida = f[0];
  const de = hIni - FOLGA_DO_EIXO_SEG;
  const ate = Math.max(hFim, ultimaSaida) + FOLGA_DO_EIXO_SEG;
  const uteis = baldes.filter((b) => b[0] >= de && b[0] <= ate);
  return uteis.length > 0 ? uteis : baldes;
}

/** A legenda curta da série ("a cada 5 s · desde 11:42"): o título já diz "medido no MT5", e a longa dava duas linhas. */
export function legendaCurtaDoSaldo(o: { bucketSeg: number; aproximado: boolean; medidoDesdeT: number | null }): string {
  return [
    `a cada ${formatarNumero(o.bucketSeg)} s`,
    ...(o.aproximado ? ["aproximado"] : []),
    ...(o.medidoDesdeT !== null ? [`desde ${formatarHora(new Date(o.medidoDesdeT * 1000))}`] : []),
  ].join(" · ");
}
