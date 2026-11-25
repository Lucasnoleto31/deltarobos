import { beforeEach, describe, expect, it, vi } from "vitest";
import { buscarRobo } from "@/lib/consultas/publico";
import { listarOperacoesDoMes } from "@/lib/consultas/relatorios";
import type { OperacaoPublica, RoboPublico } from "@/lib/tipos";
import { GET } from "./route";

// A planilha do mês sem banco: as consultas são falsas. É dado bruto (25/11/2026): as colunas e a ordem não
// mudam, e os nomes ficam em português, sem as siglas que o site deixou de usar.
vi.mock("@/lib/consultas/publico", () => ({ buscarRobo: vi.fn() }));
vi.mock("@/lib/consultas/relatorios", () => ({
  ehMes: (v: unknown) => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v),
  listarOperacoesDoMes: vi.fn(),
}));

const ROBO = { slug: "robo-teste", nome: "Robô Teste" } as RoboPublico;

const MEDIDA = {
  id: 1,
  dia_pregao: "2026-10-01",
  abertura_em: "2026-10-01T12:36:17Z",
  fechamento_em: "2026-10-01T12:37:53Z",
  duracao_seg: 96,
  simbolo: "WINV26",
  lado: "venda",
  preco_entrada: 188645,
  preco_saida: 188495,
  pontos_por_contrato: 150,
  resultado_brl_por_contrato: 30,
  custos_brl_por_contrato: 0.25,
  origem: "mt5",
  mfe_pontos_por_contrato: 180,
  mae_pontos_por_contrato: -30,
} as OperacaoPublica;

const IMPORTADA = {
  ...MEDIDA,
  id: 2,
  origem: "manual",
  preco_entrada: null,
  preco_saida: null,
  resultado_brl_por_contrato: -20.5,
  custos_brl_por_contrato: 0,
  mfe_pontos_por_contrato: null,
  mae_pontos_por_contrato: null,
} as OperacaoPublica;

function pedir(mes: string) {
  return GET(new Request(`http://localhost/api/relatorios/robo-teste/${mes}/csv`), { params: Promise.resolve({ slug: "robo-teste", mes }) });
}

beforeEach(() => {
  vi.mocked(buscarRobo).mockReset().mockResolvedValue(ROBO);
  vi.mocked(listarOperacoesDoMes).mockReset().mockResolvedValue([MEDIDA, IMPORTADA]);
});

describe("GET /api/relatorios/[slug]/[mes]/csv", () => {
  it("as dezesseis colunas de sempre, na mesma ordem, com nomes em português e sem sigla", async () => {
    const res = await pedir("2026-10");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    const linhas = (await res.text()).replace(/^﻿/, "").trimEnd().split("\n");
    expect(linhas[0].split(";")).toEqual([
      "robo",
      "dia",
      "abertura",
      "fechamento",
      "duracao_seg",
      "simbolo",
      "lado",
      "preco_entrada",
      "preco_saida",
      "pontos_por_contrato",
      "bruto_brl_por_contrato",
      "custos_brl_por_contrato",
      "liquido_brl_por_contrato",
      "origem",
      "melhor_momento_pontos_por_contrato",
      "pior_momento_pontos_por_contrato",
    ]);
    expect(linhas[0]).not.toMatch(/mfe|mae|gain|loss|drawdown/i);
  });

  it("uma linha por operação, com vírgula decimal; o que não foi medido fica vazio", async () => {
    const linhas = (await (await pedir("2026-10")).text()).trimEnd().split("\n");
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toBe("robo-teste;2026-10-01;09:36:17;09:37:53;96;WINV26;venda;188645;188495;150;30;0,25;29,75;mt5;180;-30");
    // importada: sem hora de entrada, sem duração, sem preços e sem melhor e pior momento
    expect(linhas[2]).toBe("robo-teste;2026-10-01;;09:37:53;;WINV26;venda;;;150;-20,5;0;-20,5;manual;;");
  });

  it("400 para mês ilegível, 404 para robô desconhecido e para mês sem operação", async () => {
    expect((await pedir("2026-13")).status).toBe(400);
    vi.mocked(buscarRobo).mockResolvedValueOnce(null);
    expect((await pedir("2026-10")).status).toBe(404);
    vi.mocked(listarOperacoesDoMes).mockResolvedValueOnce([]);
    expect((await pedir("2026-10")).status).toBe(404);
  });
});
