import type { ParametrosFaixas } from "@/lib/stats/faixas";
import type { Lado, LinhaDiaria, RoboStatus } from "@/lib/stats/tipos";

/** Linha de robos_publico */
export interface RoboPublico {
  id: string;
  slug: string;
  nome: string;
  ativo: string;
  ativo_nome: string;
  valor_ponto_brl: number;
  descricao_publica: string | null;
  horario_inicio: string | null;
  horario_fim: string | null;
  contratos_padrao: number;
  custo_por_contrato: number;
  capital_referencia: number | null;
  status: RoboStatus;
  versao_atual: string | null;
  ordem: number;
  conta_real_desde: string | null;
  ultimo_heartbeat_em: string | null;
  ultima_operacao_em: string | null;
  posicionado: boolean;
  /**
   * Operações em aberto (21/09/2026): tickets ainda abertos na conta principal que já passaram do atraso
   * público, cada um contando 1 (nunca volume). Opcional: falta em snapshot anterior à migration 0020.
   */
  n_posicoes_abertas?: number;
  relatorio_mt5_url: string | null;
  conta_tipo: "real" | "demo" | null;
  /** false = robô só com histórico importado, sem conta/coletor no MT5 */
  tem_coletor: boolean;
  /**
   * Regras que tiram operações da conta pública (spec §7; migrations 0016 e 0018): operação aberta antes de
   * hora_minima_operacao (Brasília), ou de MT5 com menos de duracao_minima_seg a partir de duracao_minima_desde
   * (nulo = histórico inteiro). Nulo = sem regra. O MEP/MEN medido pelo EA só vale num dia em que nenhuma
   * operação ficou fora (exposicao_dia_publico já exclui esse dia; aqui é só para quem precisar saber).
   */
  hora_minima_operacao: string | null;
  duracao_minima_seg: number | null;
  duracao_minima_desde: string | null;
}

/** Linha de operacoes_publico */
export interface OperacaoPublica {
  id: number;
  robo_id: string;
  slug: string;
  simbolo: string;
  prefixo_simbolo: string;
  lado: Lado;
  abertura_em: string;
  fechamento_em: string;
  duracao_seg: number;
  /** nulos em operações importadas do histórico antigo */
  preco_entrada: number | null;
  preco_saida: number | null;
  pontos_por_contrato: number;
  resultado_brl_por_contrato: number;
  custos_brl_por_contrato: number;
  versao_robo: string | null;
  dia_pregao: string;
  resultado_liquido_por_contrato: number;
  origem: "mt5" | "manual";
  /**
   * Excursão medida pelo EA 1.1.0 tick a tick (22/09/2026): máxima a favor (>= 0) e máxima contra (<= 0),
   * em pontos por contrato, com o instante de cada extremo. Nulos quando não medido (EA antigo, importação
   * manual, operação anterior ao EA 1.1.0). Opcionais: faltam em snapshot anterior à migration 0021.
   */
  mfe_pontos_por_contrato?: number | null;
  mae_pontos_por_contrato?: number | null;
  mfe_em?: string | null;
  mae_em?: string | null;
  /** true = o EA não viu a posição inteira (subiu com ela aberta): MFE/MAE podem estar subestimados */
  excursao_parcial?: boolean | null;
}

/** Linha de posicoes_abertas_publico */
export interface PosicaoPublica {
  robo_id: string;
  slug: string;
  simbolo: string;
  lado: Lado;
  preco_abertura: number;
  lucro_flutuante_por_contrato: number;
  aberta_em: string;
  atualizado_em: string;
  /**
   * Quantos tickets do grupo (símbolo, lado) ainda estão abertos e já passaram do atraso público, cada um
   * contando 1 (21/09/2026). Opcional: falta em snapshot ou evento anteriores à migration 0020.
   */
  n_abertas?: number;
  /**
   * Excursão do grupo até agora, medida pelo EA 1.1.0 (22/09/2026): maior MFE e menor MAE entre os tickets
   * do grupo, em pontos por contrato. Nulos sem medição. Opcionais: faltam antes da migration 0021.
   */
  mfe_pontos_por_contrato?: number | null;
  mae_pontos_por_contrato?: number | null;
}

/** Linha de estatisticas_publico */
export interface EstatisticaPublica extends LinhaDiaria {
  robo_id: string;
  slug: string;
  atualizado_em: string;
}

/** Linha de mercado_publico */
export interface MercadoPublico {
  prefixo_simbolo: string;
  nome: string;
  valor_ponto_brl: number;
  margem_referencia: number | null;
  pregao_inicio: string;
  pregao_fim: string;
  simbolo: string | null;
  preco: number | null;
  fechamento_anterior: number | null;
  variacao_pct: number | null;
  cotacao_em: string | null;
}

/** Item de resumo_casa_hoje().robos */
export interface ResumoRobo {
  slug: string;
  nome: string;
  status: RoboStatus;
  resultado_bruto_por_contrato: number;
  resultado_liquido_por_contrato: number;
  pontos_por_contrato: number;
  n_operacoes: number;
  n_gain: number;
  posicionado: boolean;
  /** operações em aberto do robô (entradas, nunca contratos); opcional em resumo anterior à migration 0020 */
  n_posicoes_abertas?: number;
}

/** Retorno de resumo_casa_hoje() e payload do evento "resumo" no topic casa */
export interface ResumoCasa {
  dia: string;
  resultado_bruto_por_contrato: number;
  resultado_liquido_por_contrato: number;
  n_operacoes: number;
  n_gain: number;
  n_robos_posicionados: number;
  /** soma de n_posicoes_abertas dos robôs; opcional em resumo anterior à migration 0020 */
  n_posicoes_abertas?: number;
  robos: ResumoRobo[];
  gerado_em: string;
}

/**
 * Linha de exposicao_dia_publico: MEP/MEN do dia medidos pelo EA 1.1.0 tick a tick (22/09/2026), em R$
 * BRUTOS por contrato (realizado do dia + flutuante), agregados nos magics do robô na conta principal.
 * Líquido = bruto - n_saidas x custo_por_contrato (n_saidas = ciclos fechados, não deals); pontos = /
 * valor_ponto. Não existe linha para dia com importação manual, dia em que alguma operação do robô ficou
 * fora da conta pública (hora/duração mínima: o saldo do EA não bateria com a curva) nem dia anterior ao
 * EA 1.1.0: aí vale excursaoDoDia (por fechamento).
 */
export interface ExposicaoDiaPublica {
  robo_id: string;
  slug: string;
  dia: string;
  /** maior saldo do dia (>= 0) e instante em que ocorreu; null = nenhum magic mediu ainda */
  mep_ea: number | null;
  mep_ea_em: string | null;
  /** quantas operações (ciclos) já tinham fechado no MEP: posição do marcador na curva (mep_ea_n_saidas / nOperacoes) */
  mep_ea_n_saidas: number | null;
  /** menor saldo do dia (<= 0) e instante em que ocorreu; null = nenhum magic mediu ainda */
  men_ea: number | null;
  men_ea_em: string | null;
  men_ea_n_saidas: number | null;
  /** true = algum magic já tinha deal antes de o EA subir naquele dia: extremos podem estar subestimados */
  excursao_ea_parcial: boolean | null;
  /** quantos magics do robô contribuíram */
  n_magics: number;
}

/** Payload do evento "coleta" (topic casa e robo:<slug>) */
export interface EventoColeta {
  slug: string;
  ultimo_heartbeat_em: string | null;
  posicionado: boolean;
  /** operações em aberto do robô no momento do heartbeat; opcional em evento anterior à migration 0020 */
  n_posicoes_abertas?: number;
  /**
   * MEP/MEN de hoje pelo EA (campos de exposicao_dia_publico, 22/09/2026). Nulos quando nenhum magic do
   * robô mandou exposição hoje; opcionais em evento anterior à migration 0021.
   */
  mep_ea?: number | null;
  men_ea?: number | null;
  mep_ea_n_saidas?: number | null;
  men_ea_n_saidas?: number | null;
  excursao_ea_parcial?: boolean | null;
}

/** Payload do evento "cotacao" */
export interface EventoCotacao {
  mercado: MercadoPublico[];
}

/** parametros_publico.links */
export interface Links {
  whatsapp: string;
  youtube: string;
  youtube_canal_id: string;
  instagram: string;
  sala_ao_vivo: string;
  btg_abertura_conta: string;
  treinamentos: string;
  painel_mercado: string;
  programa_pontos: string;
  proxima_live: string;
}

/** parametros_publico.textos */
export interface Textos {
  hero_titulo: string;
  hero_subtitulo: string;
  disclaimer: string;
  contato_email: string;
}

export interface Parametros {
  links: Links;
  textos: Textos;
  fatorSeguranca: number;
  /** regras da validação de faixas (chave "faixas" em parametros) */
  faixas: ParametrosFaixas;
}

export interface VideoYouTube {
  id: string;
  titulo: string;
  url: string;
  publicadoEm: string;
  thumb: string;
}
