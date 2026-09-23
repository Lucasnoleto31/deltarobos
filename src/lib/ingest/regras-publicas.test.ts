import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RPC_REGRAS, montarRegras, normalizarHoraMinima } from "./regras-publicas";

const CONTA = "11111111-1111-1111-1111-111111111111";
const OUTRA = "99999999-9999-9999-9999-999999999999";

/** Linhas como regras_publicas_da_conta devolve (migration 0023): colunas cruas do robô + versão. */
const apollo = {
  magic: 28079412,
  slug: "apollo",
  conta_principal_id: CONTA,
  hora_minima_operacao: "09:10:00",
  duracao_minima_seg: 2,
  duracao_minima_desde: "2026-09-21",
  versao: "09:10:00|2|2026-09-21",
};
const orion = {
  magic: 28079413,
  slug: "orion",
  conta_principal_id: CONTA,
  hora_minima_operacao: null,
  duracao_minima_seg: null,
  duracao_minima_desde: null,
  versao: "||",
};
const alaskaDeOutraConta = {
  magic: 5,
  slug: "alaska",
  conta_principal_id: OUTRA,
  hora_minima_operacao: "09:05:00",
  duracao_minima_seg: 3,
  duracao_minima_desde: null,
  versao: "09:05:00|3|",
};

let avisos: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  avisos.mockRestore();
});

describe("montarRegras", () => {
  it("um item por magic da conta, no formato do contrato do EA 1.1.1 mais a versão, em ordem de slug", () => {
    expect(montarRegras([orion, apollo], CONTA)).toEqual([
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
    expect(avisos).not.toHaveBeenCalled();
  });

  it("magic cujo robô tem outra conta como principal fica de fora (mesmo que a função do banco devolvesse)", () => {
    const regras = montarRegras([apollo, alaskaDeOutraConta], CONTA);
    expect(regras.map((r) => r.slug)).toEqual(["apollo"]);
  });

  it("robô sem regra continua na lista com nulos e versão (o EA precisa saber que a regra foi removida)", () => {
    expect(montarRegras([orion], CONTA)).toEqual([
      { magic: 28079413, slug: "orion", hora_minima: null, duracao_minima_seg: null, duracao_minima_desde: null, versao: "||" },
    ]);
  });

  it("duracao_minima_desde só acompanha uma duração mínima; duração zero ou negativa é sem regra", () => {
    const semDuracao = { ...apollo, duracao_minima_seg: null };
    expect(montarRegras([semDuracao], CONTA)[0]).toMatchObject({ duracao_minima_seg: null, duracao_minima_desde: null });
    const zero = { ...apollo, duracao_minima_seg: 0 };
    expect(montarRegras([zero], CONTA)[0]).toMatchObject({ duracao_minima_seg: null, duracao_minima_desde: null });
    const semDesde = { ...apollo, duracao_minima_desde: null };
    expect(montarRegras([semDesde], CONTA)[0]).toMatchObject({ duracao_minima_seg: 2, duracao_minima_desde: null });
  });

  it("a versão é opaca: passa como veio do banco, sem normalização", () => {
    const r = montarRegras([{ ...apollo, versao: "qualquer-coisa" }], CONTA);
    expect(r[0].versao).toBe("qualquer-coisa");
  });

  it("linha sem versão (ou com versão vazia) é ignorada com aviso: sem ela a view nunca publicaria a medição", () => {
    const { versao: _v, ...semVersao } = apollo;
    void _v;
    expect(montarRegras([semVersao, orion], CONTA).map((r) => r.slug)).toEqual(["orion"]);
    expect(montarRegras([{ ...apollo, versao: "" }], CONTA)).toEqual([]);
    expect(avisos).toHaveBeenCalled();
  });

  it("magic pode vir como texto (int8)", () => {
    const r = montarRegras([{ ...apollo, magic: "28079412" }], CONTA);
    expect(r).toHaveLength(1);
    expect(r[0].magic).toBe(28079412);
    expect(r[0].slug).toBe("apollo");
  });

  it("dois magics do mesmo robô: os dois entram, em ordem de magic", () => {
    const b = { ...apollo, magic: 28079400 };
    expect(montarRegras([apollo, b], CONTA).map((r) => r.magic)).toEqual([28079400, 28079412]);
  });

  it("linha malformada ou entrada que não é lista: ignora com aviso e nunca lança", () => {
    expect(montarRegras(null, CONTA)).toEqual([]);
    expect(montarRegras("x", CONTA)).toEqual([]);
    expect(montarRegras([{ ...apollo, magic: -1 }, { ...apollo, slug: "" }, 42, apollo], CONTA)).toHaveLength(1);
    expect(avisos).toHaveBeenCalled();
  });

  it("nunca leva numero_conta nem conta_id, mesmo que a linha traga", () => {
    const comLixo = { ...apollo, conta_id: CONTA, numero_conta: "123456", contas_matriz: { numero_conta: "123456" } };
    const json = JSON.stringify(montarRegras([comLixo], CONTA));
    expect(json).not.toContain("numero_conta");
    expect(json).not.toContain("conta_id");
    expect(json).not.toContain(CONTA);
  });

  it("a rota chama a função do banco pelo nome da migration 0023", () => {
    expect(RPC_REGRAS).toBe("regras_publicas_da_conta");
  });
});

describe("normalizarHoraMinima", () => {
  it("time do Postgres vira HH:MM; segundos só ficam quando não são zero", () => {
    expect(normalizarHoraMinima("09:10:00")).toBe("09:10");
    expect(normalizarHoraMinima("09:10")).toBe("09:10");
    expect(normalizarHoraMinima("09:10:30")).toBe("09:10:30");
    expect(normalizarHoraMinima("09:10:00.000")).toBe("09:10");
  });

  it("nulo, vazio ou texto estranho é sem regra", () => {
    expect(normalizarHoraMinima(null)).toBeNull();
    expect(normalizarHoraMinima(undefined)).toBeNull();
    expect(normalizarHoraMinima("")).toBeNull();
    expect(normalizarHoraMinima("9h10")).toBeNull();
    expect(avisos).toHaveBeenCalled();
  });
});
