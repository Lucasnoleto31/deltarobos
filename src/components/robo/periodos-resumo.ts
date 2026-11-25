// Os períodos da aba Resumo do robô (18/09/2026, Artur: "faltam filtros, hoje, semana, mes, tudo"). Os
// quatro recortam a série diária e as operações. Sem "use client": a página monta a curva por operação de
// cada período no servidor. Desde 25/11/2026 "Hoje" é a aba Ao vivo, e saíram daqui a lista com "Hoje" e a
// escolha do período em que o painel abria (DESIGN.md, seção 9).

import { anoDe, diaDaSemana, mesDe, somarDias } from "@/lib/stats/periodos";

export type PeriodoFechado = "semana" | "mes" | "ano" | "tudo";

export const PERIODOS_FECHADOS: readonly PeriodoFechado[] = ["semana", "mes", "ano", "tudo"];

/**
 * Os períodos que a aba Resumo do robô oferece (25/11/2026, DESIGN.md seção 9), na ordem do seletor: a tela
 * abre sempre em "desde o início", que é a pergunta dela. "Hoje" saiu daqui: é a aba Ao vivo.
 */
export const PERIODOS_DO_RESUMO: ReadonlyArray<{ valor: PeriodoFechado; rotulo: string }> = [
  { valor: "tudo", rotulo: "Desde o início" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "semana", rotulo: "Semana" },
];

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

/** O período como chega na URL de /api/robos/[slug]/curva/[periodo]: só os quatro fechados valem. */
export function ehPeriodoFechado(v: unknown): v is PeriodoFechado {
  return typeof v === "string" && (PERIODOS_FECHADOS as readonly string[]).includes(v);
}
