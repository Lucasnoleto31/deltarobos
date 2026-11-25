import { cache } from "react";
import { picoDeEntradasAbertas } from "@/lib/stats/indicadores-robo";
import { supabasePublico } from "@/lib/supabase/servidor";

function avisar(onde: string, e: unknown) {
  console.warn(`[consultas] ${onde}: ${e instanceof Error ? e.message : String(e)}`);
}

export interface PicoDoRobo {
  /** o máximo de entradas que o robô já teve abertas ao mesmo tempo, no período acompanhado ao vivo */
  maximo: number;
  /** quando foi (ISO), ou nulo */
  quando: string | null;
}

/**
 * Quantas entradas o robô já teve abertas ao mesmo tempo, medido nas operações coletadas ao vivo (as
 * importadas não têm horário de entrada). "Com 1 contrato" é por entrada: o robô que acumula entradas
 * contra o movimento chega a carregar dezenas, e é isso que dimensiona a garantia e o capital.
 * Busca só os dois horários de cada operação, em páginas paralelas; zero se não há operação ao vivo.
 */
export const picoDeEntradasDoRobo = cache(async (slug: string): Promise<PicoDoRobo> => {
  try {
    const sb = supabasePublico();
    const passo = 1000; // teto do PostgREST por requisição
    const { count, error: erroContagem } = await sb
      .from("operacoes_publico")
      .select("id", { count: "exact", head: true })
      .eq("slug", slug)
      .neq("origem", "manual");
    if (erroContagem) throw erroContagem;
    const total = count ?? 0;
    if (total === 0) return { maximo: 0, quando: null };

    const inicios = Array.from({ length: Math.ceil(total / passo) }, (_, i) => i * passo);
    const paginas = await Promise.all(
      inicios.map(async (desde) => {
        const { data, error } = await sb
          .from("operacoes_publico")
          .select("abertura_em, fechamento_em")
          .eq("slug", slug)
          .neq("origem", "manual")
          .order("fechamento_em", { ascending: true })
          .order("id", { ascending: true })
          .range(desde, Math.min(desde + passo, total) - 1);
        if (error) throw error;
        return (data ?? []) as Array<{ abertura_em: string; fechamento_em: string }>;
      }),
    );
    const pico = picoDeEntradasAbertas(paginas.flat().map((o) => [Date.parse(o.abertura_em), Date.parse(o.fechamento_em)] as const));
    return { maximo: pico.maximo, quando: pico.quando === null ? null : new Date(pico.quando).toISOString() };
  } catch (e) {
    avisar("picoDeEntradasDoRobo", e);
    return { maximo: 0, quando: null };
  }
});
