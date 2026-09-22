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

/** A view ainda não tem as colunas de MFE/MAE (código 42703 do Postgres, undefined_column). Por instância. */
let semExcursaoNaView = false;

function ehColunaInexistente(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  return code === "42703" || (typeof message === "string" && /mfe_pontos_por_contrato|mae_pontos_por_contrato/.test(message));
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

export interface OpcoesCompactas {
  limite?: number;
  /** só operações com dia de pregão a partir daqui (YYYY-MM-DD); a rota da curva pede só o período */
  de?: string | null;
  /**
   * Deixa o erro do banco subir em vez de devolver lista vazia. A página trata falha como "sem
   * operação" para nunca quebrar; a rota da curva, que fica em cache, precisa distinguir para não
   * guardar uma série vazia como se fosse resposta boa (22/09/2026).
   */
  lancarErro?: boolean;
}

/**
 * Operações compactas pras estatísticas por operação (distribuições,
 * sequências, por símbolo). Pega as mais recentes até o limite, em ordem
 * cronológica. Leve o bastante pra ir no payload da página.
 */
export async function listarOperacoesCompactas(
  slug: string,
  { limite = LIMITE_COMPACTAS, de = null, lancarErro = false }: OpcoesCompactas = {},
): Promise<OperacaoCompacta[]> {
  try {
    const sb = supabasePublico();
    const passo = 1000; // teto do PostgREST por requisição
    const colunasBase =
      "dia_pregao, abertura_em, pontos_por_contrato, resultado_brl_por_contrato, custos_brl_por_contrato, duracao_seg, lado, simbolo";
    // MFE/MAE do EA 1.1.0 (22/09/2026, migration 0021), nulos em operação não medida
    const colunas = semExcursaoNaView ? colunasBase : `${colunasBase}, mfe_pontos_por_contrato, mae_pontos_por_contrato`;

    // Quantas páginas existem? Uma consulta só de contagem, depois todas as páginas em paralelo:
    // dezenas de milhares de operações deixam de custar uma ida ao banco por página.
    let contagem = sb.from("operacoes_publico").select("id", { count: "exact", head: true }).eq("slug", slug);
    if (de) contagem = contagem.gte("dia_pregao", de);
    const { count, error: erroContagem } = await contagem;
    if (erroContagem) throw erroContagem;
    const total = Math.min(count ?? 0, limite);
    if (total === 0) return [];

    const inicios = Array.from({ length: Math.ceil(total / passo) }, (_, i) => i * passo);
    const paginas = await Promise.all(
      inicios.map(async (desde) => {
        let q = sb.from("operacoes_publico").select(colunas).eq("slug", slug);
        if (de) q = q.gte("dia_pregao", de);
        const { data, error } = await q
          .order("fechamento_em", { ascending: false })
          .order("id", { ascending: false })
          .range(desde, Math.min(desde + passo, total) - 1);
        if (error) throw error;
        // a lista de colunas não é literal (muda com a reserva acima), então o parser tipado do
        // supabase-js não sabe o formato: o cast passa por unknown
        return (data ?? []) as unknown as Array<Parameters<typeof compactar>[0]>;
      }),
    );
    return paginas.flat().reverse().map(compactar);
  } catch (e) {
    // Deploy do site antes da migration 0021: a view ainda não tem mfe/mae e o PostgREST responde 42703
    // (coluna inexistente). Em vez de todas as abas ficarem sem operação, refaz sem as duas colunas e
    // lembra disso nesta instância; quando a view ganhar as colunas, a instância seguinte já pede com elas.
    if (!semExcursaoNaView && ehColunaInexistente(e)) {
      semExcursaoNaView = true;
      avisar("listarOperacoesCompactas", "operacoes_publico sem mfe/mae (migration 0021 pendente): seguindo sem excursão");
      return listarOperacoesCompactas(slug, { limite, de, lancarErro });
    }
    if (lancarErro) throw e;
    avisar("listarOperacoesCompactas", e);
    return [];
  }
}
