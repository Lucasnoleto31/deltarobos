import { prepararRequisicao, responder } from "@/lib/ingest/http";
import { RPC_REGRAS, montarRegras } from "@/lib/ingest/regras-publicas";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ingest/ping — o EA usa pra validar URL e token na configuração e, desde o DeltaReporter 1.1.1,
 * para receber as regras públicas por magic (hora mínima, duração mínima, desde quando e a versão da regra)
 * que aplica ao medir MEP/MEN do dia; o EA chama no init, na virada do dia e a cada 10 min. As linhas vêm
 * da função regras_publicas_da_conta (migration 0023, service_role): só magics mapeados para esta conta
 * cujo robô tem esta conta como principal; sem numero_conta. Se a consulta falhar, a resposta sai sem
 * "regras" (o EA mantém as últimas conhecidas) e o ping continua servindo de teste de URL e token.
 */
export async function GET(req: Request) {
  const prep = await prepararRequisicao<undefined>(req, "ping", null);
  if (!prep.ok) return prep.resposta;

  const corpo: Record<string, unknown> = {
    ok: true,
    conta_apelido: prep.conta.apelido,
    servidor_em: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabaseAdmin().rpc(RPC_REGRAS, { p_conta_id: prep.conta.id });
    if (error) throw error;
    corpo.regras = montarRegras(data, prep.conta.id);
  } catch (e) {
    console.error("[ingest/ping] falha ao carregar regras públicas", e);
  }

  return responder(200, corpo);
}
