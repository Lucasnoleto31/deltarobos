/**
 * A premissa escrita junto de todo número de resultado (DESIGN.md, seções 7 e 9): "com 1 contrato por entrada" e
 * se os custos estão descontados. Um lugar só para todas as telas, o PDF, as imagens e o widget dizerem a mesma
 * coisa do mesmo robô (revisão de 25/11/2026: o robô cujo histórico não tem custo cadastrado aparecia como "já
 * descontados os custos" em umas telas e "antes dos custos" em outras).
 */

/** O robô tem custo cadastrado? Sem custo, o histórico dele está antes dos custos. */
export function temCusto(custoPorContrato: number | null | undefined): boolean {
  return typeof custoPorContrato === "number" && Number.isFinite(custoPorContrato) && custoPorContrato > 0;
}

/** "já descontados os custos" ou "antes dos custos", para um robô. */
export function custosDoRobo(custoPorContrato: number | null | undefined): string {
  return temCusto(custoPorContrato) ? "já descontados os custos" : "antes dos custos";
}

/** "com 1 contrato por entrada, já descontados os custos" (ou "antes dos custos"), para um robô. */
export function premissaDoRobo(custoPorContrato: number | null | undefined): string {
  return `com 1 contrato por entrada, ${custosDoRobo(custoPorContrato)}`;
}

export interface RoboDaSoma {
  nome: string;
  custoPorContrato: number | null | undefined;
}

/**
 * Os custos de uma soma de robôs: todos com custo, "já descontados os custos"; nenhum, "antes dos custos"; parte,
 * "já descontados os custos, menos no X, que não tem custo no histórico" (com os nomes vindos do banco).
 */
export function custosDaSoma(robos: readonly RoboDaSoma[]): string {
  const semCusto = robos.filter((r) => !temCusto(r.custoPorContrato)).map((r) => r.nome);
  if (semCusto.length === 0) return "já descontados os custos";
  if (semCusto.length === robos.length) return "antes dos custos";
  const nomes = semCusto.length === 1 ? semCusto[0] : `${semCusto.slice(0, -1).join(", ")} e ${semCusto[semCusto.length - 1]}`;
  return `já descontados os custos, menos no ${nomes}, que não ${semCusto.length === 1 ? "tem" : "têm"} custo no histórico`;
}
