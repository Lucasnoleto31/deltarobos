export type Periodo = "7d" | "30d" | "3m" | "12m" | "ano" | "tudo" | "personalizado";

export const PERIODOS: ReadonlyArray<{ valor: Periodo; rotulo: string }> = [
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "3m", rotulo: "3 meses" },
  { valor: "12m", rotulo: "12 meses" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "tudo", rotulo: "Tudo" },
  { valor: "personalizado", rotulo: "Personalizado" },
];

export function ehPeriodo(v: unknown): v is Periodo {
  return typeof v === "string" && PERIODOS.some((p) => p.valor === v);
}

/** Intervalo fechado de datas YYYY-MM-DD; null = sem limite. */
export interface Intervalo {
  de: string | null;
  ate: string | null;
}

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

export function ehDia(v: unknown): v is string {
  return typeof v === "string" && RE_DIA.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
}

/** Intervalo efetivo de um período (ou do personalizado), limitado a hoje. */
export function intervaloDe(
  periodo: Periodo,
  hoje: string,
  personalizado?: { de?: string | null; ate?: string | null },
): Intervalo {
  if (periodo === "personalizado") {
    const de = ehDia(personalizado?.de) ? personalizado!.de! : null;
    const ateBruto = ehDia(personalizado?.ate) ? personalizado!.ate! : hoje;
    return { de, ate: ateBruto < hoje ? ateBruto : hoje };
  }
  return { de: inicioPeriodo(periodo, hoje), ate: hoje };
}

export function filtrarIntervalo<T extends { dia: string }>(linhas: readonly T[], i: Intervalo): T[] {
  return linhas.filter((l) => (i.de === null || l.dia >= i.de) && (i.ate === null || l.dia <= i.ate));
}

export function dentroDoIntervalo(dia: string, i: Intervalo): boolean {
  return (i.de === null || dia >= i.de) && (i.ate === null || dia <= i.ate);
}

export const FUSO = "America/Sao_Paulo";

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const fmtPartes = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const DIAS_SEMANA: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Data de hoje em Brasília, no formato YYYY-MM-DD. */
export function hojeSP(agora: Date = new Date()): string {
  return fmtDia.format(agora);
}

export interface AgoraSP {
  dia: string;
  hora: number;
  minuto: number;
  /** "HH:MM" */
  hhmm: string;
  /** 0 = domingo ... 6 = sábado */
  diaSemana: number;
}

/** Hora e data atuais em Brasília. */
export function agoraSP(agora: Date = new Date()): AgoraSP {
  const partes = fmtPartes.formatToParts(agora);
  const pegar = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const hora = Number(pegar("hour"));
  const minuto = Number(pegar("minute"));
  return {
    dia: hojeSP(agora),
    hora,
    minuto,
    hhmm: `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`,
    diaSemana: DIAS_SEMANA[pegar("weekday")] ?? new Date(agora).getUTCDay(),
  };
}

/** Soma dias a uma data YYYY-MM-DD sem depender de fuso. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Soma meses a uma data YYYY-MM-DD (dia 31 + 1 mês normaliza como o JS). */
export function somarMeses(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado, pra uma data YYYY-MM-DD. */
export function diaDaSemana(dia: string): number {
  return new Date(`${dia}T00:00:00Z`).getUTCDay();
}

export function mesDe(dia: string): string {
  return dia.slice(0, 7);
}

export function anoDe(dia: string): string {
  return dia.slice(0, 4);
}

/** Primeiro dia incluído no período, ou null pra "tudo". */
export function inicioPeriodo(periodo: Periodo, hoje: string): string | null {
  switch (periodo) {
    case "7d":
      return somarDias(hoje, -6);
    case "30d":
      return somarDias(hoje, -29);
    case "3m":
      return somarMeses(hoje, -3);
    case "12m":
      return somarMeses(hoje, -12);
    case "ano":
      return `${anoDe(hoje)}-01-01`;
    case "tudo":
    case "personalizado":
      return null;
  }
}

export function filtrarPeriodo<T extends { dia: string }>(
  linhas: readonly T[],
  periodo: Periodo,
  hoje: string,
): T[] {
  const inicio = inicioPeriodo(periodo, hoje);
  return linhas.filter((l) => l.dia <= hoje && (inicio === null || l.dia >= inicio));
}

/** Diferença em dias de calendário entre duas datas YYYY-MM-DD. */
export function diffDias(de: string, ate: string): number {
  const a = new Date(`${de}T00:00:00Z`).getTime();
  const b = new Date(`${ate}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
