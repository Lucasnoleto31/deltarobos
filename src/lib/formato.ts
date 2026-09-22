import { FUSO } from "@/lib/stats/periodos";
import { segundosDesde } from "@/lib/stats/pregao";

const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtBRLSinal = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const fmtBRLInteiro = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const fmtBRLInteiroSinal = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});

const cacheNumero = new Map<string, Intl.NumberFormat>();
function fmtNumero(decimais: number, sinal: boolean, minimo = decimais): Intl.NumberFormat {
  const chave = `${decimais}:${minimo}:${sinal}`;
  let f = cacheNumero.get(chave);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: minimo,
      maximumFractionDigits: decimais,
      signDisplay: sinal ? "exceptZero" : "auto",
    });
    cacheNumero.set(chave, f);
  }
  return f;
}

export function formatarBRL(
  valor: number,
  opts: { sinal?: boolean; inteiro?: boolean } = {},
): string {
  const v = Number.isFinite(valor) ? valor : 0;
  if (opts.inteiro) return (opts.sinal ? fmtBRLInteiroSinal : fmtBRLInteiro).format(v);
  return (opts.sinal ? fmtBRLSinal : fmtBRL).format(v);
}

export function formatarNumero(valor: number, decimais = 0, sinal = false): string {
  return fmtNumero(decimais, sinal).format(Number.isFinite(valor) ? valor : 0);
}

/** Pontos: inteiro no WIN, até 1 casa no WDO. */
export function formatarPontos(valor: number, sinal = false): string {
  return fmtNumero(1, sinal, 0).format(Number.isFinite(valor) ? valor : 0);
}

/**
 * MFE e MAE de uma operação numa célula só (22/09/2026): "+320 / −85 pts". Os dois sempre com sinal, o MFE
 * primeiro; sem medição quem chama mostra "–".
 */
export function formatarMfeMae(mfe: number, mae: number): string {
  return `${formatarPontos(mfe, true)} / ${formatarPontos(mae, true)} pts`;
}

/** Preço de negociação: 135.000 (WIN) ou 5.400,5 (WDO). Nulo (importação) vira "–". */
export function formatarPreco(preco: number | null | undefined): string {
  if (preco === null || preco === undefined || !Number.isFinite(preco)) return "–";
  return fmtNumero(3, false, 0).format(preco);
}

/** Fração 0..1 -> "62,5%" */
export function formatarPct(fracao: number | null | undefined, decimais = 1): string {
  if (fracao === null || fracao === undefined || !Number.isFinite(fracao)) return "–";
  return `${fmtNumero(decimais, false).format(fracao * 100)}%`;
}

/** Fator de lucro, payoff: "1,85" */
export function formatarMultiplo(valor: number | null | undefined, decimais = 2): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "–";
  return fmtNumero(decimais, false).format(valor);
}

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const fmtHoraSeg = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const fmtDataCurta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
});
const fmtData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const fmtDataLonga = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const fmtMesAno = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});

/** Aceita "YYYY-MM-DD" (como data civil) ou timestamp ISO (convertido pra Brasília). */
function paraDataCivil(dia: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) return new Date(`${dia}T00:00:00Z`);
  // timestamp: pega a data civil em Brasília e recoloca em UTC pra formatar
  const civil = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dia));
  return new Date(`${civil}T00:00:00Z`);
}

export function formatarHora(ts: string | Date): string {
  return fmtHora.format(typeof ts === "string" ? new Date(ts) : ts);
}

export function formatarHoraSeg(ts: string | Date): string {
  return fmtHoraSeg.format(typeof ts === "string" ? new Date(ts) : ts);
}

export function formatarDataCurta(dia: string): string {
  return fmtDataCurta.format(paraDataCivil(dia));
}

export function formatarData(dia: string): string {
  return fmtData.format(paraDataCivil(dia));
}

export function formatarDataLonga(dia: string): string {
  return fmtDataLonga.format(paraDataCivil(dia));
}

export function formatarMesAno(dia: string): string {
  return fmtMesAno.format(paraDataCivil(dia)).replace(".", "");
}

/** "há 12 s", "há 3 min", "há 2 h", "há 3 dias" */
export function haQuanto(ts: string | Date | null | undefined, agora: Date = new Date()): string {
  const s = segundosDesde(ts, agora);
  if (s === null) return "sem dados";
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/** "45 s", "12 min", "1 h 05 min" */
export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return `${h} h ${String(resto).padStart(2, "0")} min`;
}

export function rotuloLado(lado: "compra" | "venda"): string {
  return lado === "compra" ? "Compra" : "Venda";
}
