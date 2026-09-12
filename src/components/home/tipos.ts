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
  ultimoHeartbeatEm: string | null;
  hoje: number;
  mes: number;
  acumulado: number;
  drawdownMaximo: number;
  sparkline: number[];
  nDias: number;
  contaRealDesde: string | null;
}

export interface InicialCasa {
  resumo: ResumoCasa | null;
  mercado: MercadoPublico[];
  coleta: Record<string, EventoColeta>;
}

export type PregaoPorAtivo = Record<string, HorarioPregao>;
