/**
 * As contas da página inicial e da visão geral do robô (ficha Mesa, 25/11/2026): somar os robôs dia a dia,
 * recortar o período, acumular, achar a maior queda e resumir os pregões em palavras de leigo. Tudo em
 * R$ para 1 contrato, já descontados os custos: os valores chegam prontos de `valorDia`.
 */

/** Um pregão: o resultado, quantas operações fecharam e quantas delas com ganho. */
export interface DiaResultado {
  dia: string;
  valor: number;
  n: number;
  g: number;
}

export interface DiaAcumulado {
  dia: string;
  valor: number;
  acumulado: number;
}

/**
 * A maior queda de uma curva: do ponto mais alto até o mais baixo depois dele. `iInicio` é o índice do
 * pregão do pico, ou -1 quando o pico é a partida (zero, antes do primeiro pregão). `valor` é positivo.
 */
export interface MaiorQueda {
  iInicio: number;
  iFundo: number;
  valor: number;
}

export interface ResumoDosDias {
  pregoes: number;
  comGanho: number;
  comPerda: number;
  melhor: { dia: string; valor: number } | null;
  pior: { dia: string; valor: number } | null;
  operacoes: number;
  /** fração das operações que terminou com ganho (0 a 1), ou nulo sem operação */
  acertos: number | null;
  total: number;
}

/** Soma várias séries dia a dia: a casa é todos os robôs, 1 contrato em cada. Devolve em ordem de data. */
export function somarSeries(series: ReadonlyArray<ReadonlyArray<DiaResultado>>): DiaResultado[] {
  const porDia = new Map<string, DiaResultado>();
  for (const serie of series) {
    for (const d of serie) {
      const soma = porDia.get(d.dia) ?? { dia: d.dia, valor: 0, n: 0, g: 0 };
      soma.valor += d.valor;
      soma.n += d.n;
      soma.g += d.g;
      porDia.set(d.dia, soma);
    }
  }
  return [...porDia.values()].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
}

/** Os últimos `pregoes` dias da série (já em ordem de data); nulo devolve tudo. */
export function ultimosPregoes<T>(dias: readonly T[], pregoes: number | null): T[] {
  return pregoes === null || pregoes >= dias.length ? [...dias] : dias.slice(dias.length - pregoes);
}

/** O acumulado do período, pregão a pregão, partindo de zero. */
export function acumular(dias: ReadonlyArray<{ dia: string; valor: number }>): DiaAcumulado[] {
  let acumulado = 0;
  return dias.map((d) => {
    acumulado += d.valor;
    return { dia: d.dia, valor: d.valor, acumulado };
  });
}

/** A maior queda da curva (a partida, em zero, conta como pico). Nulo quando a curva nunca recuou. */
export function maiorQueda(pontos: ReadonlyArray<{ acumulado: number }>): MaiorQueda | null {
  let pico = 0;
  let iPico = -1;
  let melhor: MaiorQueda | null = null;
  pontos.forEach((p, i) => {
    if (p.acumulado > pico) {
      pico = p.acumulado;
      iPico = i;
      return;
    }
    const recuo = pico - p.acumulado;
    if (recuo > 0 && (melhor === null || recuo > melhor.valor)) melhor = { iInicio: iPico, iFundo: i, valor: recuo };
  });
  return melhor;
}

/** Quantos pregões terminaram com ganho e com perda, o melhor e o pior dia, e os acertos por operação. */
export function resumirDias(dias: ReadonlyArray<DiaResultado>): ResumoDosDias {
  const r: ResumoDosDias = { pregoes: dias.length, comGanho: 0, comPerda: 0, melhor: null, pior: null, operacoes: 0, acertos: null, total: 0 };
  let ganhos = 0;
  for (const d of dias) {
    if (d.valor > 0) r.comGanho += 1;
    else if (d.valor < 0) r.comPerda += 1;
    if (r.melhor === null || d.valor > r.melhor.valor) r.melhor = { dia: d.dia, valor: d.valor };
    if (r.pior === null || d.valor < r.pior.valor) r.pior = { dia: d.dia, valor: d.valor };
    r.operacoes += d.n;
    ganhos += d.g;
    r.total += d.valor;
  }
  r.acertos = r.operacoes > 0 ? ganhos / r.operacoes : null;
  return r;
}

/** Reduz uma curva longa a no máximo `maximo` pontos, sempre com o primeiro e o último (para a mini curva). */
export function amostrar(valores: readonly number[], maximo: number): number[] {
  if (valores.length <= maximo || maximo < 2) return [...valores];
  const saida: number[] = [];
  for (let k = 0; k < maximo; k++) saida.push(valores[Math.round((k / (maximo - 1)) * (valores.length - 1))]);
  return saida;
}
