import { diffDias } from "./periodos";
import type { Drawdown, LinhaDiaria, OpcoesSerie, PontoCurva } from "./tipos";

/**
 * Valor de um dia nas unidades pedidas.
 * Pontos líquidos = pontos - custos / valor do ponto.
 */
export function valorDia(l: LinhaDiaria, o: OpcoesSerie): number {
  const contratos = o.contratos ?? 1;
  const custos = o.base === "liquido" ? l.custos_brl_por_contrato : 0;
  if (o.unidade === "pontos") {
    const custosEmPontos = o.valorPonto > 0 ? custos / o.valorPonto : 0;
    return (l.pontos_por_contrato - custosEmPontos) * contratos;
  }
  return (l.resultado_brl_por_contrato - custos) * contratos;
}

export function ordenarPorDia<T extends { dia: string }>(linhas: readonly T[]): T[] {
  return [...linhas].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
}

/** Curva de capital acumulada dia a dia, com pico e drawdown em cada ponto. */
export function curvaAcumulada(linhas: readonly LinhaDiaria[], o: OpcoesSerie): PontoCurva[] {
  let acumulado = 0;
  let pico = 0;
  return ordenarPorDia(linhas).map((l) => {
    const valor = valorDia(l, o);
    acumulado += valor;
    if (acumulado > pico) pico = acumulado;
    return { dia: l.dia, valor, acumulado, pico, drawdown: acumulado - pico };
  });
}

/** Drawdown máximo da curva: magnitude, início, fundo e recuperação. */
export function drawdownMaximo(curva: readonly PontoCurva[]): Drawdown {
  const vazio: Drawdown = {
    valor: 0,
    inicio: null,
    fundo: null,
    recuperacao: null,
    diasAteRecuperar: null,
  };
  if (curva.length === 0) return vazio;

  let iFundo = -1;
  let menor = 0;
  curva.forEach((p, i) => {
    if (p.drawdown < menor) {
      menor = p.drawdown;
      iFundo = i;
    }
  });
  if (iFundo < 0) return vazio;

  const picoValor = curva[iFundo].pico;

  // início: último dia antes do fundo em que a curva estava no pico
  let inicio = curva[0].dia;
  for (let i = iFundo; i >= 0; i--) {
    if (curva[i].acumulado >= picoValor) {
      inicio = curva[i].dia;
      break;
    }
  }

  // recuperação: primeiro dia depois do fundo em que a curva volta ao pico
  let recuperacao: string | null = null;
  for (let i = iFundo + 1; i < curva.length; i++) {
    if (curva[i].acumulado >= picoValor) {
      recuperacao = curva[i].dia;
      break;
    }
  }

  return {
    valor: Math.abs(menor),
    inicio,
    fundo: curva[iFundo].dia,
    recuperacao,
    diasAteRecuperar: recuperacao ? diffDias(inicio, recuperacao) : null,
  };
}

/** Soma dos valores de um conjunto de linhas nas unidades pedidas. */
export function somaPeriodo(linhas: readonly LinhaDiaria[], o: OpcoesSerie): number {
  let total = 0;
  for (const l of linhas) total += valorDia(l, o);
  return total;
}
