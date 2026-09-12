import { prepararRequisicao, responder } from "@/lib/ingest/http";
import { reconciliarConta } from "@/lib/ingest/processar-deal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/ingest/reconciliar — o EA chama quando termina de enviar o
 * histórico. Repareia posições sem operação ou marcadas como abertas.
 */
export async function POST(req: Request) {
  const prep = await prepararRequisicao<undefined>(req, "reconciliar", null);
  if (!prep.ok) return prep.resposta;

  try {
    const resultado = await reconciliarConta(prep.conta.id);
    return responder(200, { ok: true, ...resultado });
  } catch (e) {
    console.error("[ingest/reconciliar] erro", e);
    return responder(500, { ok: false, erro: "falha ao reconciliar" });
  }
}
