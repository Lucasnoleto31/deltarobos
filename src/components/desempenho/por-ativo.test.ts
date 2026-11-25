import { describe, expect, it } from "vitest";
import { ativoDoSimbolo, juntarPorAtivo } from "./por-ativo";

const MINI_INDICE = { prefixo: "WIN", nome: "Mini Índice" };

describe("por ativo", () => {
  it("todo código que começa com o prefixo do cadastro é o ativo do robô, com o nome do cadastro", () => {
    expect(ativoDoSimbolo("WINZ26", MINI_INDICE)).toBe("Mini Índice");
    // o histórico importado vem sem vencimento
    expect(ativoDoSimbolo("WIN", MINI_INDICE)).toBe("Mini Índice");
    expect(ativoDoSimbolo(" winq26 ", MINI_INDICE)).toBe("Mini Índice");
  });

  it("sem nome no cadastro, vale o prefixo", () => {
    expect(ativoDoSimbolo("WINZ26", { prefixo: "WIN", nome: "" })).toBe("WIN");
  });

  it("código de outro ativo perde só o vencimento", () => {
    expect(ativoDoSimbolo("WDOZ26", MINI_INDICE)).toBe("WDO");
    expect(ativoDoSimbolo("WDO", MINI_INDICE)).toBe("WDO");
  });

  it("robô de um ativo só: os vencimentos viram uma linha, com as somas", () => {
    const junto = juntarPorAtivo(
      [
        { simbolo: "WINV26", total: 300, n: 10, nGain: 8 },
        { simbolo: "WINQ26", total: -100, n: 5, nGain: 2 },
        { simbolo: "WIN", total: 50, n: 1, nGain: 1 },
      ],
      MINI_INDICE,
    );
    expect(junto).toEqual([{ simbolo: "Mini Índice", total: 250, n: 16, nGain: 11 }]);
  });

  it("dois ativos: uma linha para cada, do melhor para o pior", () => {
    const junto = juntarPorAtivo(
      [
        { simbolo: "WINV26", total: -40, n: 4, nGain: 1 },
        { simbolo: "WDOX26", total: 90, n: 3, nGain: 2 },
        { simbolo: "WDOZ26", total: 10, n: 1, nGain: 1 },
      ],
      MINI_INDICE,
    );
    expect(junto.map((f) => f.simbolo)).toEqual(["WDO", "Mini Índice"]);
    expect(junto[0]).toEqual({ simbolo: "WDO", total: 100, n: 4, nGain: 3 });
  });

  it("não mexe na lista recebida", () => {
    const faixas = [{ simbolo: "WINV26", total: 1, n: 1, nGain: 1 }];
    juntarPorAtivo(faixas, MINI_INDICE);
    expect(faixas).toEqual([{ simbolo: "WINV26", total: 1, n: 1, nGain: 1 }]);
  });
});
