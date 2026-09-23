import { describe, expect, it } from "vitest";
import { GLOSSARIO, type ChaveIndicador } from "./glossario";

// as regras mecânicas do texto do "o que é" (19/09/2026); o tom (leigo, sem marketing) se confere lendo
const entradas = Object.entries(GLOSSARIO) as Array<[ChaveIndicador, (typeof GLOSSARIO)[ChaveIndicador]]>;

/** primeira palavra, sem acento de caixa e sem pontuação em volta */
function primeiraPalavra(s: string): string {
  return (s.trim().split(/\s+/)[0] ?? "").toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]/gu, "");
}

describe("glossário de indicadores", () => {
  it("tem entradas", () => {
    expect(entradas.length).toBeGreaterThan(40);
  });

  it.each(entradas)("%s: texto de 20 a 260 caracteres, terminando em ponto", (_chave, e) => {
    expect(e.nome.trim().length).toBeGreaterThan(0);
    expect(e.texto.length).toBeGreaterThanOrEqual(20);
    expect(e.texto.length).toBeLessThanOrEqual(260);
    expect(e.texto.endsWith(".")).toBe(true);
    expect(e.texto).toBe(e.texto.trim());
  });

  it.each(entradas)("%s: sem símbolo de conta nem exclamação", (_chave, e) => {
    expect(e.texto).not.toMatch(/[÷×!]/);
  });

  it.each(entradas)("%s: não começa repetindo o nome", (_chave, e) => {
    expect(primeiraPalavra(e.texto)).not.toBe(primeiraPalavra(e.nome));
  });

  // a marca mudou em 19/09/2026: nada de nome antigo nem de corretora pelo nome
  it.each(entradas)("%s: sem marca antiga nem corretora pelo nome", (_chave, e) => {
    expect(`${e.nome} ${e.texto}`).not.toMatch(/delta|btg/i);
  });

  // 21/09/2026: o contador conta entradas ainda abertas, e o texto tem que dizer que não é contrato
  it("operações em aberto: cada entrada conta 1, e não é número de contratos", () => {
    const e = GLOSSARIO.operacoesEmAberto;
    expect(e.nome).toBe("Operações em aberto");
    expect(e.texto).toMatch(/conta 1/);
    expect(e.texto).toMatch(/contratos/);
  });

  // 22/09/2026: MEP/MEN com duas fontes (tick a tick pelo coletor 1.1.0, ou por fechamento) e MFE/MAE
  it("MEP/MEN citam as duas fontes; MFE/MAE são por operação, em pontos", () => {
    for (const chave of ["mep", "men"] as const) {
      const e = GLOSSARIO[chave];
      expect(e.texto).toMatch(/movimento do preço/);
      expect(e.texto).toMatch(/operação fechada/);
    }
    expect(GLOSSARIO.mfe.nome).toMatch(/^MFE/);
    expect(GLOSSARIO.mae.nome).toMatch(/^MAE/);
    for (const chave of ["mfe", "mae"] as const) {
      const e = GLOSSARIO[chave];
      expect(e.texto).toMatch(/pontos por contrato/);
      expect(e.texto).toMatch(/enquanto ela esteve aberta/);
    }
    expect(GLOSSARIO.mfe.texto).toMatch(/a favor/);
    expect(GLOSSARIO.mae.texto).toMatch(/contra/);
  });

  // 23/09/2026: a curva do dia com duas fontes (série do saldo do EA 1.1.2 a cada 5 s, ou por fechamento), a
  // faixa mín./máx. de cada balde e os dentes de MFE/MAE nas curvas por operação
  it("curva do dia cita as duas fontes; faixa e dentes descrevem o desenho", () => {
    expect(GLOSSARIO.curvaDoDia.nome).toBe("Curva do dia");
    expect(GLOSSARIO.curvaDoDia.texto).toMatch(/5 segundos/);
    expect(GLOSSARIO.curvaDoDia.texto).toMatch(/operação por operação/);
    expect(GLOSSARIO.faixaSaldo.texto).toMatch(/menor e o maior/);
    expect(GLOSSARIO.dentesExcursao.nome).toMatch(/MFE e MAE/);
    expect(GLOSSARIO.dentesExcursao.texto).toMatch(/MetaTrader/);
    expect(GLOSSARIO.dentesExcursao.texto).toMatch(/aberta/);
  });

  it("o lote sai da constante das faixas", () => {
    expect(GLOSSARIO.lote.texto).toContain("100% em Ligar");
    expect(GLOSSARIO.lote.texto).toContain("0% em Evitar");
  });
});
