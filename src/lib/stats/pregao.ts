import { agoraSP, diaDaSemana } from "./periodos";

/** Sem heartbeat por mais que isso em horário de pregão = coletor parado. */
export const LIMITE_SEM_HEARTBEAT_SEG = 120;

export interface HorarioPregao {
  /** "09:00" ou "09:00:00" */
  inicio: string;
  fim: string;
}

/** Normaliza "09:00:00" -> "09:00". */
export function normalizarHora(h: string): string {
  return h.slice(0, 5);
}

/** Dia útil de pregão: não é fim de semana nem feriado da B3. */
export function ehDiaPregao(dia: string, feriados: Iterable<string>): boolean {
  const ds = diaDaSemana(dia);
  if (ds === 0 || ds === 6) return false;
  for (const f of feriados) {
    if (f === dia) return false;
  }
  return true;
}

/** hhmm está em [inicio, fim)? */
export function dentroDoHorario(hhmm: string, inicio: string, fim: string): boolean {
  const h = normalizarHora(hhmm);
  return h >= normalizarHora(inicio) && h < normalizarHora(fim);
}

export function pregaoAberto(
  agora: Date,
  horario: HorarioPregao,
  feriados: Iterable<string>,
): boolean {
  const a = agoraSP(agora);
  return ehDiaPregao(a.dia, feriados) && dentroDoHorario(a.hhmm, horario.inicio, horario.fim);
}

export function segundosDesde(
  ts: string | Date | null | undefined,
  agora: Date = new Date(),
): number | null {
  if (!ts) return null;
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts.getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((agora.getTime() - t) / 1000));
}

/**
 * Coletor parado: em horário de pregão, sem heartbeat há mais de 2 min
 * (ou nunca). Fora do pregão nunca é "parado".
 */
export function coletaParada(
  ultimoHeartbeatEm: string | Date | null | undefined,
  agora: Date,
  pregaoAbertoAgora: boolean,
): boolean {
  if (!pregaoAbertoAgora) return false;
  const s = segundosDesde(ultimoHeartbeatEm, agora);
  return s === null || s > LIMITE_SEM_HEARTBEAT_SEG;
}
