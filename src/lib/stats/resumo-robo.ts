import { filtrarPeriodo, mesDe } from "./periodos";
import { curvaAcumulada, drawdownMaximo, ordenarPorDia, valorDia } from "./serie";
import type { LinhaDiaria, OpcoesSerie } from "./tipos";

/** Números do card do robô na home. */
export interface ResumoCardRobo {
  hoje: number;
  mes: number;
  acumulado: number;
  drawdownMaximo: number;
  /** acumulado dos últimos 30 dias, ponto a ponto */
  sparkline: number[];
  nDias: number;
  ultimoDia: string | null;
}

export function resumirCardRobo(
  linhas: readonly LinhaDiaria[],
  o: OpcoesSerie,
  hoje: string,
): ResumoCardRobo {
  const ordenadas = ordenarPorDia(linhas.filter((l) => l.dia <= hoje));
  const curva = curvaAcumulada(ordenadas, o);
  const mesAtual = mesDe(hoje);

  let hojeValor = 0;
  let mes = 0;
  for (const l of ordenadas) {
    const v = valorDia(l, o);
    if (l.dia === hoje) hojeValor += v;
    if (mesDe(l.dia) === mesAtual) mes += v;
  }

  const ultimos30 = filtrarPeriodo(ordenadas, "30d", hoje);

  return {
    hoje: hojeValor,
    mes,
    acumulado: curva.length > 0 ? curva[curva.length - 1].acumulado : 0,
    drawdownMaximo: drawdownMaximo(curva).valor,
    sparkline: curvaAcumulada(ultimos30, o).map((p) => p.acumulado),
    nDias: curva.length,
    ultimoDia: curva.length > 0 ? curva[curva.length - 1].dia : null,
  };
}
