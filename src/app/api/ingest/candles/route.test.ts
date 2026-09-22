import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITES_POR_MINUTO, zerarLimites } from "@/lib/ingest/rate-limit";
import {
  criarSupabaseFalso,
  usarSupabaseFalso,
  type ChamadaRpc,
  type Consulta,
  type SupabaseFalso,
} from "@/lib/ingest/testes/supabase-falso";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", async () => {
  const { supabaseFalsoAtual } = await import("@/lib/ingest/testes/supabase-falso");
  return { supabaseAdmin: () => supabaseFalsoAtual() };
});

const { POST } = await import("./route");

const CONTA = "22222222-2222-2222-2222-222222222222";
const TOKEN = "token-de-teste-candles";

const candle = { t: "2026-09-22T13:40:00.000Z", o: 140200, h: 140260, l: 140180, c: 140250, v: 1234, vr: 56780 };

function tabelas(consulta: Consulta) {
  if (consulta.tabela === "contas_matriz") return { data: { id: CONTA, apelido: "Teste" }, error: null };
  return { data: null, error: null };
}

function rpcOk(rpc: ChamadaRpc) {
  if (rpc.nome === "gravar_candles") return { data: 2, error: null };
  return undefined;
}

function requisicao(corpo: unknown, token: string | null = TOKEN): Request {
  return new Request("http://localhost/api/ingest/candles", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

let falso: SupabaseFalso;
let erros: ReturnType<typeof vi.spyOn>;
let avisos: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  zerarLimites();
  falso = usarSupabaseFalso(criarSupabaseFalso(tabelas, rpcOk));
  erros = vi.spyOn(console, "error").mockImplementation(() => {});
  avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  erros.mockRestore();
  avisos.mockRestore();
});

describe("POST /api/ingest/candles", () => {
  it("corpo válido: 200 com gravados e rpc gravar_candles com o corpo validado", async () => {
    const res = await POST(requisicao({ ea_versao: "1.1.0", simbolo: "WINV26", timeframe: "M1", candles: [candle] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, gravados: 2 });
    expect(falso.rpcs).toHaveLength(1);
    expect(falso.rpcs[0]).toEqual({
      nome: "gravar_candles",
      args: {
        p_conta_id: CONTA,
        p: { ea_versao: "1.1.0", simbolo: "WINV26", timeframe: "M1", candles: [candle] },
      },
    });
  });

  it("gravar_candles pode devolver {gravados}; sem retorno conta os enviados", async () => {
    falso = usarSupabaseFalso(criarSupabaseFalso(tabelas, () => ({ data: { gravados: 1 }, error: null })));
    let res = await POST(requisicao({ simbolo: "WINV26", candles: [candle, { ...candle, t: "2026-09-22T13:41:00.000Z" }] }));
    expect(await res.json()).toEqual({ ok: true, gravados: 1 });

    falso = usarSupabaseFalso(criarSupabaseFalso(tabelas, () => ({ data: null, error: null })));
    res = await POST(requisicao({ simbolo: "WINV26", candles: [candle, { ...candle, t: "2026-09-22T13:41:00.000Z" }] }));
    expect(await res.json()).toEqual({ ok: true, gravados: 2 });
  });

  it("candle inválido (mínima acima da abertura) é 400, nada é gravado e a rejeição fica registrada", async () => {
    const res = await POST(requisicao({ simbolo: "WINV26", candles: [{ ...candle, l: 140210 }] }));
    expect(res.status).toBe(400);
    const corpo = await res.json();
    expect(corpo.ok).toBe(false);
    expect(corpo.erro).toBe("payload inválido");
    expect(String(corpo.detalhes[0])).toContain("candles.0");
    expect(falso.rpcs).toHaveLength(0);
    expect(falso.indiceDe("coleta_rejeicoes", "insert")).toBeGreaterThanOrEqual(0);
  });

  it("mais de 200 candles e JSON quebrado também são 400", async () => {
    const muitos = Array.from({ length: 201 }, (_, i) => ({ ...candle, t: 1790000400 + i * 60 }));
    expect((await POST(requisicao({ simbolo: "WINV26", candles: muitos }))).status).toBe(400);
    expect((await POST(requisicao("{nao é json"))).status).toBe(400);
    expect(falso.rpcs).toHaveLength(0);
  });

  it("lista vazia: 200 com gravados 0 sem ir ao banco", async () => {
    const res = await POST(requisicao({ simbolo: "WINV26", candles: [] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, gravados: 0 });
    expect(falso.rpcs).toHaveLength(0);
  });

  it("sem token é 401", async () => {
    const res = await POST(requisicao({ simbolo: "WINV26", candles: [candle] }, null));
    expect(res.status).toBe(401);
    expect(falso.rpcs).toHaveLength(0);
  });

  it("símbolo sem multiplicador: gravar_candles recusa sem erro e a rota responde 422, avisa no log e registra a rejeição", async () => {
    falso = usarSupabaseFalso(
      criarSupabaseFalso(tabelas, () => ({
        data: { ok: false, motivo: "simbolo sem multiplicador", simbolo: "ABC26", recebidos: 1, gravados: 0 },
        error: null,
      })),
    );
    const res = await POST(requisicao({ simbolo: "ABC26", candles: [candle] }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, erro: "candles recusados", motivo: "simbolo sem multiplicador" });
    expect(avisos).toHaveBeenCalledWith("[ingest/candles] candles recusados (simbolo sem multiplicador): ABC26");
    const iRejeicao = falso.indiceDe("coleta_rejeicoes", "insert");
    expect(iRejeicao).toBeGreaterThanOrEqual(0);
    const registro = falso.registro[iRejeicao];
    expect(registro.tipo === "tabela" && registro.consulta.passos[0].args[0]).toMatchObject({
      conta_id: CONTA,
      endpoint: "candles",
      status_http: 422,
      motivo: "candles recusados (simbolo sem multiplicador): ABC26",
    });
  });

  it("retorno {ok: true} ou sem a chave ok não é recusa", async () => {
    falso = usarSupabaseFalso(criarSupabaseFalso(tabelas, () => ({ data: { ok: true, gravados: 1 }, error: null })));
    const res = await POST(requisicao({ simbolo: "WINV26", candles: [candle] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, gravados: 1 });
    expect(avisos).not.toHaveBeenCalled();
  });

  it("erro do banco é 500 (o EA só loga e relê a barra no próximo envio)", async () => {
    falso = usarSupabaseFalso(criarSupabaseFalso(tabelas, () => ({ data: null, error: { message: "boom" } })));
    const res = await POST(requisicao({ simbolo: "WINV26", candles: [candle] }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, erro: "falha ao gravar candles" });
  });

  it("rate limit de 20/min por conta: a 21ª requisição é 429 com Retry-After", async () => {
    expect(LIMITES_POR_MINUTO.candles).toBe(20);
    for (let i = 0; i < 20; i++) {
      const res = await POST(requisicao({ simbolo: "WINV26", candles: [] }));
      expect(res.status).toBe(200);
    }
    const res = await POST(requisicao({ simbolo: "WINV26", candles: [] }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
  });
});
