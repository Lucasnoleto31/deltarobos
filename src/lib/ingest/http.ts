import "server-only";
import { createHash } from "node:crypto";
import type { ZodType } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LIMITES_POR_MINUTO, permitirEndpoint, type EndpointIngest } from "./rate-limit";

export interface ContaAutenticada {
  id: string;
  apelido: string;
}

interface EntradaCache {
  conta: ContaAutenticada;
  ate: number;
}

const cacheTokens = new Map<string, EntradaCache>();
const TTL_CACHE_MS = 60_000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function extrairToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export function ipDe(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

/** Token -> conta ativa. Cache de 60s pra não bater no banco a cada heartbeat. */
export async function autenticarConta(token: string): Promise<ContaAutenticada | null> {
  const hash = hashToken(token);
  const agora = Date.now();
  const emCache = cacheTokens.get(hash);
  if (emCache && emCache.ate > agora) return emCache.conta;

  const { data, error } = await supabaseAdmin()
    .from("contas_matriz")
    .select("id, apelido")
    .eq("token_hash", hash)
    .eq("ativa", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const conta: ContaAutenticada = { id: data.id as string, apelido: data.apelido as string };
  cacheTokens.set(hash, { conta, ate: agora + TTL_CACHE_MS });
  return conta;
}

function truncarPayload(payload: unknown): unknown {
  if (payload === undefined) return null;
  try {
    const s = JSON.stringify(payload);
    return s.length > 4000 ? { truncado: true, inicio: s.slice(0, 4000) } : payload;
  } catch {
    return null;
  }
}

export async function registrarRejeicao(p: {
  contaId: string | null;
  endpoint: EndpointIngest;
  status: number;
  motivo: string;
  ip: string | null;
  payload?: unknown;
}): Promise<void> {
  try {
    await supabaseAdmin()
      .from("coleta_rejeicoes")
      .insert({
        conta_id: p.contaId,
        endpoint: p.endpoint,
        status_http: p.status,
        motivo: p.motivo.slice(0, 500),
        ip: p.ip,
        payload: truncarPayload(p.payload),
      });
  } catch (e) {
    console.error("[ingest] falha ao registrar rejeição", e);
  }
}

export function responder(
  status: number,
  corpo: Record<string, unknown>,
  headers?: Record<string, string>,
): Response {
  return Response.json(corpo, { status, headers });
}

export type Preparado<T> =
  | { ok: true; conta: ContaAutenticada; dados: T; ip: string | null }
  | { ok: false; resposta: Response };

/**
 * Pipeline comum: token -> conta -> rate limit -> JSON -> validação.
 * Toda recusa vira linha em coleta_rejeicoes.
 */
export async function prepararRequisicao<T>(
  req: Request,
  endpoint: EndpointIngest,
  schema: ZodType<T> | null,
): Promise<Preparado<T>> {
  const ip = ipDe(req);

  const token = extrairToken(req);
  if (!token) {
    await registrarRejeicao({ contaId: null, endpoint, status: 401, motivo: "token ausente", ip });
    return { ok: false, resposta: responder(401, { ok: false, erro: "token ausente" }) };
  }

  let conta: ContaAutenticada | null;
  try {
    conta = await autenticarConta(token);
  } catch (e) {
    console.error("[ingest] erro ao validar token", e);
    return { ok: false, resposta: responder(500, { ok: false, erro: "falha ao validar token" }) };
  }
  if (!conta) {
    await registrarRejeicao({ contaId: null, endpoint, status: 401, motivo: "token inválido", ip });
    return { ok: false, resposta: responder(401, { ok: false, erro: "token inválido" }) };
  }

  const limite = permitirEndpoint(conta.id, endpoint);
  if (!limite.ok) {
    await registrarRejeicao({
      contaId: conta.id,
      endpoint,
      status: 429,
      motivo: `limite de ${LIMITES_POR_MINUTO[endpoint]}/min excedido`,
      ip,
    });
    return {
      ok: false,
      resposta: responder(
        429,
        { ok: false, erro: "muitas requisições" },
        { "Retry-After": String(limite.reiniciaEmSeg) },
      ),
    };
  }

  if (!schema) {
    return { ok: true, conta, dados: undefined as T, ip };
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    await registrarRejeicao({ contaId: conta.id, endpoint, status: 400, motivo: "JSON inválido", ip });
    return { ok: false, resposta: responder(400, { ok: false, erro: "JSON inválido" }) };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const detalhes = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);
    await registrarRejeicao({
      contaId: conta.id,
      endpoint,
      status: 400,
      motivo: detalhes.join("; "),
      ip,
      payload: json,
    });
    return {
      ok: false,
      resposta: responder(400, { ok: false, erro: "payload inválido", detalhes }),
    };
  }

  return { ok: true, conta, dados: parsed.data, ip };
}

/** Registra a versão do EA sem falhar a requisição se der erro. */
export async function registrarVersaoEa(contaId: string, versao: string | undefined): Promise<void> {
  if (!versao) return;
  try {
    await supabaseAdmin()
      .from("coleta_status")
      .upsert({ conta_id: contaId, versao_ea: versao }, { onConflict: "conta_id" });
  } catch (e) {
    console.error("[ingest] falha ao registrar versão do EA", e);
  }
}
