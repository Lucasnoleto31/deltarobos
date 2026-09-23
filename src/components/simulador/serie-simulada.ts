// A curva do simulador pronta para o desenho (DesenhoDaCurva de CurvaProfit), espelhando seriePorDia de
// series-da-curva.ts: até PONTOS_LEVE fatias, posição no eixo, acumulado 0-based (o zero do desenho É o
// capital inicial; o eixo rotula capital + v), drawdown mínimo da fatia e a leitura de cada ponto. Sem
// "use client": função pura, testável, que o CurvaSimulada chama no navegador.

import { formatarBRL, formatarData, formatarDataCurta, formatarNumero, formatarPct } from "@/lib/formato";
import type { PontoSimulado } from "@/lib/stats/simulador";
import { tomDe, type ConteudoDaDica, type Tom } from "@/components/graficos/base";
import type { PontoDoDesenho } from "@/components/graficos/CurvaProfit";
import { fatiar, PONTOS_LEVE, rotulosDeData } from "@/components/graficos/series-da-curva";

export interface SerieSimuladaDesenho {
  pontos: PontoDoDesenho[];
  /** os dias da série, em ordem */
  dias: string[];
  rotulosX: Array<{ x: number; rotulo: string }>;
}

const fmt = (v: number) => formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });

function diaDaSemana(dia: string): string {
  return new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
}

/** "14/09 a 16/09/2026"; com a virada do ano no meio, as duas datas inteiras (igual a series-da-curva). */
function intervaloDeDatas(de: string, ate: string): string {
  return de.slice(0, 4) === ate.slice(0, 4) ? `${formatarDataCurta(de)} a ${formatarData(ate)}` : `${formatarData(de)} a ${formatarData(ate)}`;
}

/** A linha do drawdown na dica: em R$ e em % do capital inicial (sem capital válido, só em R$). */
function linhaDoDrawdown(dd: number, capital: number): { rotulo: string; valor: string; tom: Tom } {
  if (dd >= 0) return { rotulo: "Drawdown", valor: "no topo", tom: "neutro" };
  const pct = capital > 0 ? ` · ${formatarPct(-dd / capital, 1)}` : "";
  return { rotulo: "Drawdown", valor: `${fmt(dd)}${pct}`, tom: "negativo" };
}

/** Os pontos do desenho da curva simulada: um por dia de pregão, ou por fatia de dias em série longa. */
export function pontosDaSimulacao(serie: readonly PontoSimulado[], capital: number): SerieSimuladaDesenho {
  const n = serie.length;
  const dias = serie.map((p) => p.dia);
  if (n === 0) return { pontos: [], dias, rotulosX: [] };

  const indexados = serie.map((p, i) => ({ ...p, posicao: (i + 1) / n }));

  const pontos = fatiar(indexados, PONTOS_LEVE).map((fatia): PontoDoDesenho => {
    const primeiro = fatia[0];
    const ultimo = fatia[fatia.length - 1];
    let valor = 0;
    let drawdown = 0;
    for (const p of fatia) {
      valor += p.valor;
      if (p.drawdown < drawdown) drawdown = p.drawdown;
    }
    const umDia = fatia.length === 1;
    const cabecalho = umDia
      ? { titulo: formatarData(ultimo.dia), subtitulo: diaDaSemana(ultimo.dia) }
      : { titulo: `${formatarNumero(fatia.length)} dias (${intervaloDeDatas(primeiro.dia, ultimo.dia)})` };
    const dica: ConteudoDaDica = {
      ...cabecalho,
      linhas: [
        { rotulo: "Patrimônio", valor: formatarBRL(ultimo.patrimonio, { inteiro: true }), tom: "neutro" },
        { rotulo: umDia ? "Resultado" : "Resultado da fatia", valor: fmt(valor), tom: tomDe(valor) },
        { rotulo: "Acumulado", valor: fmt(ultimo.acumulado), tom: tomDe(ultimo.acumulado) },
        linhaDoDrawdown(drawdown, capital),
      ],
    };
    return { posicao: ultimo.posicao, acumulado: ultimo.acumulado, drawdown, dica, eixo: formatarData(ultimo.dia) };
  });

  return { pontos, dias, rotulosX: rotulosDeData(dias) };
}
