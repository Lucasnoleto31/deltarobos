// Os atalhos de período da aba Desempenho (18/09/2026, Artur: "também deve ter filtros rápidos para
// ver o dia, semana, mês, ano e tudo"). Os de dias corridos (7, 30 dias, 3 e 12 meses) saíram: eram
// mais botões para a mesma pergunta. "Hoje", "Semana" e "Mês" viram um intervalo personalizado
// (de/até), que é o que a lib já entende; "Ano" e "Tudo" são períodos nativos dela.

import { inicioDoPeriodo } from "@/components/robo/periodos-resumo";
import { anoDe, mesDe, type Periodo } from "@/lib/stats/periodos";

export type PresetPeriodo = "hoje" | "semana" | "mes" | "ano" | "tudo" | "personalizado";

export const PRESETS: ReadonlyArray<{ valor: PresetPeriodo; rotulo: string }> = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "tudo", rotulo: "Tudo" },
  { valor: "personalizado", rotulo: "Personalizado" },
];

export interface EstadoPeriodo {
  periodo: Periodo;
  de: string;
  ate: string;
}

/** O estado de filtro que um atalho produz. */
export function estadoDoPreset(preset: PresetPeriodo, hoje: string, atual: EstadoPeriodo): EstadoPeriodo {
  switch (preset) {
    case "hoje":
      return { periodo: "personalizado", de: hoje, ate: hoje };
    case "semana":
      return { periodo: "personalizado", de: inicioDoPeriodo("semana", hoje) ?? hoje, ate: hoje };
    case "mes":
      return { periodo: "personalizado", de: `${mesDe(hoje)}-01`, ate: hoje };
    case "ano":
      return { periodo: "ano", de: "", ate: hoje };
    case "tudo":
      return { periodo: "tudo", de: "", ate: hoje };
    case "personalizado":
      // mantém as datas que já estavam; sem nenhuma, abre no mês
      return { periodo: "personalizado", de: atual.de || `${mesDe(hoje)}-01`, ate: atual.ate || hoje };
  }
}

/** Qual atalho corresponde ao estado atual (para a pílula certa ficar acesa). */
export function presetAtivo(estado: EstadoPeriodo, hoje: string): PresetPeriodo {
  if (estado.periodo === "ano") return "ano";
  if (estado.periodo === "tudo") return "tudo";
  if (estado.periodo !== "personalizado") return "personalizado";
  const ate = estado.ate || hoje;
  if (ate !== hoje) return "personalizado";
  if (estado.de === hoje) return "hoje";
  if (estado.de === inicioDoPeriodo("semana", hoje)) return "semana";
  if (estado.de === `${mesDe(hoje)}-01`) return "mes";
  if (estado.de === `${anoDe(hoje)}-01-01`) return "ano";
  return "personalizado";
}
