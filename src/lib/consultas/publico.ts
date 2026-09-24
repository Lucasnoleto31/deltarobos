import { PARAMETROS_FAIXAS_PADRAO, type ParametrosFaixas } from "@/lib/stats/faixas";
import { baldeDaLinha, fundirBaldes } from "@/lib/stats/saldo-dia";
import { supabasePublico } from "@/lib/supabase/servidor";
import type {
  BaldeCompacto,
  EstatisticaPublica,
  ExposicaoDiaPublica,
  Links,
  MercadoPublico,
  OperacaoPublica,
  Parametros,
  PosicaoPublica,
  ResumoCasa,
  RoboPublico,
  SaldoDiaPublico,
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

/**
 * O robô pelo slug, ou null quando não existe. Com `lancarErro` a falha do banco sobe em vez de virar null (a rota
 * de saldo, em cache, precisa distinguir "não achou" de "o banco caiu"; revisão de 23/09/2026).
 */
export async function buscarRobo(slug: string, { lancarErro = false }: { lancarErro?: boolean } = {}): Promise<RoboPublico | null> {
  try {
    const { data, error } = await supabasePublico()
      .from("robos_publico")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    return (data as RoboPublico | null) ?? null;
  } catch (e) {
    if (lancarErro) throw e;
    avisar("buscarRobo", e);
    return null;
  }
}

export interface OpcoesEstatisticas {
  /** só dias a partir daqui (YYYY-MM-DD); a rota da curva pede só o período */
  de?: string | null;
  /** deixa o erro do banco subir em vez de devolver lista vazia (a rota da curva, em cache, precisa distinguir) */
  lancarErro?: boolean;
}

/**
 * Série diária completa (todos os robôs, ou um). O PostgREST devolve no máximo
 * 1.000 linhas por requisição, então pagina até acabar (robô com anos de
 * histórico passa fácil de 1.000 dias).
 */
export async function listarEstatisticas(slug?: string, { de = null, lancarErro = false }: OpcoesEstatisticas = {}): Promise<EstatisticaPublica[]> {
  try {
    const sb = supabasePublico();
    const passo = 1000;
    const linhas: EstatisticaPublica[] = [];
    for (let desde = 0; desde < 100_000; desde += passo) {
      let q = sb
        .from("estatisticas_publico")
        .select("*")
        .order("dia", { ascending: true })
        .order("robo_id", { ascending: true })
        .range(desde, desde + passo - 1);
      if (slug) q = q.eq("slug", slug);
      if (de) q = q.gte("dia", de);
      const { data, error } = await q;
      if (error) throw error;
      const lote = (data ?? []) as EstatisticaPublica[];
      linhas.push(...lote);
      if (lote.length < passo) break;
    }
    return linhas;
  } catch (e) {
    if (lancarErro) throw e;
    avisar("listarEstatisticas", e);
    return [];
  }
}

export interface OpcoesExposicao {
  /** só o dia pedido (YYYY-MM-DD): o layout do robô quer o de hoje para o painel "Hoje ao vivo" */
  dia?: string | null;
  /** deixa o erro do banco subir (a imagem do dia, em cache, precisa distinguir; 24/09/2026) */
  lancarErro?: boolean;
}

/** As colunas de exposicao_dia_publico que o site lê: sem robo_id nem n_magics, que nenhum painel mostra. */
export type ExposicaoDia = Pick<
  ExposicaoDiaPublica,
  "slug" | "dia" | "mep_ea" | "men_ea" | "mep_ea_em" | "men_ea_em" | "mep_ea_n_saidas" | "men_ea_n_saidas" | "excursao_ea_parcial"
>;

/**
 * MEP/MEN do dia medidos pelo EA 1.1.0 (22/09/2026): as linhas de exposicao_dia_publico do robô, uma por
 * dia com medição, em ordem de dia. Só as colunas que o site lê: a página do calendário manda a lista
 * inteira ao navegador. Pagina de 1.000 em 1.000 como listarEstatisticas; view ausente (migration 0021
 * ainda não aplicada) ou qualquer erro vira lista vazia, e aí o site fica no cálculo por fechamento.
 */
export async function listarExposicaoDia(slug: string, { dia = null, lancarErro = false }: OpcoesExposicao = {}): Promise<ExposicaoDia[]> {
  try {
    const sb = supabasePublico();
    const passo = 1000;
    const colunas = "slug, dia, mep_ea, men_ea, mep_ea_em, men_ea_em, mep_ea_n_saidas, men_ea_n_saidas, excursao_ea_parcial";
    const linhas: ExposicaoDia[] = [];
    for (let desde = 0; desde < 100_000; desde += passo) {
      let q = sb.from("exposicao_dia_publico").select(colunas).eq("slug", slug).order("dia", { ascending: true }).range(desde, desde + passo - 1);
      if (dia) q = q.eq("dia", dia);
      const { data, error } = await q;
      if (error) throw error;
      const lote = (data ?? []) as unknown as ExposicaoDia[];
      linhas.push(...lote);
      if (lote.length < passo) break;
    }
    return linhas;
  } catch (e) {
    if (lancarErro) throw e;
    avisar("listarExposicaoDia", e);
    return [];
  }
}

/**
 * As operações públicas de um dia do robô, em ordem de fechamento. Com `lancarErro` o erro do banco sobe
 * (a rota de saldo, em cache, precisa distinguir falha de dia sem operação; 23/09/2026). Limite conhecido:
 * sem paginação, então um dia com mais de 1.000 operações (o teto do PostgREST por requisição) viria cortado.
 */
export async function listarOperacoesDoDia(slug: string, dia: string, { lancarErro = false }: { lancarErro?: boolean } = {}): Promise<OperacaoPublica[]> {
  try {
    const { data, error } = await supabasePublico()
      .from("operacoes_publico")
      .select("*")
      .eq("slug", slug)
      .eq("dia_pregao", dia)
      .order("fechamento_em", { ascending: true })
      // desempate pelo id, a ordem do calendário (listarOperacoesCompactas): com operações no mesmo instante
      // (importação manual, tudo às 00:00) a ordem ficava indefinida, e a curva e o MEP/MEN por fechamento da
      // imagem do dia podiam mudar de um render para outro (24/09/2026)
      .order("id", { ascending: true });
    if (error) throw error;
    return (data ?? []) as OperacaoPublica[];
  } catch (e) {
    if (lancarErro) throw e;
    avisar("listarOperacoesDoDia", e);
    return [];
  }
}

export interface OpcoesSaldoDoDia {
  /** deixa o erro do banco subir (a rota, em cache, precisa distinguir falha de série vazia) */
  lancarErro?: boolean;
}

export interface SaldoDoDiaConsultado {
  baldes: BaldeCompacto[];
  aproximado: boolean;
}

/** A view saldo_dia_publico ainda não existe nesta instância (migration 0024 pendente). Por instância, como semExcursaoNaView. */
let semViewDeSaldo = false;

/** "relation does not exist": 42P01 do Postgres; o PostgREST mais novo responde PGRST205 (tabela fora do schema cache) para o mesmo caso. */
function ehViewInexistente(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  return code === "42P01" || code === "PGRST205" || (typeof message === "string" && /saldo_dia_publico/.test(message) && /does not exist|schema cache/i.test(message));
}

type LinhaDeSaldo = Pick<SaldoDiaPublico, "em" | "min_brl_por_contrato" | "max_brl_por_contrato" | "ultimo_brl_por_contrato" | "n_magics">;

/**
 * A série do saldo do dia de um robô em saldo_dia_publico (23/09/2026): baldes compactos em ordem de `em`, e o
 * aviso de aproximação (n_magics > 1 em algum balde). Pagina como listarOperacoesCompactas: uma contagem
 * (head: true) e as páginas de 1.000 em paralelo, cada uma com .order("em") e .range(). Erro: lista vazia +
 * avisar("listarSaldoDoDia", e), ou lança com lancarErro. EXCEÇÃO: view inexistente (código "42P01",
 * migration 0024 ainda não aplicada) é "sem série" mesmo com lancarErro — avisa uma vez por instância
 * (flag de módulo, como semExcursaoNaView em consultas/operacoes.ts) e devolve { baldes: [], aproximado: false }.
 */
export async function listarSaldoDoDia(slug: string, dia: string, { lancarErro = false }: OpcoesSaldoDoDia = {}): Promise<SaldoDoDiaConsultado> {
  const vazio: SaldoDoDiaConsultado = { baldes: [], aproximado: false };
  if (semViewDeSaldo) return vazio;
  try {
    const sb = supabasePublico();
    const passo = 1000; // teto do PostgREST por requisição: um dia inteiro a 5 s são ~6.500 baldes
    const colunas = "em, min_brl_por_contrato, max_brl_por_contrato, ultimo_brl_por_contrato, n_magics";

    const { count, error: erroContagem } = await sb.from("saldo_dia_publico").select("em", { count: "exact", head: true }).eq("slug", slug).eq("dia", dia);
    if (erroContagem) throw erroContagem;
    const total = count ?? 0;
    if (total === 0) return vazio;

    const pagina = async (desde: number): Promise<LinhaDeSaldo[]> => {
      const { data, error } = await sb
        .from("saldo_dia_publico")
        .select(colunas)
        .eq("slug", slug)
        .eq("dia", dia)
        .order("em", { ascending: true })
        .range(desde, desde + passo - 1);
      if (error) throw error;
      return (data ?? []) as unknown as LinhaDeSaldo[];
    };
    // as páginas em paralelo; a última vai até o fim da página e não até `total`, porque hoje a série cresce
    // entre a contagem e a leitura (baldes novos têm `em` maior e caem no fim: fundirBaldes tira o que repetir)
    const inicios = Array.from({ length: Math.ceil(total / passo) }, (_, i) => i * passo);
    const paginas = await Promise.all(inicios.map(pagina));
    // A contagem e as páginas não são uma foto consistente (revisão de 23/09/2026): hoje, um reenvio de baldes
    // ANTIGOS entre as duas (a fila do EA depois de heartbeats falhos, com `em` menor que os já lidos) desloca os
    // offsets, e o que passasse das páginas planejadas ficaria de fora até a próxima carga. Enquanto a última
    // página vier cheia, pede mais uma, em sequência, até vir incompleta. Dia passado não muda e só paga a
    // página a mais quando o total é múltiplo exato de 1.000.
    let desde = inicios.length * passo;
    while (paginas[paginas.length - 1].length === passo && desde < 100_000) {
      paginas.push(await pagina(desde));
      desde += passo;
    }
    const linhas = paginas.flat();
    const lista: BaldeCompacto[] = [];
    for (const l of linhas) {
      const balde = baldeDaLinha(l);
      if (balde) lista.push(balde);
    }
    return { baldes: fundirBaldes([], lista), aproximado: linhas.some((l) => l.n_magics > 1) };
  } catch (e) {
    if (ehViewInexistente(e)) {
      if (!semViewDeSaldo) {
        semViewDeSaldo = true;
        avisar("listarSaldoDoDia", "saldo_dia_publico inexistente (migration 0024 pendente): seguindo sem a série do saldo");
      }
      return vazio;
    }
    if (lancarErro) throw e;
    avisar("listarSaldoDoDia", e);
    return vazio;
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
    // "*" já traz n_abertas (operações em aberto por grupo, migration 0020), como listarRobos traz
    // n_posicoes_abertas e resumoCasaHoje o total: nada de volume nem conta, a view não tem
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

/**
 * Os ativos com cotação e horário de pregão. Com `lancarErro` a falha do banco sobe (a imagem do dia, em cache,
 * responde 503 em vez de guardar uma imagem com o pregão padrão; 24/09/2026).
 */
export async function listarMercado({ lancarErro = false }: { lancarErro?: boolean } = {}): Promise<MercadoPublico[]> {
  try {
    const { data, error } = await supabasePublico()
      .from("mercado_publico")
      .select("*")
      .order("prefixo_simbolo", { ascending: true });
    if (error) throw error;
    return (data ?? []) as MercadoPublico[];
  } catch (e) {
    if (lancarErro) throw e;
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
  const base: Parametros = {
    links: { ...LINKS_PADRAO },
    textos: { ...TEXTOS_PADRAO },
    fatorSeguranca: 1.5,
    faixas: {
      amostraMinima: PARAMETROS_FAIXAS_PADRAO.amostraMinima,
      ligar: { ...PARAMETROS_FAIXAS_PADRAO.ligar },
      cautela: { ...PARAMETROS_FAIXAS_PADRAO.cautela },
      evitar: { ...PARAMETROS_FAIXAS_PADRAO.evitar },
    },
  };
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
      } else if (p.chave === "faixas" && valor && typeof valor === "object") {
        const v = valor as Partial<ParametrosFaixas>;
        if (typeof v.amostraMinima === "number") base.faixas.amostraMinima = v.amostraMinima;
        if (v.ligar) base.faixas.ligar = { ...base.faixas.ligar, ...v.ligar };
        if (v.cautela) base.faixas.cautela = { ...base.faixas.cautela, ...v.cautela };
        if (v.evitar) base.faixas.evitar = { ...base.faixas.evitar, ...v.evitar };
      }
    }
  } catch (e) {
    avisar("carregarParametros", e);
  }
  return base;
}
