/**
 * Capital mínimo do robô, com 1 contrato por entrada =
 *   margem por contrato x o máximo de entradas que o robô já teve abertas ao mesmo tempo
 *   + maior queda (R$, já com custos) x fator de segurança.
 *
 * 25/11/2026 (decisão do Lucas): a margem é por contrato (R$ 150 no mini índice, na corretora parceira) e o
 * robô acumula entradas; antes a conta somava a margem de 1 contrato só, e um robô que chegou a 36 entradas
 * abertas aparecia com a garantia de uma. Sem medição de entradas (robô só com histórico importado, que não
 * tem horário de entrada), vale 1.
 */
export function capitalMinimoRecomendado(
  margemReferencia: number | null | undefined,
  drawdownMaximoBrl: number,
  fatorSeguranca = 1.5,
  entradasAbertas = 1,
): number {
  const entradas = Number.isFinite(entradasAbertas) && entradasAbertas > 1 ? Math.floor(entradasAbertas) : 1;
  return (margemReferencia ?? 0) * entradas + drawdownMaximoBrl * fatorSeguranca;
}
