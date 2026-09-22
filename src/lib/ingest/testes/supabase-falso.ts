/**
 * Cliente Supabase de mentira para os testes do ingest: registra toda a cadeia
 * from(tabela).select().eq()... e cada rpc(), na ordem, e responde com o que o
 * teste mandar. Só para vitest; nunca importar em código de produção.
 *
 * Uso nos testes (vi.mock é içado, por isso o import dinâmico):
 *   vi.mock("server-only", () => ({}));
 *   vi.mock("@/lib/supabase/admin", async () => {
 *     const { supabaseFalsoAtual } = await import("./testes/supabase-falso");
 *     return { supabaseAdmin: () => supabaseFalsoAtual() };
 *   });
 */

export interface Resposta {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export interface Passo {
  metodo: string;
  args: unknown[];
}

/** Uma cadeia completa numa tabela, ex.: deals.select("ticket").eq(...).in(...) */
export interface Consulta {
  tabela: string;
  passos: Passo[];
}

export interface ChamadaRpc {
  nome: string;
  args: Record<string, unknown>;
}

/** Entrada do registro linear: consulta em tabela ou rpc, na ordem em que foram disparadas. */
export type Registro = { tipo: "tabela"; consulta: Consulta } | { tipo: "rpc"; rpc: ChamadaRpc };

export type ResolvedorTabela = (consulta: Consulta) => Resposta | undefined;
export type ResolvedorRpc = (rpc: ChamadaRpc) => Resposta | undefined;

export interface SupabaseFalso {
  cliente: unknown;
  registro: Registro[];
  rpcs: ChamadaRpc[];
  /** primeiro índice no registro de uma consulta que usou `metodo` na `tabela`, ou -1 */
  indiceDe(tabela: string, metodo: string): number;
  indiceRpc(nome: string): number;
}

type Construtor = PromiseLike<Resposta> & Record<string, (...args: unknown[]) => Construtor>;

const RESPOSTA_VAZIA: Resposta = { data: [], error: null, count: null };

export function criarSupabaseFalso(
  tabelas: ResolvedorTabela = () => undefined,
  rpc: ResolvedorRpc = () => undefined,
): SupabaseFalso {
  const registro: Registro[] = [];
  const rpcs: ChamadaRpc[] = [];

  function construtor(tabela: string): Construtor {
    const consulta: Consulta = { tabela, passos: [] };
    registro.push({ tipo: "tabela", consulta });
    const proxy: Construtor = new Proxy({} as Construtor, {
      get(_alvo, prop) {
        if (prop === "then") {
          return (
            aoResolver?: (r: Resposta) => unknown,
            aoRejeitar?: (e: unknown) => unknown,
          ) => Promise.resolve(tabelas(consulta) ?? RESPOSTA_VAZIA).then(aoResolver, aoRejeitar);
        }
        if (typeof prop !== "string") return undefined;
        return (...args: unknown[]) => {
          consulta.passos.push({ metodo: prop, args });
          return proxy;
        };
      },
    });
    return proxy;
  }

  const cliente = {
    from: (tabela: string) => construtor(tabela),
    rpc: async (nome: string, args: Record<string, unknown> = {}) => {
      const chamada: ChamadaRpc = { nome, args };
      rpcs.push(chamada);
      registro.push({ tipo: "rpc", rpc: chamada });
      return rpc(chamada) ?? { data: null, error: null };
    },
  };

  return {
    cliente,
    registro,
    rpcs,
    indiceDe: (tabela, metodo) =>
      registro.findIndex(
        (r) =>
          r.tipo === "tabela" &&
          r.consulta.tabela === tabela &&
          r.consulta.passos.some((p) => p.metodo === metodo),
      ),
    indiceRpc: (nome) => registro.findIndex((r) => r.tipo === "rpc" && r.rpc.nome === nome),
  };
}

let atual: SupabaseFalso | null = null;

export function usarSupabaseFalso(falso: SupabaseFalso): SupabaseFalso {
  atual = falso;
  return falso;
}

export function supabaseFalsoAtual(): unknown {
  if (!atual) throw new Error("teste sem usarSupabaseFalso()");
  return atual.cliente;
}
