import { mesDe } from "@/lib/stats/periodos";
import { supabasePublico } from "@/lib/supabase/servidor";
import type { EstatisticaPublica, OperacaoPublica } from "@/lib/tipos";

export interface MesRelatorio {
  mes: string; // YYYY-MM
  nDias: number;
  nOperacoes: number;
  bruto: number;
  custos: number;
  liquido: number;
}

const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export function ehMes(v: unknown): v is string {
  return typeof v === "string" && RE_MES.test(v);
}

/** Primeiro e último dia (YYYY-MM-DD) de um mês YYYY-MM. */
export function limitesDoMes(mes: string): { de: string; ate: string } {
  const [ano, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** Meses com pregão, do mais recente pro mais antigo, com totais por contrato. */
export function mesesRelatorio(linhas: readonly EstatisticaPublica[]): MesRelatorio[] {
  const mapa = new Map<string, MesRelatorio>();
  for (const l of linhas) {
    const mes = mesDe(l.dia);
    const m = mapa.get(mes) ?? { mes, nDias: 0, nOperacoes: 0, bruto: 0, custos: 0, liquido: 0 };
    m.nDias += 1;
    m.nOperacoes += l.n_operacoes;
    m.bruto += l.resultado_brl_por_contrato;
    m.custos += l.custos_brl_por_contrato;
    m.liquido += l.resultado_brl_por_contrato - l.custos_brl_por_contrato;
    mapa.set(mes, m);
  }
  return [...mapa.values()].sort((a, b) => (a.mes < b.mes ? 1 : -1));
}

/** Todas as operações públicas de um mês, em ordem cronológica (pagina de 1.000 em 1.000). */
export async function listarOperacoesDoMes(slug: string, mes: string): Promise<OperacaoPublica[]> {
  const { de, ate } = limitesDoMes(mes);
  const sb = supabasePublico();
  const itens: OperacaoPublica[] = [];
  const passo = 1000;
  for (let inicio = 0; inicio < 50_000; inicio += passo) {
    const { data, error } = await sb
      .from("operacoes_publico")
      .select("*")
      .eq("slug", slug)
      .gte("dia_pregao", de)
      .lte("dia_pregao", ate)
      .order("fechamento_em", { ascending: true })
      .order("id", { ascending: true })
      .range(inicio, inicio + passo - 1);
    if (error) throw error;
    const lote = (data ?? []) as OperacaoPublica[];
    itens.push(...lote);
    if (lote.length < passo) break;
  }
  return itens;
}
