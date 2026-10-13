import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PISO_TINTA, TETO_TINTA, fundoTinta, tomDoResultado } from "./tinta";

type Rgb = [number, number, number];

// os tokens de verdade, lidos do globals.css: se alguém trocar o verde ou o vermelho, o teste diz se a tinta
// ainda passa de 4,5:1
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function bloco(seletor: ":root" | ".dark", indice = 0): string {
  const partes = css.split(new RegExp(`^${seletor.replace(".", "\\.")} \\{`, "m"));
  const corpo = partes[indice + 1];
  if (!corpo) throw new Error(`bloco ${seletor} #${indice} não encontrado`);
  return corpo.slice(0, corpo.indexOf("\n}"));
}

function hex(corpo: string, nome: string): Rgb {
  const m = new RegExp(`--${nome}:\\s*#([0-9a-f]{6})`, "i").exec(corpo);
  if (!m) throw new Error(`--${nome} não encontrado`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as Rgb;
}

const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminancia = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contraste = (a: Rgb, b: Rgb) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const misturar = (a: Rgb, b: Rgb, p: number): Rgb => a.map((v, i) => v * p + b[i] * (1 - p)) as Rgb;

const claro = bloco(":root");
const escuro = bloco(".dark");
// o cartão: branco no claro; no escuro, o topo do degradê do .painel (o trecho mais claro, o pior caso)
const cartaoClaro: Rgb = [255, 255, 255];
const cartaoEscuro = misturar([150, 178, 255], hex(escuro, "background"), 0.075);

describe("tinta das células de resultado", () => {
  it.each([
    ["claro", claro, cartaoClaro],
    ["escuro", escuro, cartaoEscuro],
  ] as const)("texto da tinta passa de 4,5:1 sobre o fundo no teto, tema %s", (_, tokens, cartao) => {
    for (const tom of ["positivo", "negativo", "alerta"] as const) {
      const cor = hex(tokens, tom);
      const fundo = misturar(cor, cartao, TETO_TINTA / 100);
      const texto = misturar(cor, hex(tokens, "foreground"), 0.6);
      expect(contraste(texto, fundo), `${tom}`).toBeGreaterThanOrEqual(4.5);
      // o dia do mês e o "N op" da casa: a cor do texto a 85%
      expect(contraste(misturar(hex(tokens, "foreground"), fundo, 0.85), fundo), `${tom} secundário`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("fundo vai do piso ao teto pela força, e fica dentro dos limites", () => {
    expect(fundoTinta("positivo", 0)).toBe(`color-mix(in srgb, var(--positivo) ${PISO_TINTA}%, transparent)`);
    expect(fundoTinta("negativo", 1)).toBe(`color-mix(in srgb, var(--negativo) ${TETO_TINTA}%, transparent)`);
    expect(fundoTinta("positivo", 7)).toBe(fundoTinta("positivo", 1));
    expect(fundoTinta("positivo", -1)).toBe(fundoTinta("positivo", 0));
    expect(fundoTinta("positivo", Number.NaN)).toBe(fundoTinta("positivo", 0));
  });

  it("tom pelo sinal, zero sem tom", () => {
    expect(tomDoResultado(12.5)).toBe("positivo");
    expect(tomDoResultado(-0.01)).toBe("negativo");
    expect(tomDoResultado(0)).toBeNull();
  });
});
