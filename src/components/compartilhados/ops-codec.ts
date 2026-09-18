import type { OperacaoCompacta } from "@/lib/stats/operacoes";
import type { LinhaDiaria } from "@/lib/stats/tipos";

/**
 * As operações compactas empacotadas para atravessar do servidor ao navegador (18/09/2026).
 * Desempenho e Calendário precisam de todas no cliente, e a tupla repetia a data e o símbolo
 * como texto em cada uma das ~15 mil: 699 KB por aba. Aqui cada campo vira uma coluna; dia e
 * símbolo viram índice nas tabelas `dias` e `simbolos`; as colunas que mudam pouco de uma
 * operação para a outra (dia, hora, dia da semana, custos, lado, símbolo) vão em repetições
 * [valor, quantas vezes, ...]. Medido na Apollo: 158 KB / 28 KB gz, contra 699 KB / 41 KB gz.
 * Nenhum campo é derivado de outro (custos, R$ e dia da semana vão explícitos) para não
 * depender de premissa sobre o dado: desempacotar devolve exatamente o array de entrada.
 */
export interface OpsEmpacotadas {
  n: number;
  dias: string[];
  simbolos: string[];
  /** repetições de índices em `dias` */
  dia: number[];
  /** repetições */
  hora: number[];
  /** repetições */
  diaSemana: number[];
  pontos: number[];
  brl: number[];
  /** repetições */
  custos: number[];
  duracao: number[];
  /** repetições */
  lado: number[];
  /** repetições de índices em `simbolos` */
  simbolo: number[];
}

// Object.is e não ===: -0 não pode virar 0 no caminho
function emRepeticoes(valores: number[]): number[] {
  const saida: number[] = [];
  for (const v of valores) {
    const n = saida.length;
    if (n > 0 && Object.is(saida[n - 2], v)) saida[n - 1]++;
    else saida.push(v, 1);
  }
  return saida;
}

function deRepeticoes(rep: number[], n: number): number[] {
  const saida = new Array<number>(n);
  let k = 0;
  for (let i = 0; i < rep.length; i += 2) {
    for (let j = 0; j < rep[i + 1]; j++) saida[k++] = rep[i];
  }
  if (k !== n) throw new Error(`ops-codec: coluna com ${k} valores, esperado ${n}`);
  return saida;
}

function indexar(valores: string[]): { tabela: string[]; indices: number[] } {
  const posicao = new Map<string, number>();
  const tabela: string[] = [];
  const indices = valores.map((v) => {
    let i = posicao.get(v);
    if (i === undefined) {
      i = tabela.length;
      tabela.push(v);
      posicao.set(v, i);
    }
    return i;
  });
  return { tabela, indices };
}

export function empacotar(ops: OperacaoCompacta[]): OpsEmpacotadas {
  const dias = indexar(ops.map((op) => op[0]));
  const simbolos = indexar(ops.map((op) => op[8]));
  return {
    n: ops.length,
    dias: dias.tabela,
    simbolos: simbolos.tabela,
    dia: emRepeticoes(dias.indices),
    hora: emRepeticoes(ops.map((op) => op[1])),
    diaSemana: emRepeticoes(ops.map((op) => op[2])),
    pontos: ops.map((op) => op[3]),
    brl: ops.map((op) => op[4]),
    custos: emRepeticoes(ops.map((op) => op[5])),
    duracao: ops.map((op) => op[6]),
    lado: emRepeticoes(ops.map((op) => op[7])),
    simbolo: emRepeticoes(simbolos.indices),
  };
}

export function desempacotar(p: OpsEmpacotadas): OperacaoCompacta[] {
  const { n } = p;
  const dia = deRepeticoes(p.dia, n);
  const hora = deRepeticoes(p.hora, n);
  const diaSemana = deRepeticoes(p.diaSemana, n);
  const custos = deRepeticoes(p.custos, n);
  const lado = deRepeticoes(p.lado, n);
  const simbolo = deRepeticoes(p.simbolo, n);
  if (p.pontos.length !== n || p.brl.length !== n || p.duracao.length !== n) {
    throw new Error(`ops-codec: colunas de tamanho diferente de ${n}`);
  }
  const ops = new Array<OperacaoCompacta>(n);
  for (let i = 0; i < n; i++) {
    ops[i] = [
      p.dias[dia[i]],
      hora[i],
      diaSemana[i],
      p.pontos[i],
      p.brl[i],
      custos[i],
      p.duracao[i],
      lado[i] as 1 | -1,
      p.simbolos[simbolo[i]],
    ];
  }
  return ops;
}

/**
 * Só os campos de LinhaDiaria: a view traz também robo_id, slug e atualizado_em, que nenhum
 * painel lê e que custavam 16 KB por aba (18/09/2026). Lista explícita, para coluna nova na
 * view não vazar para o navegador sem ninguém ver.
 */
export function soLinhaDiaria(linhas: LinhaDiaria[]): LinhaDiaria[] {
  return linhas.map((l) => ({
    dia: l.dia,
    pontos_por_contrato: l.pontos_por_contrato,
    resultado_brl_por_contrato: l.resultado_brl_por_contrato,
    custos_brl_por_contrato: l.custos_brl_por_contrato,
    n_operacoes: l.n_operacoes,
    n_gain: l.n_gain,
    n_loss: l.n_loss,
    soma_gain_brl_por_contrato: l.soma_gain_brl_por_contrato,
    soma_loss_brl_por_contrato: l.soma_loss_brl_por_contrato,
    maior_gain_brl_por_contrato: l.maior_gain_brl_por_contrato,
    maior_loss_brl_por_contrato: l.maior_loss_brl_por_contrato,
  }));
}
