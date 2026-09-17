// As duas séries da curva de capital (por dia e por operação), prontas para o desenho: posição no eixo,
// acumulado, drawdown e a dica de cada ponto. Arquivo sem "use client" de propósito: a visão geral do
// robô monta a série por operação no servidor e manda para o navegador só os 240 pontos do desenho, em
// vez das dezenas de milhares de operações. Os números vêm das funções da lib (curvaAcumulada,
// curvaPorOperacao, valorOperacao); aqui só se decide onde cada ponto cai e o que a dica diz.

import { formatarBRL, formatarData, formatarDataCurta, formatarNumero, formatarPct, formatarPontos } from "@/lib/formato";
import { curvaPorOperacao, hora as horaDaOperacao, type OperacaoCompacta } from "@/lib/stats/operacoes";
import { curvaAcumulada } from "@/lib/stats/serie";
import type { LinhaDiaria, OpcoesSerie, PontoCurva } from "@/lib/stats/tipos";
import { tomDe, type ConteudoDaDica } from "./base";
import type { PontoDoDesenho } from "./CurvaProfit";

// acima disso a barra do drawdown viraria um fio de menos de 3 px: cada fatia vira uma coluna
const MAX_COLUNAS = 240;

/** Divide a lista em no máximo `max` fatias de tamanho parecido, em ordem. */
function fatiar<T>(itens: T[], max = MAX_COLUNAS): T[][] {
  if (itens.length <= max) return itens.map((i) => [i]);
  const tamanho = itens.length / max;
  return Array.from({ length: max }, (_, k) => {
    const de = Math.floor(k * tamanho);
    return itens.slice(de, Math.max(de + 1, Math.floor((k + 1) * tamanho)));
  });
}

const soma = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

function formatador(o: OpcoesSerie) {
  return (v: number) =>
    o.unidade === "brl" ? formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 }) : `${formatarPontos(v, true)} pts`;
}

function diaDaSemana(dia: string): string {
  return new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
}

const linhaDoDrawdown = (dd: number, fmt: (v: number) => string) =>
  ({ rotulo: "Drawdown", valor: dd < 0 ? fmt(dd) : "no topo", tom: dd < 0 ? ("negativo" as const) : ("neutro" as const) });

export interface SeriePorDia {
  pontos: PontoDoDesenho[];
  /** os dias da série, em ordem: a série por operação usa a mesma divisão do eixo */
  dias: string[];
  curva: PontoCurva[];
}

/** Um ponto por dia de pregão (ou por fatia de dias, em série longa), com operações e acerto do dia na dica. */
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
    const dica: ConteudoDaDica = {
      titulo: umDia ? formatarData(ultimo.dia) : `${formatarData(primeiro.dia)} a ${formatarData(ultimo.dia)}`,
      subtitulo: umDia ? diaDaSemana(ultimo.dia) : `${fatia.length} dias de pregão`,
      linhas: [
        { rotulo: umDia ? "No dia" : "Neste trecho", valor: fmt(valor), tom: tomDe(valor) },
        ...(nOps > 0
          ? [{ rotulo: "Operações", valor: `${formatarNumero(nOps)} · ${formatarPct(nGain / nOps, 0)} de acerto` }]
          : []),
        { rotulo: "Acumulado", valor: fmt(ultimo.acumulado), tom: tomDe(ultimo.acumulado) },
        linhaDoDrawdown(drawdown, fmt),
      ],
    };
    return { posicao: ultimo.posicao, acumulado: ultimo.acumulado, drawdown, dica };
  });

  return { pontos, dias: curva.map((p) => p.dia), curva };
}

/**
 * Um ponto por operação (ou por fatia de operações). Cada dia ocupa a mesma largura que tem na série por
 * dia e as operações se espalham dentro do dia delas: trocar o agrupamento só acrescenta ou tira o sobe
 * e desce de dentro do dia, sem mudar o resto do gráfico. O drawdown aqui é operação a operação, por
 * isso pode passar do drawdown por dia, que só olha o fechamento.
 */
export function seriePorOperacao(
  ops: readonly OperacaoCompacta[],
  opcoes: OpcoesSerie,
  dias: readonly string[],
): PontoDoDesenho[] {
  if (ops.length === 0) return [];
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
      ordem: p.indice,
      hora: horaDaOperacao(ops[i]),
      valor: p.acumulado - (i > 0 ? curva[i - 1].acumulado : 0),
      acumulado: p.acumulado,
      drawdown: Math.min(0, p.acumulado - pico),
      posicao,
    };
  });

  return fatiar(brutos).map((fatia): PontoDoDesenho => {
    const primeiro = fatia[0];
    const ultimo = fatia[fatia.length - 1];
    const valor = soma(fatia.map((p) => p.valor));
    const drawdown = fatia.reduce((m, p) => Math.min(m, p.drawdown), 0);
    const uma = fatia.length === 1;
    const dica: ConteudoDaDica = {
      titulo: uma
        ? `${formatarData(ultimo.dia)} · aberta às ${ultimo.hora}h`
        : primeiro.dia === ultimo.dia
          ? formatarData(ultimo.dia)
          : `${formatarData(primeiro.dia)} a ${formatarData(ultimo.dia)}`,
      subtitulo: uma
        ? `Operação ${formatarNumero(ultimo.ordem)} de ${formatarNumero(total)}`
        : `Operações ${formatarNumero(primeiro.ordem)} a ${formatarNumero(ultimo.ordem)} de ${formatarNumero(total)}`,
      linhas: [
        { rotulo: uma ? "Na operação" : "Neste trecho", valor: fmt(valor), tom: tomDe(valor) },
        { rotulo: "Acumulado", valor: fmt(ultimo.acumulado), tom: tomDe(ultimo.acumulado) },
        linhaDoDrawdown(drawdown, fmt),
      ],
    };
    return { posicao: ultimo.posicao, acumulado: ultimo.acumulado, drawdown, dica };
  });
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
