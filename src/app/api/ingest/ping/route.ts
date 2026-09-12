import { prepararRequisicao, responder } from "@/lib/ingest/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ingest/ping — o EA usa pra validar URL e token na configuração. */
export async function GET(req: Request) {
  const prep = await prepararRequisicao<undefined>(req, "ping", null);
  if (!prep.ok) return prep.resposta;

  return responder(200, {
    ok: true,
    conta_apelido: prep.conta.apelido,
    servidor_em: new Date().toISOString(),
  });
}
