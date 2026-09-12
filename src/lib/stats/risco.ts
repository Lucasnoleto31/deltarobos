import { diffDias } from "./periodos";
import type { PontoCurva } from "./tipos";

export { capitalMinimoRecomendado } from "./kpis";

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

/** Os N maiores drawdowns da curva, do maior pro menor. */
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

  return episodios.sort((a, b) => b.valor - a.valor).slice(0, limite);
}
