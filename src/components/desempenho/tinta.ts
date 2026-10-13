/**
 * Célula tintada pelo resultado (13/10/2026, mídia kit da Zeve; pedido do Lucas: "mais cores, principalmente
 * valores positivos e negativos"). Vale para a casa do dia no calendário, o mês no mapa ano × mês, a célula do
 * mapa de faixas e o selo de estado das tabelas de risco: o fundo leva a cor do resultado e o número vai na
 * mesma cor, um tom mais fundo, para continuar legível em cima dela.
 *
 * Por que o texto não é o text-positivo puro: o verde do claro (#15803d) dá 5,0:1 sobre o branco, mas sobre
 * 12% dele mesmo cai para 4,3:1, e o vermelho (#dc2626) para 4,0:1. Misturado com a cor do texto da página
 * (quase preto no claro, quase branco no escuro), o tom escurece no claro e clareia no escuro, e passa de
 * 4,5:1 em toda a faixa de fundo usada aqui. Medido com os tokens do globals.css, no pior caso, que é o fundo
 * no teto (36%) sobre o cartão (no escuro, o topo do degradê do .painel, o trecho mais claro):
 *   verde     claro 5,4:1   escuro 5,1:1
 *   vermelho  claro 5,2:1   escuro 4,8:1
 *   laranja   claro 7,8:1   escuro 9,0:1 (a 12%, o selo)
 * A 40% o vermelho do escuro já fica em 4,5:1 e a 50% o verde cai para 3,8:1: por isso o teto. O texto
 * secundário da casa (dia do mês, "N op") vai na cor do texto a 85%, 6,3:1 ou mais nos dois temas.
 */

export type TomTinta = "positivo" | "negativo" | "alerta";

/** a força mínima e máxima da cor no fundo, em %, sobre o cartão */
export const PISO_TINTA = 10;
export const TETO_TINTA = 36;

/**
 * O fundo da célula: a cor do resultado de PISO_TINTA a TETO_TINTA por cento, pela força (0 a 1) que quem
 * chama mede (escalaDeForca de graficos/base, a régua do histórico inteiro).
 */
export function fundoTinta(tom: TomTinta, forca: number): string {
  const f = Number.isFinite(forca) ? Math.min(1, Math.max(0, forca)) : 0;
  const pct = PISO_TINTA + Math.round((TETO_TINTA - PISO_TINTA) * f);
  return `color-mix(in srgb, var(--${tom}) ${pct}%, transparent)`;
}

/** O texto na cor do resultado sobre o fundo tintado: 60% da cor e 40% da cor do texto da página. */
export const TEXTO_TINTA: Record<TomTinta, string> = {
  positivo: "text-[color-mix(in_srgb,var(--positivo)_60%,var(--foreground))]",
  negativo: "text-[color-mix(in_srgb,var(--negativo)_60%,var(--foreground))]",
  alerta: "text-[color-mix(in_srgb,var(--alerta)_60%,var(--foreground))]",
};

/** O fio da célula tintada: a mesma cor, mais fraca que o fundo no teto, para a casa ter borda até no piso. */
export const FIO_TINTA: Record<TomTinta, string> = {
  positivo: "ring-positivo/30",
  negativo: "ring-negativo/30",
  alerta: "ring-alerta/30",
};

/**
 * Selo de estado ("Aberto" no maior drawdown, a classe da faixa no detalhe): fundo a 12%, fio a 30% e o texto
 * da tinta. Chapado, sem seta nem ícone.
 */
export const SELO_TINTA: Record<TomTinta, string> = {
  positivo: `bg-positivo/12 ring-1 ring-inset ring-positivo/30 ${TEXTO_TINTA.positivo}`,
  negativo: `bg-negativo/12 ring-1 ring-inset ring-negativo/30 ${TEXTO_TINTA.negativo}`,
  alerta: `bg-alerta/12 ring-1 ring-inset ring-alerta/30 ${TEXTO_TINTA.alerta}`,
};

/** O tom do resultado pelo sinal; zero não tem tom (fica no cinza do site). */
export function tomDoResultado(valor: number): Exclude<TomTinta, "alerta"> | null {
  return valor > 0 ? "positivo" : valor < 0 ? "negativo" : null;
}
