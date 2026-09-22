import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { excursaoDoDeal, type ExcursaoParaRegistrar } from "./excursoes";
import { parearPosicao, type DealParaParear } from "./parear";
import type { Deal } from "./schemas";

interface MapeamentoMagic {
  robo_id: string;
  versao_robo: string | null;
}

interface InfoRobo {
  custo_por_contrato: number;
  versao_atual: string | null;
}

interface Contexto {
  magics: Map<number, MapeamentoMagic>;
  robos: Map<string, InfoRobo>;
  prefixos: string[];
}

interface DealDoBanco extends DealParaParear {
  magic: number;
  robo_id: string | null;
}

export interface ResultadoGravacao {
  recebidos: number;
  inseridos: number;
  atualizados: number;
  nao_atribuidos: number;
}

export interface ResultadoPareamentoBanco {
  operacoes: number;
  posicoes_abertas: number;
  sem_prefixo: number;
}

/** Tamanho dos lotes: mantém a URL do PostgREST curta e cada request leve. */
const LOTE = 200;

function emLotes<T>(itens: readonly T[], tamanho = LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

async function carregarContexto(contaId: string): Promise<Contexto> {
  const sb = supabaseAdmin();

  const [magicsRes, prefixosRes] = await Promise.all([
    sb.from("robo_conta_magic").select("magic, robo_id, versao_robo").eq("conta_id", contaId),
    sb.from("multiplicadores").select("prefixo_simbolo"),
  ]);
  if (magicsRes.error) throw magicsRes.error;
  if (prefixosRes.error) throw prefixosRes.error;

  const magics = new Map<number, MapeamentoMagic>();
  for (const m of magicsRes.data ?? []) {
    magics.set(Number(m.magic), {
      robo_id: m.robo_id as string,
      versao_robo: (m.versao_robo as string | null) ?? null,
    });
  }

  const roboIds = [...new Set([...magics.values()].map((m) => m.robo_id))];
  const robos = new Map<string, InfoRobo>();
  if (roboIds.length > 0) {
    const { data, error } = await sb
      .from("robos")
      .select("id, custo_por_contrato, versao_atual")
      .in("id", roboIds);
    if (error) throw error;
    for (const r of data ?? []) {
      robos.set(r.id as string, {
        custo_por_contrato: Number(r.custo_por_contrato ?? 0),
        versao_atual: (r.versao_atual as string | null) ?? null,
      });
    }
  }

  const prefixos = (prefixosRes.data ?? [])
    .map((p) => String(p.prefixo_simbolo))
    .sort((a, b) => b.length - a.length); // mais longo primeiro

  return { magics, robos, prefixos };
}

function prefixoDe(simbolo: string, prefixos: string[]): string | null {
  const s = simbolo.toUpperCase();
  return prefixos.find((p) => s.startsWith(p)) ?? null;
}

/** Upsert dos deals crus. Idempotente por (conta, ticket). */
export async function gravarDeals(
  contaId: string,
  deals: Deal[],
  ctx?: Contexto,
): Promise<ResultadoGravacao> {
  if (deals.length === 0) {
    return { recebidos: 0, inseridos: 0, atualizados: 0, nao_atribuidos: 0 };
  }
  const sb = supabaseAdmin();
  const contexto = ctx ?? (await carregarContexto(contaId));

  const jaExistem = new Set<number>();
  for (const lote of emLotes(deals.map((d) => d.ticket))) {
    const { data, error } = await sb
      .from("deals")
      .select("ticket")
      .eq("conta_id", contaId)
      .in("ticket", lote);
    if (error) throw error;
    for (const e of data ?? []) jaExistem.add(Number(e.ticket));
  }

  let naoAtribuidos = 0;
  const linhas = deals.map((d) => {
    const mapeamento = contexto.magics.get(d.magic) ?? null;
    if (!mapeamento && (d.tipo === "buy" || d.tipo === "sell")) naoAtribuidos += 1;
    return {
      conta_id: contaId,
      ticket: d.ticket,
      robo_id: mapeamento?.robo_id ?? null,
      posicao_id: d.posicao_id,
      ordem: d.ordem ?? null,
      simbolo: d.simbolo.toUpperCase(),
      tipo: d.tipo,
      entry: d.entry,
      volume: d.volume,
      preco: d.preco,
      lucro: d.lucro,
      comissao: d.comissao,
      swap: d.swap,
      executado_em: d.executado_em,
      magic: d.magic,
      comentario: d.comentario ?? null,
      raw: d,
    };
  });

  for (const lote of emLotes(linhas, 500)) {
    const { error } = await sb.from("deals").upsert(lote, { onConflict: "conta_id,ticket" });
    if (error) throw error;
  }

  const ultimo = deals.reduce(
    (max, d) => (new Date(d.executado_em).getTime() > new Date(max).getTime() ? d.executado_em : max),
    deals[0].executado_em,
  );
  const { error: erroStatus } = await sb
    .from("coleta_status")
    .upsert({ conta_id: contaId, ultimo_deal: ultimo }, { onConflict: "conta_id" });
  if (erroStatus) throw erroStatus;

  const inseridos = deals.filter((d) => !jaExistem.has(d.ticket)).length;
  return {
    recebidos: deals.length,
    inseridos,
    atualizados: deals.length - inseridos,
    nao_atribuidos: naoAtribuidos,
  };
}

/**
 * Repareia cada posição a partir de TODOS os deals dela no banco.
 * Ciclos fechados viram operações; posição em aberto atualiza posicoes_abertas.
 * Tudo em lote: uma página de histórico com 100 posições vira meia dúzia de
 * requests, não centenas.
 */
export async function repararPosicoes(
  contaId: string,
  posicaoIds: number[],
  ctx?: Contexto,
): Promise<ResultadoPareamentoBanco> {
  const ids = [...new Set(posicaoIds.filter((p) => p > 0))];
  const resultado: ResultadoPareamentoBanco = { operacoes: 0, posicoes_abertas: 0, sem_prefixo: 0 };
  if (ids.length === 0) return resultado;

  const sb = supabaseAdmin();
  const contexto = ctx ?? (await carregarContexto(contaId));

  // 1. todos os deals das posições afetadas
  const porPosicao = new Map<number, DealDoBanco[]>();
  for (const lote of emLotes(ids)) {
    const { data, error } = await sb
      .from("deals")
      .select("ticket, posicao_id, simbolo, tipo, entry, volume, preco, lucro, executado_em, magic, robo_id")
      .eq("conta_id", contaId)
      .in("posicao_id", lote);
    if (error) throw error;
    for (const d of data ?? []) {
      const item: DealDoBanco = {
        ticket: Number(d.ticket),
        posicao_id: Number(d.posicao_id),
        simbolo: String(d.simbolo),
        tipo: String(d.tipo),
        entry: String(d.entry),
        volume: Number(d.volume),
        preco: Number(d.preco),
        lucro: Number(d.lucro),
        executado_em: String(d.executado_em),
        magic: Number(d.magic),
        robo_id: (d.robo_id as string | null) ?? null,
      };
      const lista = porPosicao.get(item.posicao_id) ?? [];
      lista.push(item);
      porPosicao.set(item.posicao_id, lista);
    }
  }

  // 2. pareamento em memória
  const linhasOperacoes: Record<string, unknown>[] = [];
  const linhasAbertas: Record<string, unknown>[] = [];
  const ticketsFechados: number[] = [];
  const ciclosPorPosicao = new Map<number, number>();
  const agora = new Date().toISOString();

  for (const [posicaoId, deals] of porPosicao) {
    const negociacoes = deals.filter((d) => d.tipo === "buy" || d.tipo === "sell");
    if (negociacoes.length === 0) continue;

    const magic = negociacoes[0].magic;
    const mapeamento = contexto.magics.get(magic) ?? null;
    const roboId = mapeamento?.robo_id ?? negociacoes.find((d) => d.robo_id)?.robo_id ?? null;
    const infoRobo = roboId ? contexto.robos.get(roboId) : undefined;
    const custoPorContrato = infoRobo?.custo_por_contrato ?? 0;
    const versaoRobo = mapeamento?.versao_robo ?? infoRobo?.versao_atual ?? null;

    const pareado = parearPosicao(negociacoes, { custoPorContrato });
    ciclosPorPosicao.set(posicaoId, pareado.fechadas.length);

    for (const op of pareado.fechadas) {
      const prefixo = prefixoDe(op.simbolo, contexto.prefixos);
      if (!prefixo) {
        resultado.sem_prefixo += 1;
        console.warn(`[ingest] símbolo sem multiplicador: ${op.simbolo} (posição ${posicaoId})`);
        continue;
      }
      linhasOperacoes.push({
        robo_id: roboId,
        conta_id: contaId,
        posicao_id: posicaoId,
        ciclo: op.ciclo,
        simbolo: op.simbolo,
        prefixo_simbolo: prefixo,
        lado: op.lado,
        contratos: op.contratos,
        preco_entrada: op.preco_entrada,
        preco_saida: op.preco_saida,
        abertura_em: op.abertura_em,
        fechamento_em: op.fechamento_em,
        duracao_seg: op.duracao_seg,
        pontos: op.pontos,
        pontos_por_contrato: op.pontos_por_contrato,
        resultado_brl: op.resultado_brl,
        resultado_brl_por_contrato: op.resultado_brl_por_contrato,
        custos_brl: op.custos_brl,
        custos_brl_por_contrato: op.custos_brl_por_contrato,
        versao_robo: versaoRobo,
        origem: "mt5",
        dia_pregao: op.dia_pregao,
      });
    }

    if (pareado.aberta) {
      linhasAbertas.push({
        conta_id: contaId,
        ticket: posicaoId,
        robo_id: roboId,
        magic,
        simbolo: pareado.aberta.simbolo,
        lado: pareado.aberta.lado,
        volume: pareado.aberta.volume,
        preco_abertura: pareado.aberta.preco_medio,
        aberta_em: pareado.aberta.aberta_em,
        atualizado_em: agora,
      });
    } else {
      ticketsFechados.push(posicaoId);
    }
  }

  // 3. operações fechadas (um upsert por lote)
  for (const lote of emLotes(linhasOperacoes, 500)) {
    const { error } = await sb
      .from("operacoes")
      .upsert(lote, { onConflict: "conta_id,posicao_id,ciclo" });
    if (error) throw error;
  }
  resultado.operacoes = linhasOperacoes.length;

  // 4. ciclos que deixaram de existir após reprocessamento (um delete por nº de ciclos)
  const porNumeroDeCiclos = new Map<number, number[]>();
  for (const [posicaoId, n] of ciclosPorPosicao) {
    const lista = porNumeroDeCiclos.get(n) ?? [];
    lista.push(posicaoId);
    porNumeroDeCiclos.set(n, lista);
  }
  for (const [n, posicoes] of porNumeroDeCiclos) {
    for (const lote of emLotes(posicoes)) {
      const { error } = await sb
        .from("operacoes")
        .delete()
        .eq("conta_id", contaId)
        .in("posicao_id", lote)
        .gt("ciclo", n);
      if (error) throw error;
    }
  }

  // 5. posições em aberto (aparecem antes do próximo heartbeat)
  for (const lote of emLotes(linhasAbertas, 500)) {
    const { error } = await sb
      .from("posicoes_abertas")
      .upsert(lote, { onConflict: "conta_id,ticket" });
    if (error) throw error;
  }
  resultado.posicoes_abertas = linhasAbertas.length;

  // 6. posições que fecharam saem da tabela
  for (const lote of emLotes(ticketsFechados)) {
    const { error } = await sb
      .from("posicoes_abertas")
      .delete()
      .eq("conta_id", contaId)
      .in("ticket", lote);
    if (error) throw error;
  }

  return resultado;
}

/**
 * MFE/MAE que o EA 1.1.0 mediu tick a tick. Upsert idempotente no banco (greatest/least), então
 * reenvio do mesmo deal não estraga nada. Falha aqui NÃO derruba o deal: a excursão é acessória e um
 * 500 devolveria o deal para a fila do EA, que é FIFO e travaria todos os deals seguintes atrás de um
 * erro que se repete (ex.: migration ainda não aplicada).
 */
async function registrarExcursoes(contaId: string, itens: ExcursaoParaRegistrar[]): Promise<number> {
  if (itens.length === 0) return 0;
  try {
    const { error } = await supabaseAdmin().rpc("registrar_excursoes", { p_conta_id: contaId, p: itens });
    if (error) throw error;
    return itens.length;
  } catch (e) {
    console.error("[ingest] falha ao registrar excursão (deal segue)", e);
    return 0;
  }
}

export async function processarDeal(contaId: string, deal: Deal) {
  const ctx = await carregarContexto(contaId);
  const gravacao = await gravarDeals(contaId, [deal], ctx);
  // Antes de parear: a operação nasce com o join de excursoes_posicao preenchido, e o evento
  // "operacao" (to_jsonb da linha de operacoes_publico) já sai com MFE/MAE.
  const excursao = excursaoDoDeal(deal);
  const excursoes = await registrarExcursoes(contaId, excursao ? [excursao] : []);
  const pareamento =
    deal.posicao_id > 0 && (deal.tipo === "buy" || deal.tipo === "sell")
      ? await repararPosicoes(contaId, [deal.posicao_id], ctx)
      : { operacoes: 0, posicoes_abertas: 0, sem_prefixo: 0 };
  return { ...gravacao, ...pareamento, excursoes };
}

/** Página de histórico: nunca registra excursão (o EA não a manda no history; se vier, é ignorada). */
export async function processarHistorico(contaId: string, deals: Deal[]) {
  const ctx = await carregarContexto(contaId);
  const gravacao = await gravarDeals(contaId, deals, ctx);
  const posicoes = deals
    .filter((d) => d.posicao_id > 0 && (d.tipo === "buy" || d.tipo === "sell"))
    .map((d) => d.posicao_id);
  const pareamento = await repararPosicoes(contaId, posicoes, ctx);
  return { ...gravacao, ...pareamento };
}

async function listarColuna(
  tabela: "deals" | "operacoes" | "posicoes_abertas",
  coluna: "posicao_id" | "ticket",
  contaId: string,
  filtroNegociacao: boolean,
): Promise<Set<number>> {
  const sb = supabaseAdmin();
  const ids = new Set<number>();
  const passo = 1000;
  for (let de = 0; de < 200_000; de += passo) {
    let q = sb.from(tabela).select(coluna).eq("conta_id", contaId).order(coluna).range(de, de + passo - 1);
    if (filtroNegociacao) q = q.gt("posicao_id", 0).in("tipo", ["buy", "sell"]);
    const { data, error } = await q;
    if (error) throw error;
    for (const linha of data ?? []) {
      const v = Number((linha as Record<string, unknown>)[coluna]);
      if (v > 0) ids.add(v);
    }
    if (!data || data.length < passo) break;
  }
  return ids;
}

/**
 * Reconciliação: repareia toda posição que tem deals mas não tem operação,
 * e toda posição ainda marcada como aberta. Cobre páginas de histórico que
 * chegaram fora de ordem, deram timeout ou se perderam num reinício do EA.
 */
export async function reconciliarConta(contaId: string) {
  const ctx = await carregarContexto(contaId);
  const [comDeals, comOperacao, abertas] = await Promise.all([
    listarColuna("deals", "posicao_id", contaId, true),
    listarColuna("operacoes", "posicao_id", contaId, false),
    listarColuna("posicoes_abertas", "ticket", contaId, false),
  ]);

  const pendentes = [...comDeals].filter((id) => !comOperacao.has(id) || abertas.has(id));
  const pareamento = await repararPosicoes(contaId, pendentes, ctx);

  return {
    posicoes_com_deals: comDeals.size,
    reprocessadas: pendentes.length,
    ...pareamento,
  };
}
