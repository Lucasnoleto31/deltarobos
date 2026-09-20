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

  it("o lote sai da constante das faixas", () => {
    expect(GLOSSARIO.lote.texto).toContain("100% em Ligar");
    expect(GLOSSARIO.lote.texto).toContain("0% em Evitar");
  });
});
