import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITES_POR_MINUTO, zerarLimites } from "@/lib/ingest/rate-limit";
import { criarSupabaseFalso, usarSupabaseFalso, type ChamadaRpc, type Consulta, type SupabaseFalso } from "@/lib/ingest/testes/supabase-falso";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", async () => {
  const { supabaseFalsoAtual } = await import("@/lib/ingest/testes/supabase-falso");
  return { supabaseAdmin: () => supabaseFalsoAtual() };
});

const { GET } = await import("./route");

const CONTA = "33333333-3333-3333-3333-333333333333";
const OUTRA = "99999999-9999-9999-9999-999999999999";
const TOKEN = "token-de-teste-ping";
const RPC = "regras_publicas_da_conta";

/** Linhas como a função regras_publicas_da_conta devolve (a de outra conta não viria; está aqui pra provar o filtro). */
const linhas = [
  {
    magic: 28079413,
    slug: "orion",
    conta_principal_id: CONTA,
    hora_minima_operacao: null,
    duracao_minima_seg: null,
    duracao_minima_desde: null,
    versao: "||",
  },
  {
    magic: 28079412,
    slug: "apollo",
    conta_principal_id: CONTA,
    hora_minima_operacao: "09:10:00",
    duracao_minima_seg: 2,
    duracao_minima_desde: "2026-09-21",
    versao: "09:10:00|2|2026-09-21",
  },
  {
    magic: 7,
    slug: "alaska",
    conta_principal_id: OUTRA,
    hora_minima_operacao: "09:05:00",
    duracao_minima_seg: 3,
    duracao_minima_desde: null,
    versao: "09:05:00|3|",
  },
];

function tabelas(consulta: Consulta) {
  if (consulta.tabela === "contas_matriz") return { data: { id: CONTA, apelido: "Apollo XP" }, error: null };
  return { data: null, error: null };
}

function rpcs(chamada: ChamadaRpc) {
  if (chamada.nome === RPC) return { data: linhas, error: null };
  return { data: null, error: null };
}

function requisicao(token: string | null = TOKEN): Request {
  return new Request("http://localhost/api/ingest/ping", {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

let falso: SupabaseFalso;
let erros: ReturnType<typeof vi.spyOn>;
let avisos: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  zerarLimites();
  falso = usarSupabaseFalso(criarSupabaseFalso(tabelas, rpcs));
  erros = vi.spyOn(console, "error").mockImplementation(() => {});
  avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  erros.mockRestore();
  avisos.mockRestore();
});

describe("GET /api/ingest/ping", () => {
  it("responde ok, servidor_em e as regras por magic da conta (com a versão), no formato do EA 1.1.1", async () => {
    const res = await GET(requisicao());
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.ok).toBe(true);
    expect(corpo.conta_apelido).toBe("Apollo XP");
    expect(typeof corpo.servidor_em).toBe("string");
    expect(Number.isNaN(Date.parse(corpo.servidor_em))).toBe(false);
    expect(corpo.regras).toEqual([
      {
        magic: 28079412,
        slug: "apollo",
        hora_minima: "09:10",
        duracao_minima_seg: 2,
        duracao_minima_desde: "2026-09-21",
        versao: "09:10:00|2|2026-09-21",
      },
      { magic: 28079413, slug: "orion", hora_minima: null, duracao_minima_seg: null, duracao_minima_desde: null, versao: "||" },
    ]);
    expect(erros).not.toHaveBeenCalled();
  });

  it("chama a função do banco regras_publicas_da_conta com a conta autenticada, e nenhuma tabela direto", async () => {
    await GET(requisicao());
    const i = falso.indiceRpc(RPC);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(falso.rpcs).toEqual([{ nome: RPC, args: { p_conta_id: CONTA } }]);
    expect(falso.indiceDe("robo_conta_magic", "select")).toBe(-1);
    expect(falso.indiceDe("robos", "select")).toBe(-1);
  });

  it("nada da conta sai na resposta: sem numero_conta, sem conta_id, sem id da conta, sem robô de outra conta", async () => {
    const texto = await (await GET(requisicao())).text();
    expect(texto).not.toContain("numero_conta");
    expect(texto).not.toContain("conta_id");
    expect(texto).not.toContain("conta_principal_id");
    expect(texto).not.toContain(CONTA);
    expect(texto).not.toContain("alaska");
  });

  it("conta sem magic mapeado: regras é lista vazia (o EA limpa as que tinha)", async () => {
    falso = usarSupabaseFalso(criarSupabaseFalso(tabelas, () => ({ data: [], error: null })));
    const corpo = await (await GET(requisicao())).json();
    expect(corpo.ok).toBe(true);
    expect(corpo.regras).toEqual([]);
  });

  it("erro do banco ao carregar as regras: 200 sem a chave regras (o EA mantém as últimas) e erro no log", async () => {
    falso = usarSupabaseFalso(criarSupabaseFalso(tabelas, () => ({ data: null, error: { message: "boom" } })));
    const res = await GET(requisicao());
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.ok).toBe(true);
    expect("regras" in corpo).toBe(false);
    expect(erros).toHaveBeenCalled();
    expect(String(erros.mock.calls[0][0])).toContain("[ingest/ping] falha ao carregar regras");
  });

  it("sem token é 401 e nenhuma regra é consultada", async () => {
    const res = await GET(requisicao(null));
    expect(res.status).toBe(401);
    expect(falso.indiceRpc(RPC)).toBe(-1);
  });

  it("token inválido é 401", async () => {
    falso = usarSupabaseFalso(criarSupabaseFalso(() => ({ data: null, error: null })));
    const res = await GET(requisicao("token-que-nao-existe"));
    expect(res.status).toBe(401);
    expect(falso.indiceRpc(RPC)).toBe(-1);
  });

  it("rate limit de 30/min por conta: a 31ª requisição é 429 com Retry-After", async () => {
    expect(LIMITES_POR_MINUTO.ping).toBe(30);
    for (let i = 0; i < 30; i++) {
      expect((await GET(requisicao())).status).toBe(200);
    }
    const res = await GET(requisicao());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
  });
});
