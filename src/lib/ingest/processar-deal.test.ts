import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dealSchema } from "./schemas";
import { criarSupabaseFalso, usarSupabaseFalso, type Consulta, type SupabaseFalso } from "./testes/supabase-falso";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", async () => {
  const { supabaseFalsoAtual } = await import("./testes/supabase-falso");
  return { supabaseAdmin: () => supabaseFalsoAtual() };
});

const { processarDeal, processarHistorico } = await import("./processar-deal");

const CONTA = "11111111-1111-1111-1111-111111111111";

const entrada = {
  ticket: 100,
  posicao_id: 987600,
  simbolo: "WINV26",
  tipo: "buy",
  entry: "in",
  volume: 1,
  preco: 140200,
  lucro: 0,
  magic: 1001,
  executado_em: "2026-09-22T13:30:00.000Z",
};

const saida = {
  ...entrada,
  ticket: 101,
  tipo: "sell",
  entry: "out",
  preco: 140250,
  lucro: 10,
  executado_em: "2026-09-22T13:40:00.000Z",
};

const excursao = {
  ciclo: 1,
  mfe_pontos: 320,
  mae_pontos: -85,
  mfe_em: "2026-09-22T13:35:02.410Z",
  mae_em: "2026-09-22T13:31:48.006Z",
  excursao_parcial: false,
};

/** Banco com um robô, um magic mapeado e a posição 987600 com entrada e saída (ciclo fechado). */
function respostas(consulta: Consulta) {
  const passo0 = consulta.passos[0]?.metodo;
  switch (consulta.tabela) {
    case "robo_conta_magic":
      return { data: [{ magic: 1001, robo_id: "robo-1", versao_robo: null }], error: null };
    case "multiplicadores":
      return { data: [{ prefixo_simbolo: "WIN" }], error: null };
    case "robos":
      return { data: [{ id: "robo-1", custo_por_contrato: 1, versao_atual: "v1" }], error: null };
    case "deals":
      if (passo0 === "select" && String(consulta.passos[0].args[0]) === "ticket") return { data: [], error: null };
      if (passo0 === "select") {
        return {
          data: [entrada, saida].map((d) => ({ ...d, robo_id: "robo-1" })),
          error: null,
        };
      }
      return { data: null, error: null };
    default:
      return { data: null, error: null };
  }
}

let falso: SupabaseFalso;
let erros: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  falso = usarSupabaseFalso(criarSupabaseFalso(respostas));
  erros = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  erros.mockRestore();
});

describe("processarDeal com excursão (EA 1.1.0)", () => {
  it("registra a excursão ANTES de gravar a operação, com o jsonb no formato do payload", async () => {
    const r = await processarDeal(CONTA, dealSchema.parse({ ...saida, ...excursao }));

    expect(r).toMatchObject({ recebidos: 1, inseridos: 1, operacoes: 1, excursoes: 1 });
    expect(falso.rpcs).toHaveLength(1);
    expect(falso.rpcs[0]).toEqual({
      nome: "registrar_excursoes",
      args: {
        p_conta_id: CONTA,
        p: [
          {
            posicao_id: 987600,
            ciclo: 1,
            magic: 1001,
            simbolo: "WINV26",
            mfe_pontos: 320,
            mae_pontos: -85,
            mfe_em: excursao.mfe_em,
            mae_em: excursao.mae_em,
            excursao_parcial: false,
          },
        ],
      },
    });

    const iRpc = falso.indiceRpc("registrar_excursoes");
    const iDeals = falso.indiceDe("deals", "upsert");
    const iOperacoes = falso.indiceDe("operacoes", "upsert");
    expect(iDeals).toBeGreaterThanOrEqual(0);
    expect(iOperacoes).toBeGreaterThanOrEqual(0);
    expect(iRpc).toBeGreaterThan(iDeals);
    expect(iRpc).toBeLessThan(iOperacoes);
  });

  it("deal do EA 1.0.0 (sem mfe_pontos) não chama registrar_excursoes", async () => {
    const r = await processarDeal(CONTA, dealSchema.parse(saida));
    expect(r).toMatchObject({ operacoes: 1, excursoes: 0 });
    expect(falso.rpcs).toHaveLength(0);
  });

  it("falha em registrar_excursoes não derruba o deal: operação gravada, excursoes = 0, erro no log", async () => {
    falso = usarSupabaseFalso(
      criarSupabaseFalso(respostas, () => ({ data: null, error: { message: "function registrar_excursoes does not exist" } })),
    );
    const r = await processarDeal(CONTA, dealSchema.parse({ ...saida, ...excursao }));
    expect(r).toMatchObject({ inseridos: 1, operacoes: 1, excursoes: 0 });
    expect(falso.indiceDe("operacoes", "upsert")).toBeGreaterThanOrEqual(0);
    expect(erros).toHaveBeenCalledTimes(1);
    expect(String(erros.mock.calls[0][0])).toContain("falha ao registrar excursão");
  });

  it("reenvio do mesmo deal chama a rpc de novo (o banco é idempotente com greatest/least)", async () => {
    const deal = dealSchema.parse({ ...saida, ...excursao });
    await processarDeal(CONTA, deal);
    await processarDeal(CONTA, deal);
    expect(falso.rpcs.filter((r) => r.nome === "registrar_excursoes")).toHaveLength(2);
  });
});

describe("processarHistorico", () => {
  it("nunca registra excursão, mesmo que a página traga os campos", async () => {
    const r = await processarHistorico(CONTA, [
      dealSchema.parse(entrada),
      dealSchema.parse({ ...saida, ...excursao }),
    ]);
    expect(r).toMatchObject({ recebidos: 2, operacoes: 1 });
    expect(r).not.toHaveProperty("excursoes");
    expect(falso.rpcs).toHaveLength(0);
  });
});
