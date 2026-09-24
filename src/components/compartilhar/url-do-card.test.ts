import { describe, expect, it } from "vitest";
import { DIMENSOES_CARD, FORMATOS_CARD, formatoDoParametro, nomeDoArquivo, urlDoCard, versaoDoCard } from "./url-do-card";

describe("url-do-card (imagem do dia, 24/09/2026)", () => {
  it("urlDoCard: caminho relativo, com a versão só quando existe", () => {
    expect(urlDoCard("apollo", "2026-09-23", "quadrado")).toBe("/api/og/apollo/2026-09-23?formato=quadrado");
    expect(urlDoCard("apollo", "2026-09-23", "quadrado", "68-29836979")).toBe("/api/og/apollo/2026-09-23?formato=quadrado&v=68-29836979");
    expect(urlDoCard("apollo", "2026-09-23", "story", "")).toBe("/api/og/apollo/2026-09-23?formato=story");
    // slug estranho não quebra o caminho
    expect(urlDoCard("a b/c", "2026-09-23", "story")).toBe("/api/og/a%20b%2Fc/2026-09-23?formato=story");
  });

  it("nomeDoArquivo", () => {
    expect(nomeDoArquivo("apollo", "2026-09-23", "story")).toBe("quants-apollo-2026-09-23-story.png");
    expect(nomeDoArquivo("robo novo/x", "2026-09-23", "quadrado")).toBe("quants-robo-novo-x-2026-09-23-quadrado.png");
  });

  it("versaoDoCard: operações e o minuto do último dado", () => {
    expect(versaoDoCard(68)).toBe("68");
    expect(versaoDoCard(68, 1790218790)).toBe("68-29836979");
    expect(versaoDoCard(68, null)).toBe("68");
    // dentro do mesmo minuto, a mesma versão (a CDN guarda por URL)
    expect(versaoDoCard(68, 1790218740)).toBe(versaoDoCard(68, 1790218799));
  });

  it("formatoDoParametro: só 'story' vira story", () => {
    expect(formatoDoParametro("story")).toBe("story");
    expect(formatoDoParametro(null)).toBe("quadrado");
    expect(formatoDoParametro(undefined)).toBe("quadrado");
    expect(formatoDoParametro("")).toBe("quadrado");
    expect(formatoDoParametro("xyz")).toBe("quadrado");
    expect(formatoDoParametro("STORY")).toBe("quadrado");
  });

  it("formatos e dimensões", () => {
    expect(FORMATOS_CARD.map((f) => f.valor)).toEqual(["quadrado", "story"]);
    expect(DIMENSOES_CARD.quadrado).toEqual({ largura: 1080, altura: 1080 });
    expect(DIMENSOES_CARD.story).toEqual({ largura: 1080, altura: 1920 });
  });
});
