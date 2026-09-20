// As duas séries da curva de capital (por dia e por operação), prontas para o desenho: posição no eixo,
// acumulado, drawdown e a dica de cada ponto. Arquivo sem "use client" de propósito: a visão geral do
// robô monta a série por operação no servidor e manda para o navegador só os 240 pontos do desenho, em
// vez das dezenas de milhares de operações, e só os números deles (SerieCompacta). Os números vêm das funções da lib (curvaAcumulada,
// curvaPorOperacao, valorOperacao); aqui só se decide onde cada ponto cai e o que a dica diz.

import { formatarBRL, formatarData, formatarDataCurta, formatarNumero, formatarPct, formatarPontos } from "@/lib/formato";
import { curvaPorOperacao, hora as horaDaOperacao, type OperacaoCompacta } from "@/lib/stats/operacoes";
import { curvaAcumulada } from "@/lib/stats/serie";
import type { LinhaDiaria, OpcoesSerie, PontoCurva } from "@/lib/stats/tipos";
import { tomDe, type ConteudoDaDica } from "./base";
import type { PontoDoDesenho } from "./CurvaProfit";

// acima disso a barra do drawdown viraria um fio de menos de 3 px: cada fatia vira uma coluna
const MAX_COLUNAS = 240;

/** Onde começa e onde termina (exclusivo) a fatia `k` de uma lista de `n` itens dividida em no máximo `max`. */
function limitesDaFatia(k: number, n: number, max = MAX_COLUNAS): [number, number] {
  if (n <= max) return [k, k + 1];
  const tamanho = n / max;
  const de = Math.floor(k * tamanho);
  return [de, Math.max(de + 1, Math.floor((k + 1) * tamanho))];
}

/** Divide a lista em no máximo `max` fatias de tamanho parecido, em ordem. */
function fatiar<T>(itens: T[], max = MAX_COLUNAS): T[][] {
  return Array.from({ length: Math.min(itens.length, max) }, (_, k) => itens.slice(...limitesDaFatia(k, itens.length, max)));
}

const soma = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

function formatador(o: OpcoesSerie) {
  return (v: number) =>
    o.unidade === "brl" ? formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 }) : `${formatarPontos(v, true)} pts`;
}

function diaDaSemana(dia: string): string {
  return new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
}

/** "14/09 a 16/09/2026"; com a virada do ano no meio, as duas datas inteiras. */
function intervaloDeDatas(de: string, ate: string): string {
  return de.slice(0, 4) === ate.slice(0, 4) ? `${formatarDataCurta(de)} a ${formatarData(ate)}` : `${formatarData(de)} a ${formatarData(ate)}`;
}

/** "205ª", "1.234ª": a ordem da operação, com o ponto de milhar. */
const ordinal = (k: number) => `${formatarNumero(k)}ª`;

const linhaDoDrawdown = (dd: number, fmt: (v: number) => string) =>
  ({ rotulo: "Drawdown", valor: dd < 0 ? fmt(dd) : "no topo", tom: dd < 0 ? ("negativo" as const) : ("neutro" as const) });

export interface SeriePorDia {
  pontos: PontoDoDesenho[];
  /** os dias da série, em ordem: a série por operação usa a mesma divisão do eixo */
  dias: string[];
  curva: PontoCurva[];
}

/** Um ponto por dia de pregão (ou por fatia de dias, em série longa), com operações e acerto do dia na leitura. */
export function seriePorDia(linhas: readonly LinhaDiaria[], opcoes: OpcoesSerie): SeriePorDia {
  const curva = curvaAcumulada(linhas, opcoes);
  const fmt = formatador(opcoes);
  const doDia = new Map(linhas.map((l) => [l.dia, l]));
  const n = curva.length;

  const brutos = curva.map((p, i) => ({
    ...p,
    posicao: (i + 1) / n,
    nOps: doDia.get(p.dia)?.n_operacoes ?? 0,
    nGain: doDia.get(p.dia)?.n_gain ?? 0,
  }));

  const pontos = fatiar(brutos).map((fatia): PontoDoDesenho => {
    const primeiro = fatia[0];
    const ultimo = fatia[fatia.length - 1];
    const valor = soma(fatia.map((p) => p.valor));
    const drawdown = fatia.reduce((m, p) => Math.min(m, p.drawdown), 0);
    const nOps = soma(fatia.map((p) => p.nOps));
    const nGain = soma(fatia.map((p) => p.nGain));
    const umDia = fatia.length === 1;
    // 19/09/2026: o ponto que junta dias diz quantos e quais; "Neste trecho" não se entendia
    const cabecalho = umDia
      ? { titulo: formatarData(ultimo.dia), subtitulo: diaDaSemana(ultimo.dia) }
      : { titulo: `${formatarNumero(fatia.length)} dias (${intervaloDeDatas(primeiro.dia, ultimo.dia)})` };
    const dica: ConteudoDaDica = {
      ...cabecalho,
      linhas: [
        { rotulo: "Resultado", valor: fmt(valor), tom: tomDe(valor) },
        ...(nOps > 0
          ? [{ rotulo: "Operações", valor: `${formatarNumero(nOps)} · ${formatarPct(nGain / nOps, 0)} de acerto` }]
          : []),
        { rotulo: "Acumulado", valor: fmt(ultimo.acumulado), tom: tomDe(ultimo.acumulado) },
        linhaDoDrawdown(drawdown, fmt),
      ],
    };
    return { posicao: ultimo.posicao, acumulado: ultimo.acumulado, drawdown, dica, eixo: formatarData(ultimo.dia) };
  });

  return { pontos, dias: curva.map((p) => p.dia), curva };
}

/**
 * Um ponto da série por operação só com números, na ordem: posição no eixo, acumulado, drawdown, valor
 * da fatia, índice (em `SerieCompacta.dias`) do primeiro e do último dia da fatia e, só quando a fatia
 * é de uma operação, a hora de abertura. O número das operações não vai: sai da posição do ponto e do
 * total, pela mesma divisão em fatias.
 */
export type PontoCompacto =
  | [number, number, number, number, number, number]
  | [number, number, number, number, number, number, number];

/**
 * A série por operação como a visão geral manda para o navegador (18/09/2026): antes cada um dos 240
 * pontos levava a dica já escrita, e as quatro séries eram 54% do HTML da página. Agora vão os números
 * e o navegador escreve a dica com as mesmas funções (expandirSerie).
 */
export interface SerieCompacta {
  /** os dias que as dicas citam, uma vez cada */
  dias: string[];
  /** quantas operações a série tem: o "de N" da dica */
  total: number;
  pontos: PontoCompacto[];
}

/**
 * Um ponto por operação (ou por fatia de operações). Cada dia ocupa a mesma largura que tem na série por
 * dia e as operações se espalham dentro do dia delas: trocar o agrupamento só acrescenta ou tira o sobe
 * e desce de dentro do dia, sem mudar o resto do gráfico. O drawdown aqui é operação a operação, por
 * isso pode passar do drawdown por dia, que só olha o fechamento.
 *
 * Com `arredondar` (o que a página serializa), a posição vai com 5 casas (fração de 240 colunas, muito
 * abaixo de um pixel) e o dinheiro com 2, mas só quando o número arredondado escreve a mesma coisa na
 * dica, com o mesmo tom; senão vai inteiro. Sem arredondar, é a base de seriePorOperacao.
 */
export function seriePorOperacaoCompacta(
  ops: readonly OperacaoCompacta[],
  opcoes: OpcoesSerie,
  dias: readonly string[],
  { arredondar = true }: { arredondar?: boolean } = {},
): SerieCompacta {
  if (ops.length === 0) return { dias: [], total: 0, pontos: [] };
  const fmt = formatador(opcoes);
  const curva = curvaPorOperacao(ops, opcoes);
  const total = curva.length;

  const indiceDoDia = new Map(dias.map((d, k) => [d, k]));
  const opsNoDia = new Map<string, number>();
  for (const p of curva) opsNoDia.set(p.dia, (opsNoDia.get(p.dia) ?? 0) + 1);
  // se alguma operação for de um dia fora da série diária, os pontos se espalham por igual
  const casam = dias.length > 0 && curva.every((p) => indiceDoDia.has(p.dia));

  let pico = 0;
  let diaAtual = "";
  let noDia = 0;
  const brutos = curva.map((p, i) => {
    if (p.dia !== diaAtual) {
      diaAtual = p.dia;
      noDia = 0;
    }
    noDia += 1;
    pico = Math.max(pico, p.acumulado);
    const posicao = casam
      ? ((indiceDoDia.get(p.dia) ?? 0) + noDia / (opsNoDia.get(p.dia) ?? 1)) / dias.length
      : (i + 1) / total;
    return {
      dia: p.dia,
      hora: horaDaOperacao(ops[i]),
      valor: p.acumulado - (i > 0 ? curva[i - 1].acumulado : 0),
      acumulado: p.acumulado,
      drawdown: Math.min(0, p.acumulado - pico),
      posicao,
    };
  });

  const posicaoEnxuta = (v: number) => (arredondar ? Math.round(v * 1e5) / 1e5 : v);
  const dinheiroEnxuto = (v: number) => {
    if (!arredondar) return v;
    const r = Math.round(v * 100) / 100;
    if (r === v) return r;
    // resíduo em volta de número redondo (múltiplo de R$ 0,05) vai inteiro: é ele que decide o fundo da
    // escala do drawdown e o "2,0 mil" contra "2 mil" do eixo, que não passam pela dica
    if (Math.round(r * 100) % 5 === 0) return v;
    return fmt(r) === fmt(v) && tomDe(r) === tomDe(v) ? r : v;
  };

  const diasCitados: string[] = [];
  const indiceCitado = new Map<string, number>();
  const citar = (dia: string) => {
    let k = indiceCitado.get(dia);
    if (k === undefined) {
      k = diasCitados.push(dia) - 1;
      indiceCitado.set(dia, k);
    }
    return k;
  };

  const pontos = fatiar(brutos).map((fatia): PontoCompacto => {
    const primeiro = fatia[0];
    const ultimo = fatia[fatia.length - 1];
    const valor = soma(fatia.map((p) => p.valor));
    const drawdown = fatia.reduce((m, p) => Math.min(m, p.drawdown), 0);
    const numeros: [number, number, number, number, number, number] = [
      posicaoEnxuta(ultimo.posicao),
      dinheiroEnxuto(ultimo.acumulado),
      dinheiroEnxuto(drawdown),
      dinheiroEnxuto(valor),
      citar(primeiro.dia),
      citar(ultimo.dia),
    ];
    return fatia.length === 1 ? [...numeros, ultimo.hora] : numeros;
  });

  return { dias: diasCitados, total, pontos };
}

/**
 * Os pontos do desenho a partir da série compacta, com a leitura de cada um escrita aqui. Desde
 * 19/09/2026 o ponto que junta operações diz quantas e quais ("3 operações (205ª a 207ª)") em vez de
 * "Neste trecho", e o da operação única diz a ordem dela. Na série de um dia só (a do calendário) a
 * etiqueta da mira no eixo de baixo é a ordem, como o eixo; nas outras, a data.
 */
export function expandirSerie(serie: SerieCompacta, opcoes: OpcoesSerie): PontoDoDesenho[] {
  const fmt = formatador(opcoes);
  const { dias, total } = serie;
  return serie.pontos.map(([posicao, acumulado, drawdown, valor, iDe, iAte, hora], k): PontoDoDesenho => {
    // o número das operações de cada ponto sai da mesma divisão em fatias que montou a série
    const [de, ate] = limitesDaFatia(k, total);
    const uma = ate - de === 1;
    const diaDe = dias[iDe];
    const diaAte = dias[iAte];
    const dica: ConteudoDaDica = {
      titulo: uma
        ? `${formatarData(diaAte)} · aberta às ${hora}h`
        : diaDe === diaAte
          ? formatarData(diaAte)
          : intervaloDeDatas(diaDe, diaAte),
      subtitulo: uma ? `${ordinal(ate)} operação` : `${formatarNumero(ate - de)} operações (${ordinal(de + 1)} a ${ordinal(ate)})`,
      linhas: [
        { rotulo: "Resultado", valor: fmt(valor), tom: tomDe(valor) },
        { rotulo: "Acumulado", valor: fmt(acumulado), tom: tomDe(acumulado) },
        linhaDoDrawdown(drawdown, fmt),
      ],
    };
    return { posicao, acumulado, drawdown, dica, eixo: dias.length === 1 ? ordinal(ate) : formatarData(diaAte) };
  });
}

/** A série por operação já com as leituras e sem arredondar: a do calendário e a da curva que recebe as operações. */
export function seriePorOperacao(
  ops: readonly OperacaoCompacta[],
  opcoes: OpcoesSerie,
  dias: readonly string[],
): PontoDoDesenho[] {
  return expandirSerie(seriePorOperacaoCompacta(ops, opcoes, dias, { arredondar: false }), opcoes);
}

/** Datas espaçadas por igual no eixo de baixo: cada rótulo marca o começo do dia dele, igual nos dois agrupamentos. */
export function rotulosDeData(dias: readonly string[], quantas = 8): Array<{ x: number; rotulo: string }> {
  const n = dias.length;
  if (n === 0) return [];
  const periodo = (new Date(dias[n - 1]).getTime() - new Date(dias[0]).getTime()) / 86_400_000;
  // período longo: mês e ano ("09/26"); "12/09" sozinho não diz de que ano é
  const rotular = (dia: string) => (periodo > 400 ? `${dia.slice(5, 7)}/${dia.slice(2, 4)}` : formatarDataCurta(dia));
  const marcas = Array.from({ length: Math.min(quantas, n) }, (_, i) => {
    const f = i / Math.min(quantas, n);
    return { x: f * 100, rotulo: rotular(dias[Math.min(n - 1, Math.floor(f * n))]) };
  });
  return marcas.filter((m, i) => i === 0 || m.rotulo !== marcas[i - 1].rotulo);
}
