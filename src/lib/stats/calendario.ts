import { diaDaSemana, mesDe, somarDias, somarMeses } from "./periodos";
import { ehDiaPregao } from "./pregao";
import { valorDia } from "./serie";
import { acumular, maiorQueda, resumirDias, type DiaResultado } from "./serie-casa";
import type { LinhaDiaria, OpcoesSerie } from "./tipos";

export interface DiaCalendario {
  dia: string;
  diaDoMes: number;
  /** null = sem operação nesse dia */
  valor: number | null;
  nOperacoes: number;
  pregao: boolean;
  foraDoMes: boolean;
  /** pregão em que a bolsa abriu e o robô não fechou operação (ver ehPregaoSemOperacao) */
  naoOperou: boolean;
}

export interface GradeMes {
  mes: string;
  /** semanas de 7 dias, domingo a sábado */
  semanas: DiaCalendario[][];
  total: number;
  /** dias do mês com operação */
  nDias: number;
  nPositivos: number;
  nNegativos: number;
  /** pregões do mês em que a bolsa abriu e o robô não fechou operação */
  nNaoOperou: number;
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

// ---------------------------------------------------------------------------------------------------------
// O pregão em que o robô não operou
// ---------------------------------------------------------------------------------------------------------

/**
 * De quando até quando o sistema sabe dizer se o robô operou (25/11/2026). Fora daqui um dia sem operação
 * não é "não operou": antes do primeiro dia o robô não existia no site; depois do último dia conhecido o
 * site ainda não tem o que dizer.
 */
export interface JanelaConhecida {
  /** o primeiro dia com operação */
  de: string;
  /** o último dia de que se sabe: ver janelaConhecida */
  ate: string;
}

/**
 * A janela conhecida de um robô, a partir dos dias em que ele operou.
 * - Robô acompanhado ao vivo: vai até ontem. O dia de hoje ainda não acabou, então hoje sem operação não é
 *   "não operou" (se já operou hoje, hoje é o último dia e entra).
 * - Robô que só tem histórico importado, ou que não está ativo: vai até o último dia com operação. Depois
 *   dele o site não sabe se o robô ficou parado ou se o histórico ainda não foi trazido.
 */
export function janelaConhecida(diasComOperacao: readonly string[], hoje: string, acompanhado: boolean): JanelaConhecida | null {
  if (diasComOperacao.length === 0) return null;
  let de = diasComOperacao[0];
  let ultimo = diasComOperacao[0];
  for (const d of diasComOperacao) {
    if (d < de) de = d;
    if (d > ultimo) ultimo = d;
  }
  const ontem = somarDias(hoje, -1);
  return { de, ate: acompanhado && ontem > ultimo ? ontem : ultimo };
}

/**
 * Os anos que têm feriado cadastrado. Só neles o site afirma que a bolsa abriu num dia útil: num ano sem
 * nenhum feriado cadastrado, um dia útil sem operação tanto pode ser um pregão em que o robô não operou
 * quanto um feriado que ninguém cadastrou, e o calendário não escolhe por conta própria.
 */
export function anosComFeriados(feriados: Iterable<string>): Set<string> {
  const anos = new Set<string>();
  for (const f of feriados) anos.add(f.slice(0, 4));
  return anos;
}

/**
 * Um dia sem operação é um pregão em que a bolsa abriu e o robô não fechou operação? Só afirma quando dá
 * para saber: dia útil, fora da lista de feriados, num ano que tem feriados cadastrados, dentro da janela
 * conhecida do robô. O motivo de não ter operado o sistema não sabe, e por isso não diz.
 */
export function ehPregaoSemOperacao(
  dia: string,
  feriados: Iterable<string>,
  anosCobertos: ReadonlySet<string>,
  janela: JanelaConhecida | null,
): boolean {
  if (!janela || dia < janela.de || dia > janela.ate) return false;
  if (!anosCobertos.has(dia.slice(0, 4))) return false;
  return ehDiaPregao(dia, feriados);
}

/**
 * Calendário do mês (verde/vermelho por dia), com dias vizinhos pra fechar as semanas. Com a `janela`
 * conhecida do robô, marca também os pregões em que ele não operou; sem ela, nenhum dia é marcado.
 */
export function gradeMes(
  linhas: readonly LinhaDiaria[],
  mes: string,
  o: OpcoesSerie,
  feriados: readonly string[],
  janela: JanelaConhecida | null = null,
): GradeMes {
  const porDia = new Map<string, LinhaDiaria>();
  for (const l of linhas) porDia.set(l.dia, l);
  const anosCobertos = anosComFeriados(feriados);

  const n = diasNoMes(mes);
  const primeiro = `${mes}-01`;
  const inicio = somarDiasUTC(primeiro, -diaDaSemana(primeiro));
  const totalCelulas = Math.ceil((diaDaSemana(primeiro) + n) / 7) * 7;

  const semanas: DiaCalendario[][] = [];
  let total = 0;
  let nDias = 0;
  let nPositivos = 0;
  let nNegativos = 0;
  let nNaoOperou = 0;

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
    const naoOperou = !foraDoMes && valor === null && ehPregaoSemOperacao(dia, feriados, anosCobertos, janela);
    if (naoOperou) nNaoOperou += 1;
    const celula: DiaCalendario = {
      dia,
      diaDoMes: Number(dia.slice(8, 10)),
      valor,
      nOperacoes: linha?.n_operacoes ?? 0,
      pregao: ehDiaPregao(dia, feriados),
      foraDoMes,
      naoOperou,
    };
    if (i % 7 === 0) semanas.push([]);
    semanas[semanas.length - 1].push(celula);
  }

  return { mes, semanas, total, nDias, nPositivos, nNegativos, nNaoOperou };
}

// ---------------------------------------------------------------------------------------------------------
// Um período em números: o mês em vista, cada mês e cada ano da lista "Mês a mês"
// ---------------------------------------------------------------------------------------------------------

export interface ResumoDoPeriodo {
  /** o resultado somado do período */
  total: number;
  /** dias com operação */
  dias: number;
  /** quantos deles terminaram com ganho */
  comGanho: number;
  /** o pior dia, quando houve dia de perda */
  pior: { dia: string; valor: number } | null;
  /**
   * A maior queda dentro do período: do ponto mais alto ao mais baixo que veio depois, com o período
   * partindo de zero (positivo; 0 = não recuou). A mesma conta da página inicial, dia a dia.
   */
  maiorQueda: number;
}

const emOrdem = <T extends { dia: string }>(dias: readonly T[]): T[] => [...dias].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));

/**
 * Os números de um período (um mês, um ano): quanto somou, em quantos dias operou e em quantos ganhou, o
 * pior dia e a maior queda de dentro dele. Todo resultado da aba Dia a dia sai daqui com a queda ao lado.
 */
export function resumirPeriodo(dias: ReadonlyArray<DiaResultado>): ResumoDoPeriodo {
  const ordenados = emOrdem(dias);
  const r = resumirDias(ordenados);
  return {
    total: r.total,
    dias: r.pregoes,
    comGanho: r.comGanho,
    pior: r.pior && r.pior.valor < 0 ? r.pior : null,
    maiorQueda: maiorQueda(acumular(ordenados))?.valor ?? 0,
  };
}

export interface MesDoHistorico extends ResumoDoPeriodo {
  /** "YYYY-MM" */
  mes: string;
}

export interface AnoDoHistorico extends ResumoDoPeriodo {
  /** "YYYY" */
  ano: string;
  /** os meses com operação, do mais recente para o mais antigo */
  meses: MesDoHistorico[];
  /** quantos meses do ano terminaram com ganho */
  mesesComGanho: number;
}

/**
 * O histórico em anos e meses, do mais recente para o mais antigo: é a lista "Mês a mês" da aba Dia a dia.
 * Só entram meses com operação (são os que têm relatório para baixar). A maior queda de cada mês e de cada
 * ano é a de dentro dele, partindo de zero: uma queda que atravessa a virada do mês aparece repartida.
 */
export function anosDoHistorico(dias: ReadonlyArray<DiaResultado>): AnoDoHistorico[] {
  const porMes = new Map<string, DiaResultado[]>();
  for (const d of dias) {
    const mes = mesDe(d.dia);
    const lista = porMes.get(mes);
    if (lista) lista.push(d);
    else porMes.set(mes, [d]);
  }
  const porAno = new Map<string, { dias: DiaResultado[]; meses: MesDoHistorico[] }>();
  for (const [mes, doMes] of porMes) {
    const ano = mes.slice(0, 4);
    const a = porAno.get(ano) ?? { dias: [], meses: [] };
    a.dias.push(...doMes);
    a.meses.push({ mes, ...resumirPeriodo(doMes) });
    porAno.set(ano, a);
  }
  return [...porAno.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([ano, a]) => ({
      ano,
      ...resumirPeriodo(a.dias),
      meses: a.meses.sort((x, y) => (x.mes < y.mes ? 1 : x.mes > y.mes ? -1 : 0)),
      mesesComGanho: a.meses.filter((m) => m.total > 0).length,
    }));
}

/**
 * O histórico tem menos de 12 meses, do primeiro ao último dia? Indicador tirado de histórico curto diz o
 * tamanho dele na tela (DESIGN.md, seção 9).
 */
export function historicoCurto(de: string, ate: string): boolean {
  return somarMeses(de, 12) > ate;
}

// O mapa ano x mês (heatmapAnoMes) saiu em 25/11/2026 com o componente que o desenhava: o mês a mês do
// Dia a dia sai de anosDoHistorico.

/** Meses (YYYY-MM) que têm ao menos um dia com operação, em ordem. */
export function mesesComDados(linhas: readonly LinhaDiaria[]): string[] {
  return [...new Set(linhas.map((l) => mesDe(l.dia)))].sort();
}
