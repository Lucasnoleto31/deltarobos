// As cores das imagens geradas no servidor (prévias OG do robô e da casa, e a imagem do dia para compartilhar),
// num lugar só desde 24/09/2026. São as mesmas cores dos tokens do tema escuro (globals.css): a imagem não lê
// CSS. O acento é o verde da Quants (19/09/2026, no lugar do dourado); o verde e o vermelho do resultado são os
// de sempre da cor() das prévias.

import type { TomCard } from "@/lib/stats/card-do-dia";

export const FUNDO = "#0a0a0b";
export const TEXTO = "#f8f5ef";
export const MUDO = "#aca496";
export const ACENTO = "#00ff88";
export const POSITIVO = "#53b86f";
export const NEGATIVO = "#e8594b";
/** a linha do zero (PROFIT.zero) */
export const ZERO = "#4d4d4d";

export const COR_DO_TOM: Readonly<Record<TomCard, string>> = { positivo: POSITIVO, negativo: NEGATIVO, neutro: MUDO };

/** a cor() das prévias: v > 0 POSITIVO, v < 0 NEGATIVO, senão MUDO (comparação exata, sem tolerância) */
export function corDoResultado(v: number): string {
  return v > 0 ? POSITIVO : v < 0 ? NEGATIVO : MUDO;
}
