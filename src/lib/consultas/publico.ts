import { supabasePublico } from "@/lib/supabase/servidor";
import type {
  EstatisticaPublica,
  Links,
  MercadoPublico,
  OperacaoPublica,
  Parametros,
  PosicaoPublica,
  ResumoCasa,
  RoboPublico,
  Textos,
} from "@/lib/tipos";

/**
 * Leituras das views públicas pra Server Components.
 * Qualquer erro (inclusive ambiente sem chaves no build) vira lista vazia
 * com aviso no log, pra página nunca quebrar por causa de dado.
 */

function avisar(onde: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.warn(`[consultas] ${onde}: ${msg}`);
}

export async function listarRobos(): Promise<RoboPublico[]> {
  try {
    const { data, error } = await supabasePublico()
      .from("robos_publico")
      .select("*")
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw error;
    return (data ?? []) as RoboPublico[];
  } catch (e) {
    avisar("listarRobos", e);
    return [];
  }
}

export async function buscarRobo(slug: string): Promise<RoboPublico | null> {
  try {
    const { data, error } = await supabasePublico()
      .from("robos_publico")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    return (data as RoboPublico | null) ?? null;
  } catch (e) {
    avisar("buscarRobo", e);
    return null;
  }
}

/** Série diária completa (todos os robôs, ou um). ~250 linhas/ano/robô. */
export async function listarEstatisticas(slug?: string): Promise<EstatisticaPublica[]> {
  try {
    let q = supabasePublico()
      .from("estatisticas_publico")
      .select("*")
      .order("dia", { ascending: true })
      .limit(20000);
    if (slug) q = q.eq("slug", slug);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as EstatisticaPublica[];
  } catch (e) {
    avisar("listarEstatisticas", e);
    return [];
  }
}

export async function listarOperacoesDoDia(slug: string, dia: string): Promise<OperacaoPublica[]> {
  try {
    const { data, error } = await supabasePublico()
      .from("operacoes_publico")
      .select("*")
      .eq("slug", slug)
      .eq("dia_pregao", dia)
      .order("fechamento_em", { ascending: true });
    if (error) throw error;
    return (data ?? []) as OperacaoPublica[];
  } catch (e) {
    avisar("listarOperacoesDoDia", e);
    return [];
  }
}

export async function listarUltimasOperacoes(slug: string, limite = 50): Promise<OperacaoPublica[]> {
  try {
    const { data, error } = await supabasePublico()
      .from("operacoes_publico")
      .select("*")
      .eq("slug", slug)
      .order("fechamento_em", { ascending: false })
      .limit(limite);
    if (error) throw error;
    return (data ?? []) as OperacaoPublica[];
  } catch (e) {
    avisar("listarUltimasOperacoes", e);
    return [];
  }
}

export async function listarPosicoes(slug?: string): Promise<PosicaoPublica[]> {
  try {
    let q = supabasePublico().from("posicoes_abertas_publico").select("*");
    if (slug) q = q.eq("slug", slug);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PosicaoPublica[];
  } catch (e) {
    avisar("listarPosicoes", e);
    return [];
  }
}

export async function listarMercado(): Promise<MercadoPublico[]> {
  try {
    const { data, error } = await supabasePublico()
      .from("mercado_publico")
      .select("*")
      .order("prefixo_simbolo", { ascending: true });
    if (error) throw error;
    return (data ?? []) as MercadoPublico[];
  } catch (e) {
    avisar("listarMercado", e);
    return [];
  }
}

export async function listarFeriados(): Promise<string[]> {
  try {
    const { data, error } = await supabasePublico().from("feriados_publico").select("dia");
    if (error) throw error;
    return (data ?? []).map((f) => String(f.dia));
  } catch (e) {
    avisar("listarFeriados", e);
    return [];
  }
}

export async function resumoCasaHoje(): Promise<ResumoCasa | null> {
  try {
    const { data, error } = await supabasePublico().rpc("resumo_casa_hoje");
    if (error) throw error;
    return (data as ResumoCasa | null) ?? null;
  } catch (e) {
    avisar("resumoCasaHoje", e);
    return null;
  }
}

const LINKS_PADRAO: Links = {
  whatsapp: "",
  youtube: "",
  youtube_canal_id: "",
  instagram: "",
  sala_ao_vivo: "",
  btg_abertura_conta: "",
  treinamentos: "",
  painel_mercado: "",
  programa_pontos: "",
  proxima_live: "",
};

const TEXTOS_PADRAO: Textos = {
  hero_titulo: "Robôs de day trade com resultado ao vivo.",
  hero_subtitulo:
    "Cada operação chega direto do MetaTrader 5 das contas da Delta Robôs, normalizada por contrato.",
  disclaimer:
    "Resultados passados não garantem resultados futuros. Operações em mercado futuro envolvem risco de perda superior ao capital investido.",
  contato_email: "",
};

export async function carregarParametros(): Promise<Parametros> {
  const base: Parametros = { links: { ...LINKS_PADRAO }, textos: { ...TEXTOS_PADRAO }, fatorSeguranca: 1.5 };
  try {
    const { data, error } = await supabasePublico().from("parametros_publico").select("chave, valor");
    if (error) throw error;
    for (const p of data ?? []) {
      const valor = p.valor as unknown;
      if (p.chave === "links" && valor && typeof valor === "object") {
        base.links = { ...base.links, ...(valor as Partial<Links>) };
      } else if (p.chave === "textos" && valor && typeof valor === "object") {
        base.textos = { ...base.textos, ...(valor as Partial<Textos>) };
      } else if (p.chave === "fator_seguranca" && typeof valor === "number") {
        base.fatorSeguranca = valor;
      }
    }
  } catch (e) {
    avisar("carregarParametros", e);
  }
  return base;
}
