// As cores das imagens geradas no servidor (prévias OG do robô e da casa, e a imagem do dia para compartilhar),
// num lugar só desde 24/09/2026. São as mesmas cores dos tokens do tema escuro (globals.css): a imagem não lê
// CSS. Desde 13/10/2026, o mídia kit da Zeve: fundo marinho, acento azul #0059FF e o verde e o vermelho fortes
// do resultado.

import type { TomCard } from "@/lib/stats/card-do-dia";

export const FUNDO = "#050915";
export const TEXTO = "#f3f6fc";
export const MUDO = "#98a2b5";
export const ACENTO = "#0059ff";
export const POSITIVO = "#22c55e";
export const NEGATIVO = "#ef4444";
/** a linha do zero (PROFIT.zero) */
export const ZERO = "#3a4560";

export const COR_DO_TOM: Readonly<Record<TomCard, string>> = { positivo: POSITIVO, negativo: NEGATIVO, neutro: MUDO };

/** a cor() das prévias: v > 0 POSITIVO, v < 0 NEGATIVO, senão MUDO (comparação exata, sem tolerância) */
export function corDoResultado(v: number): string {
  return v > 0 ? POSITIVO : v < 0 ? NEGATIVO : MUDO;
}
