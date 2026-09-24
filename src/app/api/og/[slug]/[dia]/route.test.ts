import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buscarRobo,
  carregarParametros,
  listarExposicaoDia,
  listarMercado,
  listarOperacoesDoDia,
  listarSaldoDoDia,
} from "@/lib/consultas/publico";
import type { MercadoPublico, OperacaoPublica, Parametros, RoboPublico } from "@/lib/tipos";
import { GET } from "./route";

// A rota da imagem do dia (24/09/2026) sem banco: as consultas são falsas e o relógio fica parado em
// 24/09/2026 12:00 em Brasília. A PNG sai de verdade, pelo ImageResponse.
vi.mock("@/lib/consultas/publico", () => ({
  buscarRobo: vi.fn(),
  listarOperacoesDoDia: vi.fn(),
  listarSaldoDoDia: vi.fn(),
  listarExposicaoDia: vi.fn(),
  listarMercado: vi.fn(),
  carregarParametros: vi.fn(),
}));

const ROBO = {
  id: "00000000-0000-0000-0000-000000000000",
  slug: "robo-teste",
  nome: "Robô Teste",
  ativo: "WIN",
  ativo_nome: "Mini Índice",
  valor_ponto_brl: 0.2,
  descricao_publica: null,
  horario_inicio: "09:05",
  horario_fim: "17:30",
  contratos_padrao: 1,
  custo_por_contrato: 0.25,
  capital_referencia: null,
  status: "ativo",
  versao_atual: null,
  ordem: 1,
  conta_real_desde: null,
  ultimo_heartbeat_em: null,
  ultima_operacao_em: null,
  posicionado: false,
  relatorio_mt5_url: null,
  conta_tipo: "real",
  tem_coletor: true,
  hora_minima_operacao: null,
  duracao_minima_seg: null,
  duracao_minima_desde: null,
} as RoboPublico;

function op(fechamento: string, bruto: number): OperacaoPublica {
  return {
    fechamento_em: fechamento,
    resultado_brl_por_contrato: bruto,
    custos_brl_por_contrato: 0.25,
    pontos_por_contrato: bruto / 0.2,
    origem: "mt5",
  } as OperacaoPublica;
}

const OPS_23 = [op("2026-09-23T12:30:00Z", 50), op("2026-09-23T15:00:00Z", -20), op("2026-09-23T19:00:00Z", 80)];
const OPS_24 = [op("2026-09-24T12:30:00Z", 30), op("2026-09-24T14:10:00Z", 15)];

function pedir(dia: string, busca = "") {
  return GET(new Request(`http://localhost/api/og/robo-teste/${dia}${busca}`), { params: Promise.resolve({ slug: "robo-teste", dia }) });
}

/** largura e altura do cabeçalho IHDR da PNG (bytes 16–19 e 20–23, big-endian) */
async function dimensoes(res: Response): Promise<[number, number]> {
  const bytes = new DataView(await res.arrayBuffer());
  return [bytes.getUint32(16), bytes.getUint32(20)];
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T15:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.mocked(buscarRobo).mockReset().mockResolvedValue(ROBO);
  vi.mocked(listarOperacoesDoDia)
    .mockReset()
    .mockImplementation(async (_slug, dia) => (dia === "2026-09-24" ? OPS_24 : OPS_23));
  vi.mocked(listarSaldoDoDia).mockReset().mockResolvedValue({ baldes: [], aproximado: false });
  vi.mocked(listarExposicaoDia).mockReset().mockResolvedValue([]);
  vi.mocked(listarMercado)
    .mockReset()
    .mockResolvedValue([{ prefixo_simbolo: "WIN", pregao_inicio: "09:00", pregao_fim: "18:00" } as MercadoPublico]);
  vi.mocked(carregarParametros)
    .mockReset()
    .mockResolvedValue({ textos: { disclaimer: "Resultados passados não garantem resultados futuros." } } as Parametros);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("GET /api/og/[slug]/[dia]", () => {
  it("400 para dia ilegível, dia que não existe no calendário e dia futuro", async () => {
    expect((await pedir("2026-9-1")).status).toBe(400);
    // passa na regex, mas não existe: o banco recusaria (22008) e a resposta seria 503
    expect((await pedir("2026-02-30")).status).toBe(400);
    expect((await pedir("2026-09-25")).status).toBe(400);
    expect(buscarRobo).not.toHaveBeenCalled();
  });

  it("404 para robô desconhecido e para dia sem operação", async () => {
    vi.mocked(buscarRobo).mockResolvedValueOnce(null);
    expect((await pedir("2026-09-23")).status).toBe(404);
    vi.mocked(listarOperacoesDoDia).mockResolvedValueOnce([]);
    expect((await pedir("2026-09-23")).status).toBe(404);
  });

  it("503 sem cache quando o banco falha (no robô ou na série)", async () => {
    vi.mocked(buscarRobo).mockRejectedValueOnce(new Error("banco fora"));
    const r1 = await pedir("2026-09-23");
    expect(r1.status).toBe(503);
    expect(r1.headers.get("cache-control")).toBe("no-store");
    expect(r1.headers.get("retry-after")).toBe("5");

    vi.mocked(listarSaldoDoDia).mockRejectedValueOnce(new Error("timeout"));
    const r2 = await pedir("2026-09-23");
    expect(r2.status).toBe(503);
    expect(r2.headers.get("cache-control")).toBe("no-store");
    expect(r2.headers.get("retry-after")).toBe("5");
  });

  it("200 num dia passado: PNG quadrada, cache longo, e as consultas pedem para o erro subir", async () => {
    const res = await pedir("2026-09-23");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
    expect(await dimensoes(res)).toEqual([1080, 1080]);
    expect(buscarRobo).toHaveBeenCalledWith("robo-teste", { lancarErro: true });
    expect(listarExposicaoDia).toHaveBeenCalledWith("robo-teste", { dia: "2026-09-23", lancarErro: true });
    expect(listarMercado).toHaveBeenCalledWith({ lancarErro: true });
  }, 60_000);

  it("?formato=story dá 1080×1920; formato desconhecido e v= são ignorados", async () => {
    expect(await dimensoes(await pedir("2026-09-23", "?formato=story"))).toEqual([1080, 1920]);
    expect(await dimensoes(await pedir("2026-09-23", "?formato=xyz&v=1"))).toEqual([1080, 1080]);
  }, 60_000);

  it("hoje: cache curto", async () => {
    const res = await pedir("2026-09-24");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=60");
    expect(await dimensoes(res)).toEqual([1080, 1080]);
  }, 60_000);
});
