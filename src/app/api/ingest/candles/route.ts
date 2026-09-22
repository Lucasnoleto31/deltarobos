import { prepararRequisicao, registrarRejeicao, responder } from "@/lib/ingest/http";
import { corpoCandlesSchema, type CorpoCandles } from "@/lib/ingest/schemas";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** gravar_candles recusa sem erro de banco ({ok: false, motivo}) quando o símbolo não tem multiplicador ou falta conta. */
function recusa(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const r = data as { ok?: unknown; motivo?: unknown };
  if (r.ok !== false) return null;
  return typeof r.motivo === "string" && r.motivo !== "" ? r.motivo : "motivo desconhecido";
}

/** gravar_candles devolve o número de linhas novas (inteiro ou {gravados}); on conflict do nothing. */
function contarGravados(data: unknown, enviados: number): number {
  if (typeof data === "number") return data;
  if (data && typeof data === "object" && "gravados" in data) {
    const n = Number((data as { gravados: unknown }).gravados);
    if (Number.isFinite(n)) return n;
  }
  return enviados;
}

/**
 * POST /api/ingest/candles — barras M1 fechadas do índice (EA 1.1.0, InpEnviaCandles), páginas de até
 * 200. Base dos "regimes de volatilidade". Sem fila no EA: falha só loga e a barra é relida no próximo
 * envio, por isso o schema é estrito (corpo inválido = 400, nada gravado). Público na view
 * candles_publico; conta e volume da matriz não entram aqui.
 * Símbolo sem multiplicador (InpCandlesSimbolo errado, vencimento fora do padrão WIN*, WDO*) é 422 com a
 * rejeição registrada: com 200 o EA avançaria o ponteiro dizendo "ok" e a base ficaria vazia em silêncio;
 * com 422 ele loga a cada barra nova, relê as mesmas barras e, cadastrado o multiplicador, nada se perdeu.
 */
export async function POST(req: Request) {
  const prep = await prepararRequisicao<CorpoCandles>(req, "candles", corpoCandlesSchema);
  if (!prep.ok) return prep.resposta;

  const { candles } = prep.dados;
  if (candles.length === 0) return responder(200, { ok: true, gravados: 0 });

  try {
    const { data, error } = await supabaseAdmin().rpc("gravar_candles", {
      p_conta_id: prep.conta.id,
      p: prep.dados,
    });
    if (error) throw error;
    const motivoRecusa = recusa(data);
    if (motivoRecusa !== null) {
      const motivo = `candles recusados (${motivoRecusa}): ${prep.dados.simbolo}`;
      console.warn(`[ingest/candles] ${motivo}`);
      await registrarRejeicao({ contaId: prep.conta.id, endpoint: "candles", status: 422, motivo, ip: prep.ip });
      return responder(422, { ok: false, erro: "candles recusados", motivo: motivoRecusa });
    }
    return responder(200, { ok: true, gravados: contarGravados(data, candles.length) });
  } catch (e) {
    console.error("[ingest/candles] erro", e);
    return responder(500, { ok: false, erro: "falha ao gravar candles" });
  }
}
