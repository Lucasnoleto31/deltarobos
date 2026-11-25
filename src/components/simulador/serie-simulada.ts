// O que o desenho e a premissa do simulador precisam além da conta (lib/stats/simulador): onde a maior queda
// fica na curva e as frases que acompanham o número grande. Sem "use client": funções puras, testáveis, que o
// painel chama no navegador.
//
// 25/11/2026 (ficha Mesa): a curva simulada passou a ser a do GraficoResultado, a mesma da página inicial
// (linha fina, a maior queda em vermelho na própria linha, a leitura do pregão apontado no número grande).
// Até então este arquivo fatiava a série para o DesenhoDaCurva, no estilo do Profit, e escrevia a dica de
// cada ponto; o gráfico novo desenha um ponto por pregão e não tem dica flutuante.

import type { QuedaDoGrafico } from "@/components/graficos/GraficoResultado";
import { formatarData, formatarDataCurta, formatarDataLonga, formatarNumero } from "@/lib/formato";
import type { PeriodoSimulador, PontoSimulado } from "@/lib/stats/simulador";
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

/**
 * Os contratos da simulação em palavras, para a premissa do número: "1 contrato em cada um dos 3 robôs",
 * "2 contratos no Apollo", "2 contratos no Apollo e 1 no Orion". `totalDeRobos` é quantos robôs a tela
 * oferece: quando nem todos entraram, a frase diz "robôs escolhidos".
 */
export function contratosEmPalavras(escolhidos: ReadonlyArray<{ nome: string; contratos: number }>, totalDeRobos: number): string {
  if (escolhidos.length === 0) return "";
  if (escolhidos.length === 1) return `${contratos(escolhidos[0].contratos)} no ${escolhidos[0].nome}`;
  const n = escolhidos[0].contratos;
  if (escolhidos.every((e) => e.contratos === n)) {
    const quais = escolhidos.length === totalDeRobos ? "robôs" : "robôs escolhidos";
    return `${contratos(n)} em cada um dos ${formatarNumero(escolhidos.length)} ${quais}`;
  }
  const partes = escolhidos.map((e, i) => `${i === 0 ? contratos(e.contratos) : formatarNumero(e.contratos)} no ${e.nome}`);
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
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

/** "14/09 a 16/09/2026"; com a virada do ano no meio, as duas datas inteiras; no mesmo dia, uma data só. */
export function intervaloDeDatas(de: string, ate: string): string {
  if (de === ate) return formatarData(ate);
  return de.slice(0, 4) === ate.slice(0, 4) ? `${formatarDataCurta(de)} a ${formatarData(ate)}` : `${formatarData(de)} a ${formatarData(ate)}`;
}
