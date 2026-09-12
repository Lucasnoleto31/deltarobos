import { diaDaSemana, mesDe } from "./periodos";
import { ehDiaPregao } from "./pregao";
import { valorDia } from "./serie";
import type { LinhaDiaria, OpcoesSerie } from "./tipos";

export interface DiaCalendario {
  dia: string;
  diaDoMes: number;
  /** null = sem operação nesse dia */
  valor: number | null;
  nOperacoes: number;
  pregao: boolean;
  foraDoMes: boolean;
}

export interface GradeMes {
  mes: string;
  /** semanas de 7 dias, domingo a sábado */
  semanas: DiaCalendario[][];
  total: number;
  nDias: number;
  nPositivos: number;
  nNegativos: number;
}

function diasNoMes(mes: string): number {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

function somarDiasUTC(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Calendário do mês (verde/vermelho por dia), com dias vizinhos pra fechar as semanas. */
export function gradeMes(
  linhas: readonly LinhaDiaria[],
  mes: string,
  o: OpcoesSerie,
  feriados: readonly string[],
): GradeMes {
  const porDia = new Map<string, LinhaDiaria>();
  for (const l of linhas) porDia.set(l.dia, l);

  const n = diasNoMes(mes);
  const primeiro = `${mes}-01`;
  const inicio = somarDiasUTC(primeiro, -diaDaSemana(primeiro));
  const totalCelulas = Math.ceil((diaDaSemana(primeiro) + n) / 7) * 7;

  const semanas: DiaCalendario[][] = [];
  let total = 0;
  let nDias = 0;
  let nPositivos = 0;
  let nNegativos = 0;

  for (let i = 0; i < totalCelulas; i++) {
    const dia = somarDiasUTC(inicio, i);
    const foraDoMes = mesDe(dia) !== mes;
    const linha = foraDoMes ? undefined : porDia.get(dia);
    const valor = linha ? valorDia(linha, o) : null;
    if (valor !== null) {
      total += valor;
      nDias += 1;
      if (valor > 0) nPositivos += 1;
      else if (valor < 0) nNegativos += 1;
    }
    const celula: DiaCalendario = {
      dia,
      diaDoMes: Number(dia.slice(8, 10)),
      valor,
      nOperacoes: linha?.n_operacoes ?? 0,
      pregao: ehDiaPregao(dia, feriados),
      foraDoMes,
    };
    if (i % 7 === 0) semanas.push([]);
    semanas[semanas.length - 1].push(celula);
  }

  return { mes, semanas, total, nDias, nPositivos, nNegativos };
}

export interface CelulaHeatmap {
  mes: string;
  total: number;
  nDias: number;
}

export interface LinhaHeatmap {
  ano: string;
  /** 12 posições (jan..dez); null = sem operação no mês */
  meses: (CelulaHeatmap | null)[];
  total: number;
}

/** Heatmap ano x mês com o total de cada mês. */
export function heatmapAnoMes(linhas: readonly LinhaDiaria[], o: OpcoesSerie): LinhaHeatmap[] {
  const porMes = new Map<string, CelulaHeatmap>();
  for (const l of linhas) {
    const mes = mesDe(l.dia);
    const c = porMes.get(mes) ?? { mes, total: 0, nDias: 0 };
    c.total += valorDia(l, o);
    c.nDias += 1;
    porMes.set(mes, c);
  }
  const anos = [...new Set([...porMes.keys()].map((m) => m.slice(0, 4)))].sort();
  return anos.map((ano) => {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const chave = `${ano}-${String(i + 1).padStart(2, "0")}`;
      return porMes.get(chave) ?? null;
    });
    return { ano, meses, total: meses.reduce((s, m) => s + (m?.total ?? 0), 0) };
  });
}

/** Meses (YYYY-MM) que têm ao menos um dia com operação, em ordem. */
export function mesesComDados(linhas: readonly LinhaDiaria[]): string[] {
  return [...new Set(linhas.map((l) => mesDe(l.dia)))].sort();
}
