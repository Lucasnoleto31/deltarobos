import { formatarNumero } from "@/lib/formato";
import { coletaParada } from "./pregao";

/**
 * Operações em aberto (21/09/2026, pedido do Lucas: "quantas operações o robô está aberto de fato nesse
 * momento"). A conta é de ENTRADAS: cada ticket ainda aberto na conta principal do robô conta 1, e o site
 * nunca mostra volume nem contratos (spec §6). O banco entrega o número pronto, já filtrado pelo atraso
 * público de cada robô: `n_abertas` por grupo (símbolo, lado) em posicoes_abertas_publico e
 * `n_posicoes_abertas` por robô em robos_publico, no evento "coleta" e em resumo_casa_hoje(). Aqui é só
 * somar, rotular e aplicar o gating do "ao vivo" (spec §5): fora do pregão ou com o coletor parado o
 * número não vale.
 */

/** Grupo de posicoes_abertas_publico: só o que a contagem precisa. */
export interface GrupoAberto {
  n_abertas?: number | null;
}

/** Robô como vem em resumo_casa_hoje().robos[], no evento "coleta" ou em robos_publico. */
export interface RoboComAbertas {
  posicionado?: boolean | null;
  n_posicoes_abertas?: number | null;
}

/** Contagem válida é inteiro positivo; qualquer outra coisa (ausente, nulo, NaN, negativo) vale 0. */
function contagem(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Operações em aberto de um robô: soma do n_abertas dos grupos da view. Grupo sem o campo (snapshot ou
 * evento anteriores à view nova) conta 0: melhor não mostrar número nenhum do que inventar um.
 */
export function totalAbertas(grupos: ReadonlyArray<GrupoAberto>): number {
  return grupos.reduce((s, g) => s + contagem(g.n_abertas), 0);
}

/** "1 operação em aberto", "3 operações em aberto"; zero (ou inválido) devolve null: nada a mostrar. */
export function rotuloOperacoesEmAberto(n: number): string | null {
  const c = contagem(n);
  if (c === 0) return null;
  return `${formatarNumero(c)} ${c === 1 ? "operação" : "operações"} em aberto`;
}

/** Soma de n_posicoes_abertas dos robôs, tolerando o campo ausente. */
export function somarAbertas(robos: ReadonlyArray<RoboComAbertas>): number {
  return robos.reduce((s, r) => s + contagem(r.n_posicoes_abertas), 0);
}

/** Robôs com pelo menos uma operação em aberto: n_posicoes_abertas > 0 ou, sem o número, o booleano posicionado. */
export function contarPosicionados(robos: ReadonlyArray<RoboComAbertas>): number {
  return robos.filter((r) => contagem(r.n_posicoes_abertas) > 0 || r.posicionado === true).length;
}

/**
 * Gating do "ao vivo", o mesmo do selo Posicionado (statusAoVivo): fora do pregão o contador não aparece;
 * com o pregão aberto e o coletor parado (coletaParada: sem heartbeat há mais de 2 min, ou nunca) também
 * não, e quem fala é o aviso "sem atualização". Sem relógio (servidor e hidratação, agora = null) não há
 * "ao vivo": o selo nunca vira Posicionado sem relógio, e o contador segue igual. Antes só o pregão decidia
 * aí, e o HTML do servidor (ISR de 60 s) chegava com "3 operações em aberto" ao lado de um selo "Fora do
 * horário" quando o coletor estava parado: dado velho parecendo vivo para o crawler e para quem está sem
 * JS. Custo: o contador entra logo depois da hidratação, como o selo.
 */
export function abertasAoVivo(
  n: number,
  ultimoHeartbeatEm: string | null | undefined,
  agora: Date | null,
  pregaoAberto: boolean,
): number {
  if (!pregaoAberto || !agora) return 0;
  if (coletaParada(ultimoHeartbeatEm, agora, true)) return 0;
  return contagem(n);
}

/** Saúde do coletor por slug, como o estado da casa guarda (evento "coleta" ou robos_publico). */
export interface ColetaComAbertas {
  ultimo_heartbeat_em: string | null;
  n_posicoes_abertas?: number | null;
}

/** Item de resumo_casa_hoje().robos[]: o status do cadastro e a contagem de reserva. */
export interface RoboDoResumo extends RoboComAbertas {
  slug: string;
  status?: string;
}

export interface AbertasCasa {
  /** por slug, já com o gating; robô fora do pregão, com coletor parado ou fora do cadastro ativo vale 0 */
  porRobo: Record<string, number>;
  total: number;
}

/**
 * Operações em aberto da casa, robô a robô e somadas. O número vem do mapa de coleta, que useCasaAoVivo
 * mantém fresco: o evento "coleta" só chega a cada 30 s por robô (throttle) e conta antes da sincronização
 * do próprio heartbeat, então o hook funde nele o "resumo", que sai na hora em que uma entrada abre, fecha
 * ou passa do atraso (último a chegar manda). O número do resumo aqui é só reserva para coleta sem o campo.
 * O heartbeat de cada robô vem da coleta: robô sem entrada lá não tem sinal conhecido e fica em 0.
 *
 * Cadastro primeiro, como statusAoVivo: quem está no resumo conta só se ativo (pausado fica 0, o selo dele
 * nunca é Posicionado); quem não está no resumo (em breve ou arquivado: resumo_casa_hoje só traz ativo e
 * pausado) também fica 0, mesmo que o EA ainda mande sinal e a coleta o conheça, senão a barra somava
 * entradas de um robô que nem tem card. Só sem resumo nenhum (RPC falhou) a coleta decide sozinha.
 */
export function abertasDaCasa(
  coleta: Readonly<Record<string, ColetaComAbertas>>,
  robos: ReadonlyArray<RoboDoResumo>,
  agora: Date | null,
  pregaoAberto: boolean,
): AbertasCasa {
  const doResumo = new Map(robos.map((r) => [r.slug, r]));
  const slugs = new Set([...Object.keys(coleta), ...doResumo.keys()]);
  const porRobo: Record<string, number> = {};
  let total = 0;
  for (const slug of slugs) {
    const c = coleta[slug];
    const r = doResumo.get(slug);
    const ativo = r ? r.status === undefined || r.status === "ativo" : robos.length === 0;
    const bruto = c?.n_posicoes_abertas ?? r?.n_posicoes_abertas ?? 0;
    const n = ativo ? abertasAoVivo(bruto, c?.ultimo_heartbeat_em ?? null, agora, pregaoAberto) : 0;
    porRobo[slug] = n;
    total += n;
  }
  return { porRobo, total };
}
