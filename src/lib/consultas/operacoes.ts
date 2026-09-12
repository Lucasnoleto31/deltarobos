import { compactar, type OperacaoCompacta } from "@/lib/stats/operacoes";
import { supabasePublico } from "@/lib/supabase/servidor";
import type { OperacaoPublica } from "@/lib/tipos";

export type FiltroLado = "compra" | "venda";
export type FiltroResultado = "gain" | "loss";

export interface FiltrosOperacoes {
  de?: string | null;
  ate?: string | null;
  lado?: FiltroLado | null;
  resultado?: FiltroResultado | null;
  pagina?: number;
  tamanho?: number;
}

export interface PaginaOperacoes {
  itens: OperacaoPublica[];
  total: number;
  pagina: number;
  tamanho: number;
  paginas: number;
}

export const TAMANHO_PAGINA = 50;
/** Todas as operações do robô vão compactadas pro cliente (tuplas curtas, comprimem bem). */
export const LIMITE_COMPACTAS = 50_000;

function avisar(onde: string, e: unknown) {
  console.warn(`[consultas] ${onde}: ${e instanceof Error ? e.message : String(e)}`);
}

/** Lista paginada de operações com filtros (página de operações). */
export async function listarOperacoes(slug: string, f: FiltrosOperacoes = {}): Promise<PaginaOperacoes> {
  const tamanho = Math.min(Math.max(f.tamanho ?? TAMANHO_PAGINA, 10), 200);
  const pagina = Math.max(f.pagina ?? 1, 1);
  const vazio: PaginaOperacoes = { itens: [], total: 0, pagina, tamanho, paginas: 0 };
  try {
    let q = supabasePublico()
      .from("operacoes_publico")
      .select("*", { count: "exact" })
      .eq("slug", slug);
    if (f.de) q = q.gte("dia_pregao", f.de);
    if (f.ate) q = q.lte("dia_pregao", f.ate);
    if (f.lado) q = q.eq("lado", f.lado);
    if (f.resultado === "gain") q = q.gt("resultado_liquido_por_contrato", 0);
    if (f.resultado === "loss") q = q.lt("resultado_liquido_por_contrato", 0);
    const de = (pagina - 1) * tamanho;
    const { data, error, count } = await q
      .order("fechamento_em", { ascending: false })
      .range(de, de + tamanho - 1);
    if (error) throw error;
    const total = count ?? 0;
    return {
      itens: (data ?? []) as OperacaoPublica[],
      total,
      pagina,
      tamanho,
      paginas: Math.max(1, Math.ceil(total / tamanho)),
    };
  } catch (e) {
    avisar("listarOperacoes", e);
    return vazio;
  }
}

/**
 * Operações compactas pras estatísticas por operação (distribuições,
 * sequências, por símbolo). Pega as mais recentes até o limite, em ordem
 * cronológica. Leve o bastante pra ir no payload da página.
 */
export async function listarOperacoesCompactas(
  slug: string,
  limite = LIMITE_COMPACTAS,
): Promise<OperacaoCompacta[]> {
  try {
    const sb = supabasePublico();
    const passo = 1000;
    const linhas: Array<Parameters<typeof compactar>[0]> = [];
    for (let de = 0; de < limite; de += passo) {
      const ate = Math.min(de + passo, limite) - 1;
      const { data, error } = await sb
        .from("operacoes_publico")
        .select(
          "dia_pregao, abertura_em, pontos_por_contrato, resultado_brl_por_contrato, custos_brl_por_contrato, duracao_seg, lado, simbolo",
        )
        .eq("slug", slug)
        .order("fechamento_em", { ascending: false })
        .range(de, ate);
      if (error) throw error;
      const lote = (data ?? []) as Array<Parameters<typeof compactar>[0]>;
      linhas.push(...lote);
      if (lote.length < ate - de + 1) break;
    }
    return linhas.reverse().map(compactar);
  } catch (e) {
    avisar("listarOperacoesCompactas", e);
    return [];
  }
}
