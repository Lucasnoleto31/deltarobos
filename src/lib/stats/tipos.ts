export type RoboStatus = "ativo" | "em_breve" | "pausado" | "arquivado";
export type Lado = "compra" | "venda";

/** Uma linha de estatisticas_publico. Tudo por 1 contrato. */
export interface LinhaDiaria {
  dia: string; // YYYY-MM-DD (pregão em Brasília)
  pontos_por_contrato: number;
  resultado_brl_por_contrato: number; // bruto
  custos_brl_por_contrato: number;
  n_operacoes: number;
  n_gain: number;
  n_loss: number;
  soma_gain_brl_por_contrato: number; // líquido, >= 0
  soma_loss_brl_por_contrato: number; // líquido, <= 0
  maior_gain_brl_por_contrato: number;
  maior_loss_brl_por_contrato: number;
}

export type Base = "bruto" | "liquido";
export type Unidade = "pontos" | "brl";

export interface OpcoesSerie {
  base: Base;
  unidade: Unidade;
  /** R$ por ponto por contrato do ativo do robô (WIN 0,20 / WDO 10,00) */
  valorPonto: number;
  /** Quantidade de contratos simulada. Padrão 1. */
  contratos?: number;
}

export interface PontoCurva {
  dia: string;
  valor: number;
  acumulado: number;
  pico: number;
  /** acumulado - pico, sempre <= 0 */
  drawdown: number;
}

export interface Drawdown {
  /** magnitude do drawdown máximo (positivo) */
  valor: number;
  inicio: string | null;
  fundo: string | null;
  recuperacao: string | null;
  diasAteRecuperar: number | null;
}
