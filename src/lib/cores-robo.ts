/**
 * Uma cor por robô (13/10/2026): a posição do robô na paleta --robo-1 a --robo-8 do globals.css, pela coluna
 * `ordem` da tabela robos. Nunca pelo slug: robô novo cadastrado no admin ganha cor sem deploy. Com mais de 8
 * robôs a paleta recomeça.
 */

export const N_CORES_ROBO = 8;

/** 1..8 a partir da ordem do banco (1 = primeiro robô) */
export function indiceCorRobo(ordem: number): number {
  const i = Math.round(Number.isFinite(ordem) ? ordem : 1) - 1;
  return (((i % N_CORES_ROBO) + N_CORES_ROBO) % N_CORES_ROBO) + 1;
}

/** cor do robô como valor de CSS (acompanha o tema): "var(--robo-2)" */
export function corDoRobo(ordem: number): string {
  return `var(--robo-${indiceCorRobo(ordem)})`;
}

/** As mesmas cores em hex, para o que não lê CSS (imagem OG, PDF): os tons do tema escuro */
export const CORES_ROBO_ESCURO: readonly string[] = [
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#fbbf24",
  "#2dd4bf",
  "#fb923c",
  "#e879f9",
  "#94a3b8",
];

export function corDoRoboHex(ordem: number): string {
  return CORES_ROBO_ESCURO[indiceCorRobo(ordem) - 1];
}
