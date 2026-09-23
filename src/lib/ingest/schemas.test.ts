import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  corpoCandlesSchema,
  corpoDealSchema,
  corpoHeartbeatSchema,
  corpoHistorySchema,
  dealSchema,
  exposicaoDiaSchema,
  posicaoSchema,
  saldoDiaSchema,
} from "./schemas";

/** Deal exatamente como o EA 1.0.0 manda (tipo e entry numéricos, sem excursão). */
const dealAntigo = {
  ticket: 123456,
  posicao_id: 987600,
  ordem: 555,
  simbolo: "WINV26",
  tipo: 1,
  entry: 1,
  volume: 2,
  preco: 140250,
  lucro: 64,
  comissao: -1.2,
  swap: 0,
  magic: 1001,
  executado_em: "2026-09-22T13:40:00.000Z",
  comentario: "",
};

const excursao = {
  ciclo: 1,
  mfe_pontos: 320,
  mae_pontos: -85,
  mfe_em: "2026-09-22T13:35:02.410Z",
  mae_em: "2026-09-22T13:31:48.006Z",
  excursao_parcial: false,
};

const posicaoAntiga = {
  ticket: 987600,
  simbolo: "WINV26",
  lado: 0,
  magic: 1001,
  volume: 2,
  preco_abertura: 140200,
  lucro_flutuante: 30,
  aberta_em: "2026-09-22T13:30:00.000Z",
};

const exposicao = {
  magic: 1001,
  dia: "2026-09-22",
  realizado: 150,
  flutuante: 30,
  n_saidas: 3,
  mep: 410,
  mep_em: "2026-09-22T13:35:02.410Z",
  mep_n_saidas: 2,
  men: -120,
  men_em: "2026-09-22T10:31:48.006Z",
  men_n_saidas: 0,
  parcial: false,
};

const candle = { t: "2026-09-22T13:40:00.000Z", o: 140200, h: 140260, l: 140180, c: 140250, v: 1234, vr: 56780 };

let avisos: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  avisos.mockRestore();
});

describe("deal: excursão do EA 1.1.0", () => {
  it("deal do EA 1.0.0, sem os campos novos, continua passando e sem excursão", () => {
    const r = corpoDealSchema.safeParse({ ea_versao: "1.0.0", deal: dealAntigo });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.deal.ticket).toBe(123456);
    expect(r.data.deal.tipo).toBe("sell");
    expect(r.data.deal.mfe_pontos).toBeUndefined();
    expect(r.data.deal.mae_pontos).toBeUndefined();
    expect(r.data.deal.ciclo).toBeUndefined();
    expect(r.data.deal.excursao_parcial).toBeUndefined();
    expect(avisos).not.toHaveBeenCalled();
  });

  it("deal do EA 1.1.0 com excursão completa passa com os campos", () => {
    const r = dealSchema.parse({ ...dealAntigo, ...excursao });
    expect(r).toMatchObject(excursao);
  });

  it("campo de excursão malformado NÃO derruba o deal: vira undefined e avisa", () => {
    const r = dealSchema.safeParse({
      ...dealAntigo,
      ciclo: 0, // precisa ser >= 1
      mfe_pontos: "abc",
      mae_pontos: 5, // MAE é <= 0
      mfe_em: "ontem",
      mae_em: null,
      excursao_parcial: "sim",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.ticket).toBe(123456);
    expect(r.data.lucro).toBe(64);
    expect(r.data.ciclo).toBeUndefined();
    expect(r.data.mfe_pontos).toBeUndefined();
    expect(r.data.mae_pontos).toBeUndefined();
    expect(r.data.mfe_em).toBeUndefined();
    expect(r.data.mae_em).toBeUndefined();
    expect(r.data.excursao_parcial).toBeUndefined();
    expect(avisos).toHaveBeenCalled();
    expect(String(avisos.mock.calls[0][0])).toContain("[ingest] campo ciclo ignorado");
  });

  it("só o MAE malformado: o MFE sobrevive sozinho", () => {
    const r = dealSchema.parse({ ...dealAntigo, ...excursao, mae_pontos: "x" });
    expect(r.mfe_pontos).toBe(320);
    expect(r.mae_pontos).toBeUndefined();
    expect(r.mfe_em).toBe(excursao.mfe_em);
  });

  it("mfe_em e mae_em aceitam epoch em segundos, como executado_em", () => {
    const r = dealSchema.parse({ ...dealAntigo, ...excursao, mfe_em: 1790000000, mae_em: 1790000100 });
    expect(r.mfe_em).toBe(new Date(1790000000 * 1000).toISOString());
    expect(r.mae_em).toBe(new Date(1790000100 * 1000).toISOString());
  });

  it("MFE zero e MAE zero são válidos (posição que nunca saiu do preço)", () => {
    const r = dealSchema.parse({ ...dealAntigo, ciclo: 2, mfe_pontos: 0, mae_pontos: 0, excursao_parcial: true });
    expect(r).toMatchObject({ ciclo: 2, mfe_pontos: 0, mae_pontos: 0, excursao_parcial: true });
  });

  it("campo obrigatório inválido continua sendo 400 (o que era erro segue erro)", () => {
    expect(dealSchema.safeParse({ ...dealAntigo, ticket: -1 }).success).toBe(false);
    expect(dealSchema.safeParse({ ...dealAntigo, executado_em: "ontem" }).success).toBe(false);
  });

  it("página de history tolera os campos de excursão em qualquer deal", () => {
    const r = corpoHistorySchema.safeParse({
      ea_versao: "1.1.0",
      pagina: 1,
      total_paginas: 1,
      deals: [dealAntigo, { ...dealAntigo, ticket: 2, ...excursao }, { ...dealAntigo, ticket: 3, mfe_pontos: "?" }],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.deals).toHaveLength(3);
    expect(r.data.deals[1].mfe_pontos).toBe(320);
    expect(r.data.deals[2].mfe_pontos).toBeUndefined();
  });
});

describe("heartbeat: posições com excursão e exposicao_dia", () => {
  it("heartbeat do EA 1.0.0 passa: sem excursão nas posições e exposicao_dia = []", () => {
    const r = corpoHeartbeatSchema.parse({
      ea_versao: "1.0.0",
      balance: 1000,
      equity: 1030,
      posicoes: [posicaoAntiga],
      cotacoes: [{ simbolo: "WINV26", preco: 140250 }],
    });
    expect(r.posicoes).toHaveLength(1);
    expect(r.posicoes[0].lado).toBe("compra");
    expect(r.posicoes[0].posicao_id).toBeUndefined();
    expect(r.posicoes[0].mfe_pontos).toBeUndefined();
    expect(r.exposicao_dia).toEqual([]);
    expect(avisos).not.toHaveBeenCalled();
  });

  it("posição do EA 1.1.0 carrega posicao_id, ciclo, MFE/MAE e parcial", () => {
    const r = posicaoSchema.parse({
      ...posicaoAntiga,
      posicao_id: 987600,
      ciclo: 1,
      mfe_pontos: 320,
      mae_pontos: -85,
      excursao_parcial: false,
    });
    expect(r).toMatchObject({ posicao_id: 987600, ciclo: 1, mfe_pontos: 320, mae_pontos: -85, excursao_parcial: false });
  });

  it("posição com excursão malformada continua na lista, só sem a excursão", () => {
    const r = corpoHeartbeatSchema.parse({
      posicoes: [{ ...posicaoAntiga, posicao_id: "abc", mfe_pontos: -1, mae_pontos: -85 }],
    });
    expect(r.posicoes).toHaveLength(1);
    expect(r.posicoes[0].ticket).toBe(987600);
    expect(r.posicoes[0].posicao_id).toBeUndefined();
    expect(r.posicoes[0].mfe_pontos).toBeUndefined();
    expect(r.posicoes[0].mae_pontos).toBe(-85);
  });

  it("exposicao_dia válida passa inteira", () => {
    const r = corpoHeartbeatSchema.parse({ ea_versao: "1.1.0", posicoes: [], exposicao_dia: [exposicao] });
    expect(r.exposicao_dia).toEqual([exposicao]);
  });

  it("exposicao_dia com o mínimo (magic e dia) ganha os defaults", () => {
    const r = exposicaoDiaSchema.parse({ magic: 1001, dia: "2026-09-22" });
    expect(r).toEqual({
      magic: 1001,
      dia: "2026-09-22",
      realizado: 0,
      flutuante: 0,
      n_saidas: 0,
      mep: 0,
      men: 0,
      parcial: false,
    });
  });

  it("exposicao_dia malformada vira [] com aviso e o resto do heartbeat sobrevive", () => {
    const r = corpoHeartbeatSchema.safeParse({
      ea_versao: "1.1.0",
      balance: 1000,
      posicoes: [posicaoAntiga],
      exposicao_dia: [exposicao, { ...exposicao, magic: 1002, dia: "22/09/2026" }],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.exposicao_dia).toEqual([]);
    expect(r.data.posicoes).toHaveLength(1);
    expect(r.data.balance).toBe(1000);
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(String(avisos.mock.calls[0][0])).toContain("exposicao_dia ignorada em 1.dia");
  });

  it("exposicao_dia que não é lista vira []", () => {
    expect(corpoHeartbeatSchema.parse({ exposicao_dia: "x" }).exposicao_dia).toEqual([]);
    expect(corpoHeartbeatSchema.parse({ exposicao_dia: null }).exposicao_dia).toEqual([]);
  });

  it("exposicao_dia com mais de 50 magics vira []", () => {
    const muitos = Array.from({ length: 51 }, (_, i) => ({ ...exposicao, magic: 1000 + i }));
    expect(corpoHeartbeatSchema.parse({ exposicao_dia: muitos }).exposicao_dia).toEqual([]);
  });

  it("MEP negativo ou MEN positivo é malformado (o EA parte de zero nos dois)", () => {
    expect(exposicaoDiaSchema.safeParse({ ...exposicao, mep: -1 }).success).toBe(false);
    expect(exposicaoDiaSchema.safeParse({ ...exposicao, men: 1 }).success).toBe(false);
    expect(exposicaoDiaSchema.safeParse({ ...exposicao, mep: 0, men: 0, mep_em: null, men_em: null }).success).toBe(true);
  });

  describe("regras_aplicadas (EA 1.1.1)", () => {
    it("ausente (EA 1.1.0) fica undefined, sem aviso: o banco grava false", () => {
      const r = exposicaoDiaSchema.parse(exposicao);
      expect(r.regras_aplicadas).toBeUndefined();
      expect("regras_aplicadas" in JSON.parse(JSON.stringify(r))).toBe(false);
      expect(avisos).not.toHaveBeenCalled();
    });

    it("true e false passam como vieram", () => {
      expect(exposicaoDiaSchema.parse({ ...exposicao, regras_aplicadas: true }).regras_aplicadas).toBe(true);
      expect(exposicaoDiaSchema.parse({ ...exposicao, regras_aplicadas: false }).regras_aplicadas).toBe(false);
    });

    it("malformado NÃO derruba a exposição: vira undefined com aviso e o resto fica", () => {
      const r = exposicaoDiaSchema.safeParse({ ...exposicao, regras_aplicadas: "sim" });
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data.regras_aplicadas).toBeUndefined();
      expect(r.data.mep).toBe(410);
      expect(r.data.n_saidas).toBe(3);
      expect(avisos).toHaveBeenCalledTimes(1);
      expect(String(avisos.mock.calls[0][0])).toContain("[ingest] campo regras_aplicadas ignorado");
      // 1 e null também não são boolean
      expect(exposicaoDiaSchema.parse({ ...exposicao, regras_aplicadas: 1 }).regras_aplicadas).toBeUndefined();
      expect(exposicaoDiaSchema.parse({ ...exposicao, regras_aplicadas: null }).regras_aplicadas).toBeUndefined();
    });

    it("no heartbeat, a lista inteira passa com o campo e sem aviso", () => {
      const r = corpoHeartbeatSchema.parse({
        ea_versao: "1.1.1",
        posicoes: [],
        exposicao_dia: [{ ...exposicao, regras_aplicadas: true }, { ...exposicao, magic: 1002 }],
      });
      expect(r.exposicao_dia).toHaveLength(2);
      expect(r.exposicao_dia[0].regras_aplicadas).toBe(true);
      expect(r.exposicao_dia[1].regras_aplicadas).toBeUndefined();
      expect(avisos).not.toHaveBeenCalled();
    });
  });

  describe("regras_versao (EA 1.1.1)", () => {
    it("ausente fica undefined, sem aviso: o banco grava nula", () => {
      const r = exposicaoDiaSchema.parse({ ...exposicao, regras_aplicadas: true });
      expect(r.regras_versao).toBeUndefined();
      expect(avisos).not.toHaveBeenCalled();
    });

    it("texto passa como veio (opaco: o banco compara com regras_publicas_versao)", () => {
      const r = exposicaoDiaSchema.parse({ ...exposicao, regras_aplicadas: true, regras_versao: "09:10:00|2|2026-09-21" });
      expect(r.regras_versao).toBe("09:10:00|2|2026-09-21");
      expect(exposicaoDiaSchema.parse({ ...exposicao, regras_versao: "||" }).regras_versao).toBe("||");
    });

    it("malformada NÃO derruba a exposição: vira undefined com aviso e o resto fica", () => {
      const r = exposicaoDiaSchema.safeParse({ ...exposicao, regras_aplicadas: true, regras_versao: 12 });
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.data.regras_versao).toBeUndefined();
      expect(r.data.regras_aplicadas).toBe(true);
      expect(r.data.mep).toBe(410);
      expect(avisos).toHaveBeenCalledTimes(1);
      expect(String(avisos.mock.calls[0][0])).toContain("[ingest] campo regras_versao ignorado");
      // vazia, nula ou comprida demais também não valem
      expect(exposicaoDiaSchema.parse({ ...exposicao, regras_versao: "" }).regras_versao).toBeUndefined();
      expect(exposicaoDiaSchema.parse({ ...exposicao, regras_versao: null }).regras_versao).toBeUndefined();
      expect(exposicaoDiaSchema.parse({ ...exposicao, regras_versao: "x".repeat(121) }).regras_versao).toBeUndefined();
    });

    it("no heartbeat, o item leva a versão junto de regras_aplicadas e o 1.1.0 continua sem os dois", () => {
      const r = corpoHeartbeatSchema.parse({
        ea_versao: "1.1.1",
        posicoes: [],
        exposicao_dia: [{ ...exposicao, regras_aplicadas: true, regras_versao: "||" }, { ...exposicao, magic: 1002 }],
      });
      expect(r.exposicao_dia[0]).toMatchObject({ regras_aplicadas: true, regras_versao: "||" });
      expect(r.exposicao_dia[1].regras_aplicadas).toBeUndefined();
      expect(r.exposicao_dia[1].regras_versao).toBeUndefined();
      expect(avisos).not.toHaveBeenCalled();
    });
  });
});

describe("heartbeat: saldo_dia (EA 1.1.2)", () => {
  /** Item exatamente como o EA 1.1.2 manda: baldes fechados [t_epoch_utc_s, min, max, ultimo]. */
  const saldoDia = {
    magic: 1001,
    dia: "2026-09-23",
    regras_aplicadas: true,
    baldes: [
      [1790000000, -12.5, 30, 18.25],
      [1790000005, 18.25, 42.1234, 40],
      [1790000010, 35, 40, 35],
    ],
  };

  it("EA antigo sem o campo: saldo_dia = [] sem aviso, e o resto do heartbeat igual", () => {
    const r = corpoHeartbeatSchema.parse({
      ea_versao: "1.1.1",
      balance: 1000,
      equity: 1030,
      posicoes: [posicaoAntiga],
      exposicao_dia: [{ ...exposicao, regras_aplicadas: true, regras_versao: "||" }],
    });
    expect(r.saldo_dia).toEqual([]);
    expect(r.posicoes).toHaveLength(1);
    expect(r.exposicao_dia).toHaveLength(1);
    expect(avisos).not.toHaveBeenCalled();
  });

  it("item válido passa inteiro, com os baldes como tuplas de 4 números", () => {
    const r = corpoHeartbeatSchema.parse({ ea_versao: "1.1.2", posicoes: [], saldo_dia: [saldoDia] });
    expect(r.saldo_dia).toEqual([saldoDia]);
    expect(r.saldo_dia[0].baldes[1]).toEqual([1790000005, 18.25, 42.1234, 40]);
    expect(avisos).not.toHaveBeenCalled();
  });

  it("item com baldes vazio é válido (nada novo desde o último heartbeat)", () => {
    const r = saldoDiaSchema.parse({ ...saldoDia, baldes: [] });
    expect(r.baldes).toEqual([]);
    expect(avisos).not.toHaveBeenCalled();
  });

  it("regras_aplicadas ausente fica undefined (o banco grava false); malformada vira undefined com aviso e o item fica", () => {
    const semRegras = saldoDiaSchema.parse({ magic: 1001, dia: "2026-09-23", baldes: saldoDia.baldes });
    expect(semRegras.regras_aplicadas).toBeUndefined();
    expect("regras_aplicadas" in JSON.parse(JSON.stringify(semRegras))).toBe(false);
    expect(semRegras.baldes).toHaveLength(3);
    expect(avisos).not.toHaveBeenCalled();

    expect(saldoDiaSchema.parse({ ...saldoDia, regras_aplicadas: false }).regras_aplicadas).toBe(false);

    const malformada = saldoDiaSchema.parse({ ...saldoDia, regras_aplicadas: "sim" });
    expect(malformada.regras_aplicadas).toBeUndefined();
    expect(malformada.baldes).toHaveLength(3);
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(String(avisos.mock.calls[0][0])).toContain("[ingest] campo regras_aplicadas ignorado");
  });

  it("item malformado é ignorado sozinho, com aviso; os outros itens e o resto do heartbeat ficam", () => {
    const r = corpoHeartbeatSchema.safeParse({
      ea_versao: "1.1.2",
      balance: 1000,
      posicoes: [posicaoAntiga],
      saldo_dia: [
        saldoDia,
        { ...saldoDia, magic: 1002, dia: "23/09/2026" }, // dia fora do formato
        { ...saldoDia, magic: -1 }, // magic negativo
        { ...saldoDia, magic: 1003, baldes: "x" }, // baldes que não é lista
        "lixo", // nem objeto é
        { ...saldoDia, magic: 1004 },
      ],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.saldo_dia.map((s) => s.magic)).toEqual([1001, 1004]);
    expect(r.data.posicoes).toHaveLength(1);
    expect(r.data.balance).toBe(1000);
    expect(avisos).toHaveBeenCalledTimes(4);
    expect(String(avisos.mock.calls[0][0])).toContain("[ingest] saldo_dia: item 1 ignorado em dia");
    expect(String(avisos.mock.calls[1][0])).toContain("[ingest] saldo_dia: item 2 ignorado em magic");
    expect(String(avisos.mock.calls[2][0])).toContain("[ingest] saldo_dia: item 3 ignorado em baldes");
    expect(String(avisos.mock.calls[3][0])).toContain("[ingest] saldo_dia: item 4 ignorado");
  });

  it("balde malformado é descartado sozinho, com UM aviso por item; os demais baldes ficam", () => {
    const r = corpoHeartbeatSchema.parse({
      saldo_dia: [
        {
          ...saldoDia,
          baldes: [
            [1790000000, -12.5, 30, 18.25],
            [1790000005, 1, 2], // faltou o último
            ["1790000010", 1, 2, 3], // t como texto
            [1790000015.5, 1, 2, 3], // t não inteiro
            [0, 1, 2, 3], // t zero
            [1790000020, 1, 2, 3, 4], // sobrou posição
            [1790000000000, 1, 2, 3], // t em milissegundos (o banco também descartaria, mas em silêncio)
            null,
            [1790000025, 35, 40, 35],
          ],
        },
        { ...saldoDia, magic: 1002 },
      ],
    });
    expect(r.saldo_dia).toHaveLength(2);
    expect(r.saldo_dia[0].baldes).toEqual([
      [1790000000, -12.5, 30, 18.25],
      [1790000025, 35, 40, 35],
    ]);
    expect(r.saldo_dia[1].baldes).toHaveLength(3);
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(String(avisos.mock.calls[0][0])).toContain("[ingest] saldo_dia: 7 balde(s) malformado(s) ignorado(s) no magic 1001 (2026-09-23)");
  });

  it("t no limite: 99_999_999_999 passa, 100_000_000_000 (já é milissegundo) não", () => {
    expect(saldoDiaSchema.parse({ ...saldoDia, baldes: [[99_999_999_999, 1, 2, 1.5]] }).baldes).toHaveLength(1);
    expect(saldoDiaSchema.parse({ ...saldoDia, baldes: [[100_000_000_000, 1, 2, 1.5]] }).baldes).toHaveLength(0);
    expect(avisos).toHaveBeenCalledTimes(1);
  });

  it("mais de 720 baldes num item: o item é ignorado com aviso (o EA nunca passa do buffer)", () => {
    const muitos = Array.from({ length: 721 }, (_, i) => [1790000000 + i * 5, 1, 2, 1.5]);
    const r = corpoHeartbeatSchema.parse({ saldo_dia: [{ ...saldoDia, baldes: muitos }, { ...saldoDia, magic: 1002 }] });
    expect(r.saldo_dia.map((s) => s.magic)).toEqual([1002]);
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(String(avisos.mock.calls[0][0])).toContain("[ingest] saldo_dia: item 0 ignorado em baldes");
    // exatamente 720 passa
    expect(saldoDiaSchema.parse({ ...saldoDia, baldes: muitos.slice(0, 720) }).baldes).toHaveLength(720);
  });

  it("saldo_dia que não é lista vira [] com aviso (nunca 400)", () => {
    expect(corpoHeartbeatSchema.parse({ saldo_dia: "x" }).saldo_dia).toEqual([]);
    expect(corpoHeartbeatSchema.parse({ saldo_dia: null }).saldo_dia).toEqual([]);
    expect(corpoHeartbeatSchema.parse({ saldo_dia: { magic: 1001 } }).saldo_dia).toEqual([]);
    expect(avisos).toHaveBeenCalledTimes(3);
    expect(String(avisos.mock.calls[0][0])).toContain("[ingest] saldo_dia ignorado");
  });

  it("mais de 50 itens: seguem os 50 primeiros com aviso (zerar a lista perderia baldes que o EA já dá por enviados)", () => {
    const muitos = Array.from({ length: 51 }, (_, i) => ({ ...saldoDia, magic: 1000 + i }));
    const r = corpoHeartbeatSchema.parse({ saldo_dia: muitos });
    expect(r.saldo_dia).toHaveLength(50);
    expect(r.saldo_dia[0].magic).toBe(1000);
    expect(r.saldo_dia[49].magic).toBe(1049);
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(String(avisos.mock.calls[0][0])).toContain("[ingest] saldo_dia: 51 itens, só os 50 primeiros seguem");
    // exatamente 50 passa sem aviso
    expect(corpoHeartbeatSchema.parse({ saldo_dia: muitos.slice(0, 50) }).saldo_dia).toHaveLength(50);
    expect(avisos).toHaveBeenCalledTimes(1);
  });

  it("o JSON que vai para a RPC leva só o que o banco espera (baldes validados, sem undefined)", () => {
    const r = corpoHeartbeatSchema.parse({
      saldo_dia: [{ magic: 1001, dia: "2026-09-23", baldes: [[1790000000, -1, 1, 0], [1790000005, 1, 2]] }],
    });
    expect(JSON.parse(JSON.stringify(r.saldo_dia))).toEqual([{ magic: 1001, dia: "2026-09-23", baldes: [[1790000000, -1, 1, 0]] }]);
  });
});

describe("candles", () => {
  it("corpo válido passa; timeframe e v ganham default", () => {
    const r = corpoCandlesSchema.parse({ ea_versao: "1.1.0", simbolo: "WINV26", candles: [candle] });
    expect(r.timeframe).toBe("M1");
    expect(r.candles[0]).toEqual(candle);
    const semVolume = corpoCandlesSchema.parse({ simbolo: "WINV26", timeframe: "m1", candles: [{ ...candle, v: undefined, vr: undefined }] });
    expect(semVolume.timeframe).toBe("M1");
    expect(semVolume.candles[0].v).toBe(0);
    expect(semVolume.candles[0].vr).toBeUndefined();
  });

  it("t aceita epoch em segundos", () => {
    const r = corpoCandlesSchema.parse({ simbolo: "WINV26", candles: [{ ...candle, t: 1790000400 }] });
    expect(r.candles[0].t).toBe(new Date(1790000400 * 1000).toISOString());
  });

  it("lista vazia é válida (o EA pode não ter barra nova)", () => {
    expect(corpoCandlesSchema.parse({ simbolo: "WINV26", candles: [] }).candles).toEqual([]);
  });

  it("candle com mínima acima da abertura/fechamento é inválido (corpo inteiro cai)", () => {
    const r = corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: [candle, { ...candle, l: 140210 }] });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0].path).toEqual(["candles", 1]);
  });

  it("candle fora do minuto cheio (segundos ou milissegundos) é inválido", () => {
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: [{ ...candle, t: "2026-09-22T13:40:01.000Z" }] }).success).toBe(false);
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: [{ ...candle, t: "2026-09-22T13:39:59.000Z" }] }).success).toBe(false);
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: [{ ...candle, t: "2026-09-22T13:40:00.500Z" }] }).success).toBe(false);
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: [{ ...candle, t: 1790000401 }] }).success).toBe(false);
    // com offset (-03:00) também vale: o instante é o mesmo minuto cheio
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: [{ ...candle, t: "2026-09-22T10:40:00-03:00" }] }).success).toBe(true);
  });

  it("candle com máxima abaixo da abertura/fechamento é inválido", () => {
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: [{ ...candle, h: 140240 }] }).success).toBe(false);
  });

  it("doji e barra plana são válidos (l = o = c = h)", () => {
    const plana = { ...candle, o: 140200, h: 140200, l: 140200, c: 140200 };
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: [plana] }).success).toBe(true);
  });

  it("mais de 200 candles, símbolo vazio, timeframe estranho, preço negativo e data inválida são 400", () => {
    const muitos = Array.from({ length: 201 }, (_, i) => ({ ...candle, t: 1790000400 + i * 60 }));
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: muitos }).success).toBe(false);
    expect(corpoCandlesSchema.safeParse({ simbolo: "", candles: [candle] }).success).toBe(false);
    expect(corpoCandlesSchema.safeParse({ candles: [candle] }).success).toBe(false);
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", timeframe: "X9", candles: [candle] }).success).toBe(false);
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: [{ ...candle, o: -1, l: -1 }] }).success).toBe(false);
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: [{ ...candle, t: "hoje" }] }).success).toBe(false);
    expect(corpoCandlesSchema.safeParse({ simbolo: "WINV26", candles: [{ ...candle, v: 1.5 }] }).success).toBe(false);
  });
});
