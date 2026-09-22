import type { Base, Unidade } from "./tipos";

/**
 * MEP/MEN do dia medidos pelo EA 1.1.0 (22/09/2026): o coletor acompanha, tick a tick, o realizado do
 * dia mais o flutuante das posições do robô, por 1 contrato, e guarda o máximo (MEP) e o mínimo (MEN)
 * em R$ BRUTOS por contrato, com a hora e quantas saídas já tinham acontecido (migration 0021, tabela
 * exposicao_dia e view exposicao_dia_publico). É o mesmo número do Profit. O cálculo por fechamento
 * (excursaoDoDia em ./operacoes) continua como reserva para os dias sem medição: antes do EA 1.1.0,
 * histórico importado, conta com o EA antigo.
 *
 * Aqui ficam as contas puras: bruto → líquido (o custo de cada saída até o extremo), R$ → pontos, e a
 * posição do marcador na curva por operação. Nada de React, nada de banco.
 */

/**
 * A medição de um dia como a página do calendário a recebe: a linha de exposicao_dia_publico (tipo
 * ExposicaoDiaPublica em src/lib/tipos.ts) sem robo_id, slug e n_magics, que nenhum painel lê.
 */
export type ExposicaoDoDia = ExposicaoHoje & {
  /** YYYY-MM-DD, dia de pregão em Brasília */
  dia: string;
};

/**
 * O que o evento "coleta" (topics casa e robo:<slug>) e a view trazem do MEP/MEN de hoje: o mínimo que o
 * painel "Hoje ao vivo" precisa. Tipo estrutural, como GrupoAberto em ./posicoes: a linha da view
 * (ExposicaoDiaPublica) e o evento (EventoColeta) satisfazem os dois sem importar nada daqui. Os horários
 * são opcionais porque o evento não os carrega.
 */
export interface ExposicaoHoje {
  /** MEP em R$ brutos por contrato (>= 0); null = o EA ainda não mediu nada no dia */
  mep_ea: number | null;
  /** MEN em R$ brutos por contrato (<= 0) */
  men_ea: number | null;
  /** quantas saídas já tinham acontecido quando o MEP/MEN foi batido (os custos até ali) */
  mep_ea_n_saidas: number | null;
  men_ea_n_saidas: number | null;
  /** true = o coletor subiu no meio do dia e pode ter perdido um extremo anterior */
  excursao_ea_parcial: boolean | null;
  mep_ea_em?: string | null;
  men_ea_em?: string | null;
}

export interface MepMenDoDia {
  /** máxima exposição positiva na base e unidade pedidas (>= 0; 0 = nunca ficou positivo) */
  mep: number;
  /** máxima exposição negativa na base e unidade pedidas (<= 0; 0 = nunca ficou negativo) */
  men: number;
  /** quando o extremo foi batido (ISO), quando a fonte informa */
  mepEm: string | null;
  menEm: string | null;
  /** saídas já feitas quando o extremo foi batido */
  mepNSaidas: number;
  menNSaidas: number;
  /** o coletor não acompanhou o dia inteiro: o número pode estar abaixo do real, em módulo */
  parcial: boolean;
}

function numero(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function contagem(v: number | null | undefined): number {
  const n = numero(v);
  return n !== null && n > 0 ? Math.floor(n) : 0;
}

/** Há medição do EA para o dia? (linha existente com MEP ou MEN numérico) */
export function temMedicaoEA(e: ExposicaoHoje | null | undefined): e is ExposicaoHoje {
  return !!e && (numero(e.mep_ea) !== null || numero(e.men_ea) !== null);
}

/**
 * MEP/MEN do dia medidos pelo EA, na base e unidade pedidas, por 1 contrato.
 * Líquido = bruto − (operações fechadas até o extremo) × custo por contrato: cada operação fechada já
 * pagou o custo dela, e a posição aberta ainda não (n_saidas conta ciclos fechados, não deals: uma saída
 * em dois deals é uma operação e um custo). Pontos = R$ ÷ valor do ponto. Depois de descontar custo, o
 * MEP fica em 0 se não passar de zero (e o MEN, se não ficar abaixo), a mesma convenção de excursaoDoDia:
 * "não ficou positivo" não vira um MEP negativo. Devolve null sem medição, e aí quem chama usa a reserva.
 * Limite conhecido: o custo é o custo_por_contrato ATUAL do robô, enquanto a curva do dia usa o custo
 * gravado em cada operação na época; se o custo do robô mudou desde aquele dia, o líquido do extremo e a
 * curva onde o marcador é desenhado ficam em bases diferentes (a diferença é o delta de custo × n).
 */
export function mepMenDoDia(
  exposicao: ExposicaoHoje | null | undefined,
  custoPorContrato: number,
  valorPonto: number,
  base: Base,
  unidade: Unidade,
): MepMenDoDia | null {
  if (!temMedicaoEA(exposicao)) return null;
  const custo = base === "liquido" && Number.isFinite(custoPorContrato) ? custoPorContrato : 0;
  const mepNSaidas = contagem(exposicao.mep_ea_n_saidas);
  const menNSaidas = contagem(exposicao.men_ea_n_saidas);
  const converter = (brl: number) => (unidade === "pontos" ? (valorPonto > 0 ? brl / valorPonto : 0) : brl);
  const mepBruto = numero(exposicao.mep_ea) ?? 0;
  const menBruto = numero(exposicao.men_ea) ?? 0;
  return {
    mep: Math.max(0, converter(mepBruto - mepNSaidas * custo)),
    men: Math.min(0, converter(menBruto - menNSaidas * custo)),
    mepEm: exposicao.mep_ea_em ?? null,
    menEm: exposicao.men_ea_em ?? null,
    mepNSaidas,
    menNSaidas,
    parcial: exposicao.excursao_ea_parcial === true,
  };
}

/**
 * Onde o marcador do extremo entra na curva "operação a operação" (0 a 1 no eixo de baixo): a curva põe a
 * k-ésima operação fechada em k/n, e o extremo aconteceu depois de `nSaidas` fechamentos, então vai em
 * nSaidas/n. Saídas a mais que operações (saída parcial, ou operação tirada da conta pública) param em 1.
 */
export function posicaoDoExtremo(nSaidas: number, nOperacoes: number): number {
  if (!(nOperacoes > 0)) return 0;
  return Math.min(1, Math.max(0, contagem(nSaidas) / nOperacoes));
}

/**
 * MFE/MAE de uma operação como vêm de operacoes_publico (left join com excursoes_posicao): null = a operação
 * não foi medida. Só os três campos, opcionais: OperacaoPublica (src/lib/tipos.ts) os tem assim, e um
 * Pick dela ou um snapshot anterior à migration 0021 também servem (22/09/2026).
 */
export interface ExcursaoDaOperacao {
  mfe_pontos_por_contrato?: number | null;
  mae_pontos_por_contrato?: number | null;
  excursao_parcial?: boolean | null;
}

export interface ExcursaoMedida {
  /** pontos por contrato a favor (>= 0) */
  mfe: number;
  /** pontos por contrato contra (<= 0) */
  mae: number;
  parcial: boolean;
}

/** MFE/MAE prontos para mostrar, ou null quando a operação não foi medida pelo EA. */
export function excursaoDaOperacao(o: ExcursaoDaOperacao): ExcursaoMedida | null {
  const mfe = numero(o.mfe_pontos_por_contrato);
  const mae = numero(o.mae_pontos_por_contrato);
  if (mfe === null && mae === null) return null;
  return { mfe: mfe ?? 0, mae: mae ?? 0, parcial: o.excursao_parcial === true };
}

/** A linha de um dia numa lista da view (a página do calendário recebe todos os dias de uma vez). */
export function exposicaoDoDia<T extends { dia: string }>(lista: ReadonlyArray<T>, dia: string): T | null {
  return lista.find((e) => e.dia === dia) ?? null;
}
