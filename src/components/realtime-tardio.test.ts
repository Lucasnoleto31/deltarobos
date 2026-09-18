import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Os providers do ao vivo copiam a inicialização dos hooks para o cliente do
// Supabase sair do primeiro carregamento (18/09/2026). Estes testes avisam se
// a cópia descolar do hook ou se o import do hook voltar a ser de valor.

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

/** Corpo do objeto inicial do useState<Estado…>, sem espaços, para comparar. */
function inicializacao(fonte: string, tipo: string): string {
  const i = fonte.indexOf(`useState<${tipo}>(`);
  if (i < 0) throw new Error(`useState<${tipo}> não encontrado`);
  const abre = fonte.indexOf("{", i);
  // o objeto inicial não tem chaves aninhadas: a primeira "}" o fecha
  return fonte.slice(abre + 1, fonte.indexOf("}", abre)).replace(/\s+/g, "");
}

const casos = [
  {
    hook: "src/hooks/useRoboAoVivo.ts",
    provider: "src/components/robo/RoboAoVivoProvider.tsx",
    tipo: "EstadoRoboAoVivo",
    modulo: "@/hooks/useRoboAoVivo",
  },
  {
    hook: "src/hooks/useCasaAoVivo.ts",
    provider: "src/components/home/CasaAoVivoProvider.tsx",
    tipo: "EstadoCasaAoVivo",
    modulo: "@/hooks/useCasaAoVivo",
  },
];

describe("realtime carregado depois da hidratação", () => {
  for (const c of casos) {
    it(`${c.provider} nasce com o mesmo estado que o hook`, () => {
      expect(inicializacao(ler(c.provider), c.tipo)).toBe(inicializacao(ler(c.hook), c.tipo));
    });

    it(`${c.provider} importa do hook só tipos`, () => {
      const fonte = ler(c.provider);
      const imports = fonte.match(new RegExp(`^import .*from "${c.modulo}";$`, "gm")) ?? [];
      expect(imports.length).toBeGreaterThan(0);
      for (const linha of imports) expect(linha).toMatch(/^import type /);
      expect(fonte).not.toContain("@/lib/supabase/cliente");
      expect(fonte).not.toContain("@supabase/supabase-js");
    });
  }

  it("a ordenação copiada no provider do robô é a mesma do hook", () => {
    const corpo = (f: string) =>
      f.match(/function ordenarOperacoes[\s\S]*?\n\}/)?.[0].replace(/\s+/g, "") ?? "";
    const doHook = corpo(ler("src/hooks/useRoboAoVivo.ts"));
    expect(doHook).not.toBe("");
    expect(corpo(ler("src/components/robo/RoboAoVivoProvider.tsx"))).toBe(doHook);
  });
});
