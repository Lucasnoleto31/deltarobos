// As cores das imagens geradas no servidor (prévias OG do robô e da casa, e a imagem do dia para compartilhar),
// num lugar só desde 24/09/2026. São os tokens do tema escuro da ficha Mesa (25/11/2026, globals.css), escritos
// em hexadecimal porque a imagem não lê CSS: fundo quase preto, texto, apoio e terceiro nível em cinzas frios,
// o fio de 1 px e o verde e o vermelho do resultado. O verde da marca (ACENTO) fica só no símbolo.

import type { TomCard } from "@/lib/stats/card-do-dia";

/** --background */
export const FUNDO = "#0a0b0d";
/** --border: o fio de 1 px que separa os blocos */
export const FIO = "#1a1d23";
/** --foreground */
export const TEXTO = "#eceef1";
/** --muted-foreground: o texto de apoio */
export const MUDO = "#9aa1ac";
/** --sutil: o terceiro nível (rótulo, data, nota) */
export const SUTIL = "#7b828e";
/** --marca: só no símbolo */
export const ACENTO = "#00ff88";
/** --positivo e --negativo: só em número de ganho e de perda */
export const POSITIVO = "#33c58a";
export const NEGATIVO = "#f0625f";
/** --alerta: dia ainda em andamento, conta demo */
export const ALERTA = "#f0a431";
/** --input (o fio forte): a linha do zero do gráfico */
export const ZERO = "#2b3039";

export const COR_DO_TOM: Readonly<Record<TomCard, string>> = { positivo: POSITIVO, negativo: NEGATIVO, neutro: MUDO };

/** a cor() das prévias: v > 0 POSITIVO, v < 0 NEGATIVO, senão MUDO (comparação exata, sem tolerância) */
export function corDoResultado(v: number): string {
  return v > 0 ? POSITIVO : v < 0 ? NEGATIVO : MUDO;
}

/**
 * Um valor em R$ já formatado ("+R$ 1.131,00") em dois pedaços, o sinal com a moeda e os algarismos, para o
 * número grande das imagens sair como o do site: "+R$" mais apagado e os algarismos na cor do texto; negativo,
 * vermelho inteiro. Sem algarismo (texto como "Em breve"), o primeiro pedaço vem vazio.
 */
export function partesDoValor(texto: string): [string, string] {
  const corte = texto.search(/\d/);
  return corte <= 0 ? ["", texto] : [texto.slice(0, corte).trim(), texto.slice(corte)];
}
