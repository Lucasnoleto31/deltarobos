import { prepararRequisicao, registrarVersaoEa, responder } from "@/lib/ingest/http";
import { processarDeal } from "@/lib/ingest/processar-deal";
import { corpoDealSchema, type CorpoDeal } from "@/lib/ingest/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/ingest/deal — um deal do OnTradeTransaction. Idempotente por ticket. */
export async function POST(req: Request) {
  const prep = await prepararRequisicao<CorpoDeal>(req, "deal", corpoDealSchema);
  if (!prep.ok) return prep.resposta;

  try {
    const resultado = await processarDeal(prep.conta.id, prep.dados.deal);
    await registrarVersaoEa(prep.conta.id, prep.dados.ea_versao);
    return responder(200, { ok: true, ...resultado });
  } catch (e) {
    console.error("[ingest/deal] erro", e);
    return responder(500, { ok: false, erro: "falha ao processar deal" });
  }
}
