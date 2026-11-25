/**
 * Os indicadores que fazem sentido para o trader avaliar um robô (25/11/2026). Entraram depois de uma
 * revisão do sistema pelo olhar de quem vai pôr o robô na própria conta: saíram Calmar, índice de úlcera,
 * risco de ruína, retorno sobre o capital e média por mês (pareciam promessa ou não diziam nada ao leigo), e
 * entraram os que dizem o que ele precisa saber e o sistema já tinha como calcular:
 * - quantas entradas o robô chega a ter abertas ao mesmo tempo ("com 1 contrato" é por entrada);
 * - quantos acertos ele precisa só para empatar, ao lado dos acertos que tem;
 * - meses com ganho e o pior mês; o dia ruim típico; quanto está abaixo do topo hoje;
 * - se dois robôs ganham e perdem nos mesmos dias;
 * - em quantos pregões operou.
 * Tudo puro e testado; quem busca no banco é src/lib/consultas/entradas.ts.
 */

/** Um pregão já reduzido a data e resultado (R$, 1 contrato por entrada, já com custos). */
export interface DiaValor {
  dia: string;
  valor: number;
}

// ---------------------------------------------------------------------------------------------------------
// Entradas abertas ao mesmo tempo
// ---------------------------------------------------------------------------------------------------------

export interface PicoDeEntradas {
  /** o máximo de entradas abertas no mesmo instante (0 sem operação) */
  maximo: number;
  /** quando o máximo foi atingido pela primeira vez (ms desde 1970), ou nulo */
  quando: number | null;
}

/**
 * O pico de entradas abertas ao mesmo tempo, a partir do intervalo [abertura, fechamento] de cada operação
 * (em ms). O robô que acumula entradas contra o movimento chega a carregar dezenas de contratos; "com 1
 * contrato" quer dizer por entrada. Fechamento e abertura no mesmo instante não contam como simultâneos.
 */
export function picoDeEntradasAbertas(intervalos: ReadonlyArray<readonly [number, number]>): PicoDeEntradas {
  const eventos: Array<[number, 1 | -1]> = [];
  for (const [abre, fecha] of intervalos) {
    if (!Number.isFinite(abre) || !Number.isFinite(fecha) || fecha < abre) continue;
    eventos.push([abre, 1], [fecha, -1]);
  }
  // no mesmo instante, o fechamento vem antes da abertura
  eventos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let abertas = 0;
  let maximo = 0;
  let quando: number | null = null;
  for (const [t, d] of eventos) {
    abertas += d;
    if (abertas > maximo) {
      maximo = abertas;
      quando = t;
    }
  }
  return { maximo, quando };
}

// ---------------------------------------------------------------------------------------------------------
// Acertos contra o necessário para empatar
// ---------------------------------------------------------------------------------------------------------

/**
 * De cada 100 operações, quantas precisam terminar com ganho só para o robô empatar, dado o tamanho do
 * ganho médio e da perda média (os dois positivos, na mesma unidade). É perda ÷ (ganho + perda): com ganho
 * de R$ 24 e perda de R$ 105, são 81%. Acertos altos não dizem nada sem este número ao lado.
 * Nulo quando falta ganho ou perda para comparar.
 */
export function acertoParaEmpatar(ganhoMedio: number, perdaMedia: number): number | null {
  const g = Math.abs(ganhoMedio);
  const p = Math.abs(perdaMedia);
  if (!(g > 0) || !(p > 0)) return null;
  return p / (g + p);
}

// ---------------------------------------------------------------------------------------------------------
// Mês a mês
// ---------------------------------------------------------------------------------------------------------

export interface MesDoRobo {
  /** "YYYY-MM" */
  mes: string;
  valor: number;
  /** pregões com operação no mês */
  nDias: number;
}

/** O resultado de cada mês com pregão, do mais antigo ao mais novo. */
export function resultadoPorMes(dias: ReadonlyArray<DiaValor>): MesDoRobo[] {
  const porMes = new Map<string, MesDoRobo>();
  for (const d of dias) {
    const chave = d.dia.slice(0, 7);
    const m = porMes.get(chave) ?? { mes: chave, valor: 0, nDias: 0 };
    m.valor += d.valor;
    m.nDias += 1;
    porMes.set(chave, m);
  }
  return [...porMes.values()].sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
}

export interface ResumoDosMeses {
  meses: number;
  comGanho: number;
  pior: MesDoRobo | null;
  melhor: MesDoRobo | null;
}

/** Quantos meses terminaram com ganho, e o pior e o melhor mês. */
export function resumirMeses(meses: ReadonlyArray<MesDoRobo>): ResumoDosMeses {
  let pior: MesDoRobo | null = null;
  let melhor: MesDoRobo | null = null;
  let comGanho = 0;
  for (const m of meses) {
    if (m.valor > 0) comGanho += 1;
    if (pior === null || m.valor < pior.valor) pior = m;
    if (melhor === null || m.valor > melhor.valor) melhor = m;
  }
  return { meses: meses.length, comGanho, pior, melhor };
}

// ---------------------------------------------------------------------------------------------------------
// Um dia ruim típico
// ---------------------------------------------------------------------------------------------------------

/** Menos pregões que isto não sustentam um percentil. */
export const MINIMO_PARA_DIA_RUIM = 40;

/**
 * Um dia ruim típico: a perda que só 1 em cada 20 pregões superou (o 5º percentil dos resultados diários).
 * O pior dia é um caso só; este diz o tamanho de um dia ruim "normal". Devolve um valor negativo, ou nulo
 * quando há poucos pregões ou quando nem 1 em 20 foi de perda.
 */
export function diaRuimTipico(valores: readonly number[], fracao = 0.05): number | null {
  if (valores.length < MINIMO_PARA_DIA_RUIM) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const i = Math.max(0, Math.ceil(ordenados.length * fracao) - 1);
  const v = ordenados[i];
  return v < 0 ? v : null;
}

// ---------------------------------------------------------------------------------------------------------
// Abaixo do topo hoje
// ---------------------------------------------------------------------------------------------------------

export interface QuedaAtual {
  /** quanto o acumulado está abaixo do ponto mais alto que já alcançou (positivo; 0 = está no topo) */
  valor: number;
  /** o dia do topo de onde vem caindo, ou nulo se está no topo (ou o topo é a partida) */
  desde: string | null;
}

/** Como o robô está agora em relação ao ponto mais alto do período. */
export function quedaAtual(dias: ReadonlyArray<DiaValor>): QuedaAtual {
  let acumulado = 0;
  let pico = 0;
  let diaDoPico: string | null = null;
  for (const d of dias) {
    acumulado += d.valor;
    if (acumulado >= pico) {
      pico = acumulado;
      diaDoPico = d.dia;
    }
  }
  const valor = pico - acumulado;
  return valor > 0.005 ? { valor, desde: diaDoPico } : { valor: 0, desde: null };
}

// ---------------------------------------------------------------------------------------------------------
// Dois robôs andam juntos?
// ---------------------------------------------------------------------------------------------------------

export interface AndamJuntos {
  /** pregões em que os dois operaram */
  diasEmComum: number;
  /** em quantos deles os dois ganharam ou os dois perderam */
  mesmoSentido: number;
  /** correlação dos resultados diários (-1 a 1), ou nulo sem variação */
  correlacao: number | null;
}

/** Abaixo disto de pregões em comum não se afirma nada. */
export const MINIMO_DE_DIAS_EM_COMUM = 30;
/** A partir desta fração de dias no mesmo sentido, os robôs "andam juntos". */
export const LIMITE_ANDAM_JUNTOS = 0.75;

/**
 * Em quantos pregões dois robôs ganharam ou perderam juntos. Quem liga os dois achando que divide o risco
 * precisa saber quando, na prática, eles são quase a mesma operação.
 */
export function andamJuntos(a: ReadonlyArray<DiaValor>, b: ReadonlyArray<DiaValor>): AndamJuntos {
  const deB = new Map(b.map((d) => [d.dia, d.valor]));
  const xs: number[] = [];
  const ys: number[] = [];
  let mesmoSentido = 0;
  for (const d of a) {
    const v = deB.get(d.dia);
    if (v === undefined || d.valor === 0 || v === 0) continue;
    xs.push(d.valor);
    ys.push(v);
    if (d.valor > 0 === v > 0) mesmoSentido += 1;
  }
  const n = xs.length;
  if (n === 0) return { diasEmComum: 0, mesmoSentido: 0, correlacao: null };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return { diasEmComum: n, mesmoSentido, correlacao: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null };
}

/** Os dois robôs ganham e perdem nos mesmos dias? Só afirma com pregões em comum suficientes. */
export function ehParQueAndaJunto(j: AndamJuntos): boolean {
  return j.diasEmComum >= MINIMO_DE_DIAS_EM_COMUM && j.mesmoSentido / j.diasEmComum >= LIMITE_ANDAM_JUNTOS;
}

// ---------------------------------------------------------------------------------------------------------
// Pregões em que operou
// ---------------------------------------------------------------------------------------------------------

/** Dias úteis entre duas datas (inclusive), sem os feriados da bolsa. Datas "YYYY-MM-DD". */
export function contarPregoes(de: string, ate: string, feriados: readonly string[]): number {
  if (de > ate) return 0;
  const fora = new Set(feriados);
  let n = 0;
  const fim = Date.parse(`${ate}T12:00:00Z`);
  for (let t = Date.parse(`${de}T12:00:00Z`); t <= fim; t += 86_400_000) {
    const d = new Date(t);
    const semana = d.getUTCDay();
    if (semana === 0 || semana === 6) continue;
    if (fora.has(d.toISOString().slice(0, 10))) continue;
    n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------------------------------------
// Tempo de histórico em palavras
// ---------------------------------------------------------------------------------------------------------

/** "9 meses", "1 ano e 3 meses", "8 anos": o tempo entre duas datas, arredondado para o mês. */
export function tempoEmPalavras(de: string, ate: string): string {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1) + (d2 >= d1 ? 0 : -1);
  // um mês começado conta: 9 meses e 12 dias são "9 meses"; 20 dias são "menos de 1 mês"
  if (meses < 1) return "menos de 1 mês";
  const anos = Math.floor(meses / 12);
  meses -= anos * 12;
  const partes: string[] = [];
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? "ano" : "anos"}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? "mês" : "meses"}`);
  return partes.join(" e ");
}
