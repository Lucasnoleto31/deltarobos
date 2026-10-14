import type { HorarioPregao } from "@/lib/stats/pregao";
import type { RoboStatus } from "@/lib/stats/tipos";
import type { EventoColeta, MercadoPublico, ResumoCasa } from "@/lib/tipos";

/** O que o servidor calcula por robô pro card da home (R$ líquido por contrato). */
export interface DadosCardRobo {
  slug: string;
  nome: string;
  ativo: string;
  ativoNome: string;
  status: RoboStatus;
  descricao: string | null;
  horarioInicio: string | null;
  horarioFim: string | null;
  posicionado: boolean;
  /** operações em aberto no snapshot do servidor (entradas, nunca contratos); falta antes da migration 0020 */
  nPosicoesAbertas?: number;
  ultimoHeartbeatEm: string | null;
  temColetor: boolean;
  hoje: number;
  mes: number;
  acumulado: number;
  drawdownMaximo: number;
  sparkline: number[];
  nDias: number;
  contaRealDesde: string | null;
  /** último dia com operação fechada, até hoje inclusive; nulo em robô sem histórico */
  ultimoPregao: UltimoPregao | null;
}

/** Um dia de pregão já fechado, por contrato e líquido de custos. */
export interface UltimoPregao {
  dia: string;
  valor: number;
  nOperacoes: number;
  nGain: number;
}

/** O último pregão somando os robôs da home, com o de maior resultado no dia. */
export interface UltimoPregaoCasa extends UltimoPregao {
  melhor: { nome: string; valor: number } | null;
}

export interface InicialCasa {
  resumo: ResumoCasa | null;
  mercado: MercadoPublico[];
  coleta: Record<string, EventoColeta>;
}

export type PregaoPorAtivo = Record<string, HorarioPregao>;
