import { arredondar, vwap } from "@/lib/stats/normalizacao";
import { hojeSP } from "@/lib/stats/periodos";
import type { Lado } from "@/lib/stats/tipos";

/**
 * Pareamento de deals do MT5 em operações.
 *
 * Conta B3 no MT5 é netting: uma posição por símbolo, identificada por
 * DEAL_POSITION_ID. Dentro de um mesmo posicao_id podem acontecer entradas
 * parciais, saídas parciais e reversões (entry INOUT, que mantém o id).
 * Cada vez que o volume líquido volta a zero fecha um "ciclo", e cada ciclo
 * vira uma operação.
 *
 * Função pura: recebe todos os deals de (conta, posicao_id), devolve ciclos
 * fechados e, se houver, a posição ainda em aberto.
 */

export interface DealParaParear {
  ticket: number;
  posicao_id: number;
  simbolo: string;
  tipo: string; // buy | sell | outros (ignorados)
  entry: string;
  volume: number;
  preco: number;
  lucro: number;
  executado_em: string; // ISO UTC
}

interface Preenchimento {
  volume: number;
  preco: number;
  em: string;
}

interface Saida extends Preenchimento {
  lucro: number;
}

export interface CicloFechado {
  estado: "fechada";
  ciclo: number;
  posicao_id: number;
  simbolo: string;
  lado: Lado;
  contratos: number;
  preco_entrada: number;
  preco_saida: number;
  abertura_em: string;
  fechamento_em: string;
  duracao_seg: number;
  pontos: number;
  pontos_por_contrato: number;
  resultado_brl: number;
  resultado_brl_por_contrato: number;
  custos_brl: number;
  custos_brl_por_contrato: number;
  dia_pregao: string;
  tickets: number[];
}

export interface PosicaoEmAberto {
  estado: "aberta";
  posicao_id: number;
  simbolo: string;
  lado: Lado;
  volume: number;
  preco_medio: number;
  aberta_em: string;
}

export interface ResultadoPareamento {
  fechadas: CicloFechado[];
  aberta: PosicaoEmAberto | null;
  /** tickets que não são buy/sell (balance, comissão...) ou sem volume */
  ignorados: number[];
}

export interface OpcoesPareamento {
  /** corretagem + emolumentos por contrato, ida e volta */
  custoPorContrato: number;
}

const EPS = 1e-6;

function ehNegociacao(d: DealParaParear): boolean {
  return (d.tipo === "buy" || d.tipo === "sell") && d.volume > EPS;
}

function tempo(iso: string): number {
  return new Date(iso).getTime();
}

function compararDeals(a: DealParaParear, b: DealParaParear): number {
  const diff = tempo(a.executado_em) - tempo(b.executado_em);
  if (diff !== 0) return diff;
  return a.ticket - b.ticket;
}

export function parearPosicao(
  deals: readonly DealParaParear[],
  o: OpcoesPareamento,
): ResultadoPareamento {
  const negociacoes = deals.filter(ehNegociacao).sort(compararDeals);
  const ignorados = deals.filter((d) => !ehNegociacao(d)).map((d) => d.ticket);

  const fechadas: CicloFechado[] = [];
  let ciclo = 0;
  let net = 0; // > 0 comprado, < 0 vendido
  let ladoCiclo: 1 | -1 = 1;
  let entradas: Preenchimento[] = [];
  let saidas: Saida[] = [];
  let tickets: number[] = [];
  let simboloCiclo = "";
  let posicaoId = 0;

  const fecharCiclo = () => {
    ciclo++;
    fechadas.push(
      montarOperacao({
        ciclo,
        posicao_id: posicaoId,
        simbolo: simboloCiclo,
        lado: ladoCiclo,
        entradas,
        saidas,
        tickets,
        custoPorContrato: o.custoPorContrato,
      }),
    );
    entradas = [];
    saidas = [];
    tickets = [];
    net = 0;
  };

  for (const d of negociacoes) {
    const dir: 1 | -1 = d.tipo === "buy" ? 1 : -1;
    let restante = d.volume;

    if (Math.abs(net) < EPS) {
      // abre um ciclo novo
      ladoCiclo = dir;
      simboloCiclo = d.simbolo;
      posicaoId = d.posicao_id;
    }

    if (Math.abs(net) < EPS || Math.sign(net) === dir) {
      // abre ou aumenta a posição
      entradas.push({ volume: restante, preco: d.preco, em: d.executado_em });
      tickets.push(d.ticket);
      net += dir * restante;
      continue;
    }

    // contra a posição: fecha até o que está aberto
    const fecha = Math.min(restante, Math.abs(net));
    saidas.push({ volume: fecha, preco: d.preco, em: d.executado_em, lucro: d.lucro });
    tickets.push(d.ticket);
    net += dir * fecha;
    restante -= fecha;

    if (Math.abs(net) < EPS) {
      fecharCiclo();
    }

    if (restante > EPS) {
      // reversão: o que sobrou abre posição no sentido oposto
      ladoCiclo = dir;
      simboloCiclo = d.simbolo;
      posicaoId = d.posicao_id;
      entradas.push({ volume: restante, preco: d.preco, em: d.executado_em });
      tickets.push(d.ticket);
      net += dir * restante;
    }
  }

  let aberta: PosicaoEmAberto | null = null;
  if (Math.abs(net) > EPS && entradas.length > 0) {
    aberta = {
      estado: "aberta",
      posicao_id: posicaoId,
      simbolo: simboloCiclo,
      lado: net > 0 ? "compra" : "venda",
      volume: arredondar(Math.abs(net), 2),
      preco_medio: arredondar(vwap(entradas), 3),
      aberta_em: entradas[0].em,
    };
  }

  return { fechadas, aberta, ignorados };
}

function montarOperacao(p: {
  ciclo: number;
  posicao_id: number;
  simbolo: string;
  lado: 1 | -1;
  entradas: Preenchimento[];
  saidas: Saida[];
  tickets: number[];
  custoPorContrato: number;
}): CicloFechado {
  const contratos = p.entradas.reduce((s, e) => s + e.volume, 0);
  const precoEntrada = vwap(p.entradas);
  const precoSaida = vwap(p.saidas);
  const aberturaEm = p.entradas.reduce(
    (min, e) => (tempo(e.em) < tempo(min) ? e.em : min),
    p.entradas[0].em,
  );
  const fechamentoEm = p.saidas.reduce(
    (max, s) => (tempo(s.em) > tempo(max) ? s.em : max),
    p.saidas[0].em,
  );
  const duracaoSeg = Math.max(
    0,
    Math.round((new Date(fechamentoEm).getTime() - new Date(aberturaEm).getTime()) / 1000),
  );

  const pontosPorContrato = p.lado * (precoSaida - precoEntrada);
  const resultadoBrl = p.saidas.reduce((s, x) => s + x.lucro, 0);
  const custosBrl = p.custoPorContrato * contratos;

  return {
    estado: "fechada",
    ciclo: p.ciclo,
    posicao_id: p.posicao_id,
    simbolo: p.simbolo,
    lado: p.lado === 1 ? "compra" : "venda",
    contratos: arredondar(contratos, 2),
    preco_entrada: arredondar(precoEntrada, 3),
    preco_saida: arredondar(precoSaida, 3),
    abertura_em: aberturaEm,
    fechamento_em: fechamentoEm,
    duracao_seg: duracaoSeg,
    pontos: arredondar(pontosPorContrato * contratos, 3),
    pontos_por_contrato: arredondar(pontosPorContrato, 3),
    resultado_brl: arredondar(resultadoBrl, 2),
    resultado_brl_por_contrato: arredondar(resultadoBrl / contratos, 4),
    custos_brl: arredondar(custosBrl, 2),
    custos_brl_por_contrato: arredondar(p.custoPorContrato, 4),
    dia_pregao: hojeSP(new Date(fechamentoEm)),
    tickets: [...new Set(p.tickets)],
  };
}
