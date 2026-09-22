import type { Deal } from "./schemas";

/**
 * Um item do jsonb que vai para registrar_excursoes(p_conta_id, p): p é um array destes objetos, com os
 * mesmos nomes do payload do EA. O heartbeat manda as posições abertas (passo 3b da função
 * atualizar_heartbeat) e o deal manda o ciclo que acabou de mexer.
 */
export interface ExcursaoParaRegistrar {
  posicao_id: number;
  ciclo: number;
  magic: number;
  simbolo: string;
  mfe_pontos: number;
  mae_pontos: number;
  mfe_em: string | null;
  mae_em: string | null;
  excursao_parcial: boolean;
}

/**
 * Excursão que um deal do OnTradeTransaction traz (EA 1.1.0). Só existe quando o EA conhece mfe_pontos ou
 * mae_pontos E o ciclo; deal do EA 1.0.0, deal sem posição ou que não é negociação (balance, comissão)
 * devolve null. Um dos dois extremos malformado não perde o outro: entra como 0, que é neutro no
 * greatest()/least() do banco. Sem ciclo também é null: a linha de excursoes_posicao é por (posição,
 * ciclo) e monotônica, e um default 1 fundiria a medição do ciclo 2 de uma posição revertida na linha
 * já fechada do ciclo 1 (o EA 1.1.0 sempre manda o ciclo junto dos extremos).
 */
export function excursaoDoDeal(deal: Deal): ExcursaoParaRegistrar | null {
  if (deal.mfe_pontos === undefined && deal.mae_pontos === undefined) return null;
  if (deal.ciclo === undefined) return null;
  if (!(deal.posicao_id > 0)) return null;
  if (deal.tipo !== "buy" && deal.tipo !== "sell") return null;

  return {
    posicao_id: deal.posicao_id,
    ciclo: deal.ciclo,
    magic: deal.magic,
    simbolo: deal.simbolo.toUpperCase(),
    mfe_pontos: deal.mfe_pontos ?? 0,
    mae_pontos: deal.mae_pontos ?? 0,
    mfe_em: deal.mfe_em ?? null,
    mae_em: deal.mae_em ?? null,
    excursao_parcial: deal.excursao_parcial ?? false,
  };
}
