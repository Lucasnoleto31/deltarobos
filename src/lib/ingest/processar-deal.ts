import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

  const tickets = deals.map((d) => d.ticket);
  const { data: existentes, error: erroExistentes } = await sb
    .from("deals")
    .select("ticket")
    .eq("conta_id", contaId)
    .in("ticket", tickets);
  if (erroExistentes) throw erroExistentes;
  const jaExistem = new Set((existentes ?? []).map((e) => Number(e.ticket)));

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

  const { error } = await sb.from("deals").upsert(linhas, { onConflict: "conta_id,ticket" });
  if (error) throw error;

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

  const { data, error } = await sb
    .from("deals")
    .select("ticket, posicao_id, simbolo, tipo, entry, volume, preco, lucro, executado_em, magic, robo_id")
    .eq("conta_id", contaId)
    .in("posicao_id", ids);
  if (error) throw error;

  const porPosicao = new Map<number, DealDoBanco[]>();
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

    // operações fechadas
    const linhas = [];
    for (const op of pareado.fechadas) {
      const prefixo = prefixoDe(op.simbolo, contexto.prefixos);
      if (!prefixo) {
        resultado.sem_prefixo += 1;
        console.warn(`[ingest] símbolo sem multiplicador: ${op.simbolo} (posição ${posicaoId})`);
        continue;
      }
      linhas.push({
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

    if (linhas.length > 0) {
      const { error: erroOps } = await sb
        .from("operacoes")
        .upsert(linhas, { onConflict: "conta_id,posicao_id,ciclo" });
      if (erroOps) throw erroOps;
      resultado.operacoes += linhas.length;
    }

    // ciclos que deixaram de existir após reprocessamento
    const { error: erroLimpeza } = await sb
      .from("operacoes")
      .delete()
      .eq("conta_id", contaId)
      .eq("posicao_id", posicaoId)
      .gt("ciclo", pareado.fechadas.length);
    if (erroLimpeza) throw erroLimpeza;

    // posição em aberto: mostra antes do próximo heartbeat
    if (pareado.aberta) {
      const { error: erroPos } = await sb.from("posicoes_abertas").upsert(
        {
          conta_id: contaId,
          ticket: posicaoId,
          robo_id: roboId,
          magic,
          simbolo: pareado.aberta.simbolo,
          lado: pareado.aberta.lado,
          volume: pareado.aberta.volume,
          preco_abertura: pareado.aberta.preco_medio,
          aberta_em: pareado.aberta.aberta_em,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "conta_id,ticket" },
      );
      if (erroPos) throw erroPos;
      resultado.posicoes_abertas += 1;
    } else {
      const { error: erroDel } = await sb
        .from("posicoes_abertas")
        .delete()
        .eq("conta_id", contaId)
        .eq("ticket", posicaoId);
      if (erroDel) throw erroDel;
    }
  }

  return resultado;
}

export async function processarDeal(contaId: string, deal: Deal) {
  const ctx = await carregarContexto(contaId);
  const gravacao = await gravarDeals(contaId, [deal], ctx);
  const pareamento =
    deal.posicao_id > 0 && (deal.tipo === "buy" || deal.tipo === "sell")
      ? await repararPosicoes(contaId, [deal.posicao_id], ctx)
      : { operacoes: 0, posicoes_abertas: 0, sem_prefixo: 0 };
  return { ...gravacao, ...pareamento };
}

export async function processarHistorico(contaId: string, deals: Deal[]) {
  const ctx = await carregarContexto(contaId);
  const gravacao = await gravarDeals(contaId, deals, ctx);
  const posicoes = deals
    .filter((d) => d.posicao_id > 0 && (d.tipo === "buy" || d.tipo === "sell"))
    .map((d) => d.posicao_id);
  const pareamento = await repararPosicoes(contaId, posicoes, ctx);
  return { ...gravacao, ...pareamento };
}
