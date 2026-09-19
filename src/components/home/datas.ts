import { formatarDataCurta, formatarDataLonga } from "@/lib/formato";
import { FUSO } from "@/lib/stats/periodos";
import type { HorarioPregao } from "@/lib/stats/pregao";
import type { MercadoPublico } from "@/lib/tipos";

const PREGAO_PADRAO: HorarioPregao = { inicio: "09:00", fim: "18:00" };

/**
 * União dos horários de pregão de todos os ativos (sem ativo, 09:00 às 18:00). Saiu do provider, que é
 * de cliente, em 19/09/2026: a página usa a mesma conta no servidor para saber se o pregão está aberto.
 */
export function horarioGeral(mercado: readonly MercadoPublico[]): HorarioPregao {
  let inicio: string | null = null;
  let fim: string | null = null;
  for (const m of mercado) {
    if (inicio === null || m.pregao_inicio < inicio) inicio = m.pregao_inicio;
    if (fim === null || m.pregao_fim > fim) fim = m.pregao_fim;
  }
  return inicio && fim ? { inicio, fim } : PREGAO_PADRAO;
}

// O formato.ts não tem dia da semana; o último pregão precisa dele no rótulo (19/09/2026).
const fmtSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long" });

/** "sexta-feira" ou "sábado". Meio-dia em Brasília: o dia civil não escorrega com o fuso. */
function diaDaSemana(dia: string): string {
  return fmtSemana.format(new Date(`${dia}T12:00:00-03:00`));
}

/** "sexta-feira, 18 de setembro de 2026" */
export function formatarDiaLongo(dia: string): string {
  return `${diaDaSemana(dia)}, ${formatarDataLonga(dia)}`;
}

/** "Sexta, 18/09" */
export function formatarDiaCurto(dia: string): string {
  const nome = diaDaSemana(dia).split("-")[0];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${formatarDataCurta(dia)}`;
}
