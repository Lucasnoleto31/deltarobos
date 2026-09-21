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

/** Payload do evento "coleta" (topic casa e robo:<slug>) */
export interface EventoColeta {
  slug: string;
  ultimo_heartbeat_em: string | null;
  posicionado: boolean;
  /** operações em aberto do robô no momento do heartbeat; opcional em evento anterior à migration 0020 */
  n_posicoes_abertas?: number;
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
