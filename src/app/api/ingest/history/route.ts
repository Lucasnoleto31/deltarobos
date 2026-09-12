import { prepararRequisicao, registrarVersaoEa, responder } from "@/lib/ingest/http";
import { processarHistorico } from "@/lib/ingest/processar-deal";
import { corpoHistorySchema, type CorpoHistory } from "@/lib/ingest/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/ingest/history — reconciliação: o EA manda os últimos N dias de
 * deals no OnInit, em páginas de até 500. Upsert + repareamento das posições.
 */
export async function POST(req: Request) {
  const prep = await prepararRequisicao<CorpoHistory>(req, "history", corpoHistorySchema);
  if (!prep.ok) return prep.resposta;

  try {
    const resultado = await processarHistorico(prep.conta.id, prep.dados.deals);
    await registrarVersaoEa(prep.conta.id, prep.dados.ea_versao);
    return responder(200, {
      ok: true,
      pagina: prep.dados.pagina ?? 1,
      total_paginas: prep.dados.total_paginas ?? 1,
      ...resultado,
    });
  } catch (e) {
    console.error("[ingest/history] erro", e);
    return responder(500, { ok: false, erro: "falha ao processar histórico" });
  }
}
