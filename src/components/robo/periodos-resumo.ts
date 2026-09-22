// Os períodos do painel de resultado da visão geral (18/09/2026, Artur: "faltam filtros, hoje,
// semana, mes, tudo"). "Hoje" é o painel ao vivo; os outros quatro recortam a série diária e as
// operações. Sem "use client": a página monta a curva por operação de cada período no servidor.

import { anoDe, diaDaSemana, mesDe, somarDias } from "@/lib/stats/periodos";

export type PeriodoResumo = "hoje" | "semana" | "mes" | "ano" | "tudo";
export type PeriodoFechado = Exclude<PeriodoResumo, "hoje">;

export const PERIODOS_RESUMO: ReadonlyArray<{ valor: PeriodoResumo; rotulo: string }> = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "tudo", rotulo: "Tudo" },
];

export const PERIODOS_FECHADOS: readonly PeriodoFechado[] = ["semana", "mes", "ano", "tudo"];

export const TITULO_DO_PERIODO: Record<PeriodoFechado, string> = {
  semana: "Resultado da semana",
  mes: "Resultado do mês",
  ano: "Resultado do ano",
  tudo: "Resultado desde o início",
};

export const VAZIO_DO_PERIODO: Record<PeriodoFechado, string> = {
  semana: "Sem operações fechadas nesta semana.",
  mes: "Sem operações fechadas neste mês.",
  ano: "Sem operações fechadas neste ano.",
  tudo: "Sem operações fechadas ainda.",
};

/** Primeiro dia do período, ou null para "tudo". A semana é a de pregão: de segunda até hoje. */
export function inicioDoPeriodo(periodo: PeriodoFechado, hoje: string): string | null {
  switch (periodo) {
    case "semana":
      // diaDaSemana: 0 = domingo … 6 = sábado; volta até a segunda-feira
      return somarDias(hoje, -((diaDaSemana(hoje) + 6) % 7));
    case "mes":
      return `${mesDe(hoje)}-01`;
    case "ano":
      return `${anoDe(hoje)}-01-01`;
    case "tudo":
      return null;
  }
}

/** As linhas (ou o que tiver `dia`) de um período, até hoje. */
export function noPeriodo<T extends { dia: string }>(itens: readonly T[], periodo: PeriodoFechado, hoje: string): T[] {
  const inicio = inicioDoPeriodo(periodo, hoje);
  return itens.filter((i) => i.dia <= hoje && (inicio === null || i.dia >= inicio));
}

/**
 * O período em que o painel abre (19/09/2026). "Hoje" quando o dia tem operação ou o pregão está
 * aberto. Fora disso "Hoje" é um painel zerado (sábado, feriado, antes da abertura), e ele abre no
 * primeiro período com operação: semana, mês, ano, tudo. Sem operação nenhuma, fica em "Hoje".
 */
export function periodoInicial(
  linhas: readonly { dia: string; n_operacoes: number }[],
  hoje: string,
  agora: { operacoesHoje: number; pregaoAberto: boolean },
): PeriodoResumo {
  if (agora.operacoesHoje > 0 || agora.pregaoAberto) return "hoje";
  return PERIODOS_FECHADOS.find((p) => noPeriodo(linhas, p, hoje).some((l) => l.n_operacoes > 0)) ?? "hoje";
}

/** O período como chega na URL de /api/robos/[slug]/curva/[periodo]: só os quatro fechados valem. */
export function ehPeriodoFechado(v: unknown): v is PeriodoFechado {
  return typeof v === "string" && (PERIODOS_FECHADOS as readonly string[]).includes(v);
}
