import { prepararRequisicao, responder } from "@/lib/ingest/http";
import { corpoHeartbeatSchema, type CorpoHeartbeat } from "@/lib/ingest/schemas";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ingest/heartbeat — a cada 3s: balance, equity, posições abertas
 * e cotações. Tudo numa RPC transacional no banco.
 */
export async function POST(req: Request) {
  const prep = await prepararRequisicao<CorpoHeartbeat>(req, "heartbeat", corpoHeartbeatSchema);
  if (!prep.ok) return prep.resposta;

  try {
    const { data, error } = await supabaseAdmin().rpc("atualizar_heartbeat", {
      p_conta_id: prep.conta.id,
      p: prep.dados,
    });
    if (error) throw error;

    return responder(200, {
      ok: true,
      servidor_em: (data as { servidor_em?: string } | null)?.servidor_em ?? new Date().toISOString(),
    });
  } catch (e) {
    console.error("[ingest/heartbeat] erro", e);
    return responder(500, { ok: false, erro: "falha ao processar heartbeat" });
  }
}
