import { agoraSP } from "./periodos";
import { coletaParada, dentroDoHorario } from "./pregao";
import type { RoboStatus } from "./tipos";

export type StatusAoVivo =
  | "operando"
  | "posicionado"
  | "fora_do_horario"
  | "pausado"
  | "em_breve"
  | "arquivado"
  | "desconhecido"
  | "historico";

export interface EntradaStatus {
  status: RoboStatus;
  posicionado: boolean;
  ultimoHeartbeatEm: string | null;
  horarioInicio: string | null;
  horarioFim: string | null;
  /** pregão do ativo do robô aberto agora? */
  pregaoAberto: boolean;
  agora: Date;
  /** false = só histórico importado, sem coletor no MT5 (padrão true) */
  temColetor?: boolean;
}

/**
 * Status exibido no card e no cabeçalho do robô.
 * Ordem: cadastro > sem coletor > pregão fechado > coletor parado > posicionado > horário do robô.
 */
export function statusAoVivo(e: EntradaStatus): StatusAoVivo {
  if (e.status === "em_breve" || e.status === "pausado" || e.status === "arquivado") {
    return e.status;
  }
  if (e.temColetor === false) return "historico";
  if (!e.pregaoAberto) return "fora_do_horario";
  if (coletaParada(e.ultimoHeartbeatEm, e.agora, true)) return "desconhecido";
  if (e.posicionado) return "posicionado";
  if (e.horarioInicio && e.horarioFim) {
    const a = agoraSP(e.agora);
    if (!dentroDoHorario(a.hhmm, e.horarioInicio, e.horarioFim)) return "fora_do_horario";
  }
  return "operando";
}

export const ROTULO_STATUS: Record<StatusAoVivo, string> = {
  operando: "Operando",
  posicionado: "Posicionado",
  fora_do_horario: "Fora do horário",
  pausado: "Pausado",
  em_breve: "Em breve",
  arquivado: "Arquivado",
  desconhecido: "Sem atualização",
  historico: "Histórico",
};

export type TomStatus = "positivo" | "negativo" | "neutro" | "alerta" | "info";

export const TOM_STATUS: Record<StatusAoVivo, TomStatus> = {
  operando: "positivo",
  posicionado: "info",
  fora_do_horario: "neutro",
  pausado: "alerta",
  em_breve: "neutro",
  arquivado: "neutro",
  desconhecido: "negativo",
  historico: "neutro",
};
