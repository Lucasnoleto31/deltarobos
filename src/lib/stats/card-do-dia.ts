// A imagem do dia para compartilhar (24/09/2026, Lucas: "Card do dia para compartilhar. Uma imagem pronta ao fim
// de cada pregão, com a curva real do dia, resultado, MEP e MEN e o número de operações, gerada pelo site e com
// botão 'compartilhar' no Hoje ao vivo e na tela cheia. É o que alimenta a live, o WhatsApp e o Instagram sem
// montar nada na mão.").
//
// Aqui fica só a conta: os textos prontos e a curva em coordenadas normalizadas (0..1) e em caminhos SVG, para a
// rota /api/og/[slug]/[dia] desenhar com o ImageResponse sem fazer conta nenhuma. A curva é a MESMA do Hoje ao
// vivo, da tela cheia e do calendário (CurvaDoDia e PainelCalendario): a série do saldo do EA 1.1.2 recortada ao
// pregão (baldesDoPregao), líquida dos custos (liquidarSerie) e reduzida (reduzirBaldes), com a faixa mín./máx.;
// sem série, a curva por fechamento, operação a operação. O MEP e o MEN são os do Hoje ao vivo (mepMenDoDia,
// líquidos); sem medição do EA, por fechamento (excursao). Sem React, sem banco e sem relógio: o instante chega
// por parâmetro (a rota passa new Date(); os testes fixam).

import { formatarBRL, formatarDataLonga, formatarHora, formatarNumero, formatarPct, formatarPontos } from "@/lib/formato";
import type { BaldeCompacto, FechamentoCompacto, OperacaoPublica, RoboPublico } from "@/lib/tipos";
import { mepMenDoDia, type ExposicaoHoje } from "./exposicao";
import { excursao } from "./operacoes";
import { agoraSP } from "./periodos";
import { normalizarHora, type HorarioPregao } from "./pregao";
import {
  baldesDoPregao,
  fechamentosDasOperacoes,
  horarioDaJanela,
  inferirBucketSeg,
  inicioDaMedicao,
  janelaDoDia,
  legendaCurtaDoSaldo,
  liquidarSerie,
  posicaoNaJanela,
  reduzirBaldes,
  rotulosDeHora,
} from "./saldo-dia";

/** grupos de baldes desenhados (reduzirBaldes): 936 px de largura, uns 3 px por vértice, a imagem não tem mira */
export const PONTOS_CARD = 300;
/** marcas de hora no eixo de baixo: mais que isso não cabe legível na largura da imagem */
export const MAX_ROTULOS_CARD = 5;
/** a frase legal de reserva, quando o aviso do banco não tem uma frase curta de "passado não garante futuro" */
export const FRASE_LEGAL_PADRAO = "Rentabilidade passada não garante rentabilidade futura.";
/** o tamanho máximo da frase legal numa linha da imagem */
export const LIMITE_FRASE_LEGAL = 100;

export type TomCard = "positivo" | "negativo" | "neutro";

/** |v| < 0,005 (arredondado some) = neutro; senão pelo sinal */
export function tomDoValor(v: number): TomCard {
  if (!Number.isFinite(v) || Math.abs(v) < 0.005) return "neutro";
  return v > 0 ? "positivo" : "negativo";
}

/**
 * `posicionado` (24/09/2026, revisão): com posição aberta o dia ainda não fechou, mesmo depois do fim do pregão. A
 * zeragem das 18:00 só vira operação alguns décimos de segundo depois; sem isso, a imagem gerada nesse instante saía
 * definitiva com o resultado de antes da zeragem.
 */
export type RoboDoCard = Pick<
  RoboPublico,
  | "slug"
  | "nome"
  | "ativo"
  | "ativo_nome"
  | "conta_tipo"
  | "valor_ponto_brl"
  | "custo_por_contrato"
  | "horario_inicio"
  | "horario_fim"
  | "posicionado"
>;
export type OperacaoDoCard = Pick<
  OperacaoPublica,
  "fechamento_em" | "resultado_brl_por_contrato" | "custos_brl_por_contrato" | "pontos_por_contrato" | "origem"
>;

export interface EntradaCardDoDia {
  robo: RoboDoCard;
  /** YYYY-MM-DD, dia de pregão */
  dia: string;
  /** o instante da montagem (a rota passa new Date(); os testes fixam) */
  agora: Date;
  /** pregão do ativo (mercado_publico), ou { inicio: "09:00", fim: "18:00" } */
  pregao: HorarioPregao;
  /** operações públicas do dia (listarOperacoesDoDia) */
  operacoes: readonly OperacaoDoCard[];
  /** listarSaldoDoDia: baldes brutos [t, min, max, ultimo] e o aviso de aproximação */
  saldo: { baldes: readonly BaldeCompacto[]; aproximado: boolean };
  /** a linha do dia de listarExposicaoDia, ou null */
  exposicao: ExposicaoHoje | null;
  /** parametros.textos.disclaimer JÁ com comMarcaAtual (a rota aplica) */
  disclaimer: string;
  /** NEXT_PUBLIC_SITE_URL, ou a origem da requisição */
  site: string;
}

/** 0..1; x 0 = esquerda, y 0 = TOPO */
export interface PontoDoCard {
  x: number;
  y: number;
}
/** yAlto = y do máximo, yBaixo = y do mínimo */
export interface FaixaDoCard {
  x: number;
  yAlto: number;
  yBaixo: number;
}
export interface RotuloDoCard {
  x: number;
  texto: string;
}

export interface CurvaDoCard {
  fonte: "serie" | "fechamento";
  /** título e legenda numa linha só, pronta para escrever */
  legenda: string;
  /** em ordem de x; série: um ponto por grupo (<= PONTOS_CARD); fechamento: (0, zero) + um ponto por operação */
  linha: PontoDoCard[];
  /** só série não aproximada; null nos outros casos */
  faixa: FaixaDoCard[] | null;
  yZero: number;
  /** 0 a 5 marcas */
  rotulosX: RotuloDoCard[];
  /** tom do último ponto (a bolinha do fim) */
  tomFinal: TomCard;
}

/** tom null = cor do texto */
export interface NumeroDoCard {
  rotulo: string;
  valor: string;
  tom: TomCard | null;
}

export interface DadosCardDoDia {
  /** "Apollo" */
  nome: string;
  /** "Mini Índice · WIN" (só o ativo quando ativo_nome vier vazio) */
  ativo: string;
  /** "quarta-feira, 23 de setembro de 2026" */
  data: string;
  /** robo.conta_tipo === "demo" */
  contaDemo: boolean;
  /** "Parcial · até 14:32" | null */
  parcial: string | null;
  /** "Resultado do dia, por contrato" | "Resultado parcial, por contrato" */
  rotuloResultado: string;
  /** formatarBRL(v, { sinal: true }): "+R$ 1.131,00" */
  resultado: string;
  tomResultado: TomCard;
  /** `${formatarPontos(p, true)} pts` */
  pontos: string;
  /** operações, acerto, MEP, MEN */
  numeros: readonly [NumeroDoCard, NumeroDoCard, NumeroDoCard, NumeroDoCard];
  fonteMepMen: "mt5" | "fechamento";
  notaMepMen: string;
  curva: CurvaDoCard;
  /** "Por 1 contrato, líquido de custos · quantsrobos.com/robos/apollo" */
  rodape: string;
  legal: string;
  /** números crus, para os testes e o alt */
  valores: { resultado: number; pontos: number; nOperacoes: number; nGains: number; mep: number; men: number; ultimoDadoT: number };
}

/** R$ curto dos números pequenos da imagem: inteiro a partir de mil, como a prévia OG e o eixo da curva */
function brlCurto(v: number): string {
  return formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });
}

/** "2026-09-23" -> "quarta-feira, 23 de setembro de 2026" */
export function dataPorExtenso(dia: string): string {
  // meio-dia UTC e fuso UTC: a data civil do dia, sem o fuso do servidor mudar o dia da semana
  const semana = new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
  return `${semana}, ${formatarDataLonga(dia)}`;
}

/** tira protocolo, "www." e barra final: "https://www.quantsrobos.com/" -> "quantsrobos.com" */
export function enderecoCurto(url: string): string {
  return url
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/**
 * A frase de "passado não garante futuro" do aviso legal do banco, quando cabe numa linha da imagem (até
 * LIMITE_FRASE_LEGAL caracteres); senão FRASE_LEGAL_PADRAO. O aviso inteiro (1.187 caracteres em 24/09/2026)
 * não cabe numa imagem e continua no rodapé do site; a frase vem dele para o Lucas seguir dono do texto.
 */
export function fraseLegalCurta(disclaimer: string): string {
  const frases = disclaimer.split(/(?<=[.!?])\s+/);
  for (const bruta of frases) {
    const frase = bruta.trim();
    if (frase.length > 0 && frase.length <= LIMITE_FRASE_LEGAL && /passad[oa]s?/i.test(frase) && /garant/i.test(frase)) return frase;
  }
  return FRASE_LEGAL_PADRAO;
}

/**
 * O maior tamanho de fonte (entre `minimo` e `maximo`) para `texto` caber em `largura` px numa linha. 0,56 em é a
 * largura média de um caractere da Geist (a fonte padrão do ImageResponse), medida com folga no protótipo.
 */
export function tamanhoParaCaber(texto: string, largura: number, maximo: number, minimo: number): number {
  return Math.max(minimo, Math.min(maximo, Math.floor(largura / (Math.max(1, texto.length) * 0.56))));
}

/**
 * O fim do dia de um robô, "HH:MM": o mais tarde entre o fim do horário dele (`horario`, já com a volta para o
 * pregão de horarioDaJanela) e o fim do pregão do ativo. Em 23/09/2026 o Apollo, com horário até 17:30, fechou
 * operações às 18:00 (a zeragem): até esse fim, o dia de hoje ainda está em andamento.
 */
export function fimDoDia(horario: HorarioPregao, pregao: HorarioPregao): string {
  const doRobo = normalizarHora(horario.fim);
  const doPregao = normalizarHora(pregao.fim);
  return doRobo > doPregao ? doRobo : doPregao;
}

/** rotulosDeHora devolve x em 0..100: aqui vira 0..1, afinado para no máximo `maximo` (mantém i % ceil(n/maximo) === 0) */
export function rotulosDoCard(rotulos: ReadonlyArray<{ x: number; rotulo: string }>, maximo = MAX_ROTULOS_CARD): RotuloDoCard[] {
  if (rotulos.length === 0 || maximo < 1) return [];
  const passo = Math.ceil(rotulos.length / maximo);
  return rotulos.filter((_, i) => i % passo === 0).map((r) => ({ x: r.x / 100, texto: r.rotulo }));
}

/** a curva ainda em valores (R$), antes da régua vertical */
interface CurvaEmValores {
  fonte: CurvaDoCard["fonte"];
  legenda: string;
  linha: Array<{ x: number; v: number }>;
  faixa: Array<{ x: number; min: number; max: number }> | null;
  rotulosX: RotuloDoCard[];
  ultimoDadoT: number;
}

/**
 * Montagem da imagem do dia: textos prontos, números e a curva normalizada. null quando `operacoes` está vazio
 * (a rota responde 404 antes disso). Passo a passo no contrato de 24/09/2026 (docs/SPEC.md §8.8).
 */
export function montarCardDoDia(entrada: EntradaCardDoDia): DadosCardDoDia | null {
  const { robo, dia, agora, pregao, saldo, exposicao, disclaimer, site } = entrada;
  if (entrada.operacoes.length === 0) return null;

  // em ordem de fechamento; a ordenação do JS é estável, e data ilegível conta como empate (não embaralha)
  const ops = [...entrada.operacoes].sort((a, b) => Date.parse(a.fechamento_em) - Date.parse(b.fechamento_em) || 0);
  const n = ops.length;

  // líquido de cada operação e os totais, pela mesma regra do Hoje ao vivo e da tela cheia (gain = líquido > 0)
  const liquidos = ops.map((o) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato);
  let resultado = 0;
  let pontos = 0;
  let nGains = 0;
  for (let i = 0; i < n; i++) {
    resultado += liquidos[i];
    pontos += ops[i].pontos_por_contrato;
    if (liquidos[i] > 0) nGains += 1;
  }

  const horario = horarioDaJanela(robo, pregao);
  const fechamentos = fechamentosDasOperacoes(ops);
  const ultimoFechamentoT = fechamentos.length > 0 ? fechamentos[fechamentos.length - 1][0] : Number.NaN;
  // Dia sem horário: importação manual (o histórico antigo não tem hora de verdade) ou todas as operações no
  // mesmo instante. O eixo vira a ordem das operações ("1ª", "31ª"...), como no calendário.
  const semHorario = ops.every((o) => o.origem === "manual") || (n > 1 && new Set(ops.map((o) => o.fechamento_em)).size === 1);

  // Dia em andamento (a imagem sai "Parcial"): o dia é hoje e ainda não passou o mais tarde entre o fim do horário
  // do robô e o do pregão do ativo, ou o robô ainda está posicionado (24/09/2026, revisão: às 18:00:00,1 de 23/09
  // o Apollo saía definitivo com +R$ 1.176,50 em 66 operações; a zeragem, gravada décimos de segundo depois, fechou
  // o dia em +R$ 1.131,00 com 68). Posição presa depois do fim (coletor parou posicionado) deixa a imagem de hoje
  // parcial até a meia-noite, o que é verdade: o dia não fechou.
  const a = agoraSP(agora);
  const fim = fimDoDia(horario, pregao);
  const emAndamento = a.dia === dia && (a.hhmm < fim || robo.posicionado === true);

  // O corte da série ao pregão. Definitiva: o mesmo do site (horário do robô, esticado até a última saída, mais
  // dez minutos). Em andamento: até o fim do dia (fimDoDia), senão entre o fim do horário do robô + 10 min e a
  // zeragem a linha e o selo congelavam no último corte e a posição aberta sumia da imagem (em 32 dos 58 dias MT5
  // do Apollo houve saída depois de 17:40). O eixo (janelaDoDia) continua no horário do robô, esticado pelos dados.
  // A curva ao vivo do site (CurvaDoDia, Hoje ao vivo e tela cheia) tem o mesmo congelamento, pelo mesmo
  // baldesDoPregao com o horário do robô: fica para uma tarefa separada (24/09/2026).
  const corte: HorarioPregao = emAndamento ? { inicio: horario.inicio, fim } : horario;

  const emValores: CurvaEmValores =
    saldo.baldes.length > 0 && !semHorario
      ? curvaDaSerie(entrada, horario, corte, fechamentos, ultimoFechamentoT)
      : curvaPorFechamento(ops, liquidos, semHorario, ultimoFechamentoT);

  // régua vertical: o zero sempre dentro, e 8% de folga em cima e embaixo para a bolinha e o traço não cortarem
  let menor = 0;
  let maior = 0;
  const considerar = (v: number) => {
    if (v < menor) menor = v;
    if (v > maior) maior = v;
  };
  for (const p of emValores.linha) considerar(p.v);
  for (const f of emValores.faixa ?? []) {
    considerar(f.min);
    considerar(f.max);
  }
  const folga = (maior - menor) * 0.08 || 1;
  const topo = maior + folga;
  const base = menor - folga;
  const y = (v: number) => (topo - v) / (topo - base);

  const ultimoPonto = emValores.linha[emValores.linha.length - 1];
  const curva: CurvaDoCard = {
    fonte: emValores.fonte,
    legenda: emValores.legenda,
    linha: emValores.linha.map((p) => ({ x: p.x, y: y(p.v) })),
    faixa: emValores.faixa ? emValores.faixa.map((f) => ({ x: f.x, yAlto: y(f.max), yBaixo: y(f.min) })) : null,
    yZero: y(0),
    rotulosX: emValores.rotulosX,
    tomFinal: tomDoValor(ultimoPonto ? ultimoPonto.v : 0),
  };

  // Parcial: o selo diz até que hora a imagem vai, a do último dado (último balde do corte ou última saída)
  const ultimoDadoT = emValores.ultimoDadoT;
  const parcial =
    emAndamento
      ? Number.isFinite(ultimoDadoT)
        ? `Parcial · até ${formatarHora(new Date(ultimoDadoT * 1000))}`
        : "Parcial"
      : null;

  // MEP e MEN: os medidos pelo EA, líquidos como o Hoje ao vivo mostra; sem medição, por fechamento
  const ea = mepMenDoDia(exposicao, robo.custo_por_contrato, robo.valor_ponto_brl, "liquido", "brl");
  let mep: number;
  let men: number;
  let fonteMepMen: DadosCardDoDia["fonteMepMen"];
  let notaMepMen: string;
  if (ea) {
    mep = ea.mep;
    men = ea.men;
    fonteMepMen = "mt5";
    notaMepMen = ea.parcial ? "MEP e MEN medidos no MT5 desde que o coletor ligou" : "MEP e MEN medidos no MT5, tick a tick";
  } else {
    const e = excursao(liquidos);
    mep = e.mep;
    men = e.men;
    fonteMepMen = "fechamento";
    notaMepMen = "MEP e MEN por fechamento de operação";
  }

  return {
    nome: robo.nome,
    ativo: robo.ativo_nome ? `${robo.ativo_nome} · ${robo.ativo}` : robo.ativo,
    data: dataPorExtenso(dia),
    contaDemo: robo.conta_tipo === "demo",
    parcial,
    rotuloResultado: parcial ? "Resultado parcial, por contrato" : "Resultado do dia, por contrato",
    resultado: formatarBRL(resultado, { sinal: true }),
    tomResultado: tomDoValor(resultado),
    pontos: `${formatarPontos(pontos, true)} pts`,
    numeros: [
      { rotulo: n === 1 ? "operação" : "operações", valor: formatarNumero(n), tom: null },
      { rotulo: `acerto · ${formatarNumero(nGains)} ${nGains === 1 ? "gain" : "gains"}`, valor: formatarPct(nGains / n, 0), tom: null },
      { rotulo: "MEP", valor: brlCurto(mep), tom: tomDoValor(mep) },
      { rotulo: "MEN", valor: brlCurto(men), tom: tomDoValor(men) },
    ],
    fonteMepMen,
    notaMepMen,
    curva,
    rodape: `Por 1 contrato, líquido de custos · ${enderecoCurto(site)}/robos/${robo.slug}`,
    legal: fraseLegalCurta(disclaimer),
    valores: { resultado, pontos, nOperacoes: n, nGains, mep, men, ultimoDadoT },
  };
}

/**
 * A curva pela série do EA 1.1.2, igual à do Hoje ao vivo (CurvaDoDia no modo série): só os baldes do pregão
 * (`corte`: o horário do robô na imagem definitiva, até o fim do dia na parcial), líquida dos custos de cada
 * fechamento, reduzida a PONTOS_CARD grupos. A linha nasce no primeiro grupo, sem rampa desde o zero (o coletor que
 * ligou com o dia em andamento não inventa um trecho que ninguém mediu; a legenda diz "desde HH:MM"). A faixa
 * mín./máx. só quando a série não é aproximada.
 */
function curvaDaSerie(
  entrada: EntradaCardDoDia,
  horario: HorarioPregao,
  corte: HorarioPregao,
  fechamentos: readonly FechamentoCompacto[],
  ultimoFechamentoT: number,
): CurvaEmValores {
  const { robo, dia, saldo } = entrada;
  const bucketSeg = inferirBucketSeg(saldo.baldes);
  const baldes = baldesDoPregao(saldo.baldes, dia, corte, fechamentos);
  const janela = janelaDoDia(dia, horario, baldes, bucketSeg, fechamentos);
  const liquida = liquidarSerie(baldes, fechamentos, bucketSeg, { base: "liquido", unidade: "brl", valorPonto: robo.valor_ponto_brl });
  const grupos = reduzirBaldes(liquida, PONTOS_CARD);
  let ultimoBaldeT = Number.NEGATIVE_INFINITY;
  for (const b of baldes) if (b[0] > ultimoBaldeT) ultimoBaldeT = b[0];
  const legenda = legendaCurtaDoSaldo({ bucketSeg, aproximado: saldo.aproximado, medidoDesdeT: inicioDaMedicao(liquida, fechamentos, janela.inicio) });
  return {
    fonte: "serie",
    legenda: `O dia, medido no MT5 · ${legenda} · líquido`,
    linha: grupos.map((g) => ({ x: posicaoNaJanela(g[5], janela), v: g[3] })),
    faixa: saldo.aproximado ? null : grupos.map((g) => ({ x: posicaoNaJanela(g[5], janela), min: g[1], max: g[2] })),
    rotulosX: rotulosDoCard(rotulosDeHora(janela)),
    // o último dado é o maior entre o início do último balde (já cortado ao pregão) e a última saída
    ultimoDadoT: Number.isFinite(ultimoFechamentoT) ? Math.max(ultimoBaldeT, ultimoFechamentoT) : ultimoBaldeT,
  };
}

/**
 * A curva por fechamento (acumulado líquido operação a operação), como CurvaDoDia sem série: nasce no zero e dá um
 * degrau por operação, em (i + 1) / n. O eixo de baixo diz a hora da operação; no dia sem horário (importação
 * manual), a ordem dela, como o calendário.
 *
 * Cada rótulo fica EM CIMA do ponto que ele nomeia (24/09/2026, revisão): a j-ésima operação (contando de 1) está
 * em x = j/n, e o rótulo k vai nela com j = round((k + 1)·n/quantas), até a última em x = 1. A regra antiga (a de
 * CurvaDoDia e do calendário) punha o rótulo em k/quantas com a operação floor(k·n/quantas) + 1, uma operação à
 * esquerda: no dia manual do Alaska de 11/09, com 3 operações, "1ª" caía sob o zero e a 3ª ficava sem rótulo. O
 * site continua com a regra antiga: lá o rótulo em x = 100% sairia pela borda (CurvaProfit centraliza o texto no
 * ponto), então a troca fica para uma tarefa própria; aqui a caixa do rótulo já é presa às bordas no desenho.
 */
function curvaPorFechamento(
  ops: readonly OperacaoDoCard[],
  liquidos: readonly number[],
  semHorario: boolean,
  ultimoFechamentoT: number,
): CurvaEmValores {
  const n = ops.length;
  const linha: Array<{ x: number; v: number }> = [{ x: 0, v: 0 }];
  let acumulado = 0;
  for (let i = 0; i < n; i++) {
    acumulado += liquidos[i];
    linha.push({ x: (i + 1) / n, v: acumulado });
  }
  const quantas = Math.min(MAX_ROTULOS_CARD, n);
  const marcas: RotuloDoCard[] = Array.from({ length: quantas }, (_, k) => {
    const j = Math.min(n, Math.max(1, Math.round(((k + 1) * n) / quantas)));
    return { x: j / n, texto: semHorario ? `${formatarNumero(j)}ª` : formatarHora(ops[j - 1].fechamento_em) };
  });
  return {
    fonte: "fechamento",
    legenda: semHorario ? "O dia, operação a operação · histórico importado, sem horário" : "O dia, operação a operação · por fechamento",
    linha,
    faixa: null,
    rotulosX: marcas.filter((m, i) => i === 0 || m.texto !== marcas[i - 1].texto),
    ultimoDadoT: ultimoFechamentoT,
  };
}

export interface CaixaDaCurva {
  largura: number;
  altura: number;
  /** padrão 12: a bolinha e o traço não cortam na borda */
  margem?: number;
}

/** tudo em px da caixa; x dos rótulos = centro */
export interface CaminhosDaCurva {
  linha: string;
  area: string;
  faixa: string | null;
  yZero: number;
  ultimo: { x: number; y: number };
  rotulosX: RotuloDoCard[];
}

/**
 * A curva normalizada em caminhos SVG na caixa pedida (px), com uma casa decimal: a linha, a área até o zero, a
 * faixa mín./máx. (ida pelos máximos, volta pelos mínimos) e onde fica a bolinha do fim. A imagem só desenha.
 */
export function caminhosDaCurva(curva: CurvaDoCard, caixa: CaixaDaCurva): CaminhosDaCurva {
  const m = caixa.margem ?? 12;
  const px = (x: number) => m + x * (caixa.largura - 2 * m);
  const py = (y: number) => m + y * (caixa.altura - 2 * m);
  const f = (v: number) => v.toFixed(1);
  const zero = py(curva.yZero);
  const pontos = curva.linha;

  const linha = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${f(px(p.x))},${f(py(p.y))}`).join("");
  const area =
    pontos.length > 0
      ? `M${f(px(pontos[0].x))},${f(zero)}${pontos.map((p) => `L${f(px(p.x))},${f(py(p.y))}`).join("")}L${f(px(pontos[pontos.length - 1].x))},${f(zero)}Z`
      : "";
  const faixa =
    curva.faixa && curva.faixa.length > 0
      ? `${curva.faixa.map((p, i) => `${i === 0 ? "M" : "L"}${f(px(p.x))},${f(py(p.yAlto))}`).join("")}${[...curva.faixa]
          .reverse()
          .map((p) => `L${f(px(p.x))},${f(py(p.yBaixo))}`)
          .join("")}Z`
      : null;
  const fimDaLinha = pontos[pontos.length - 1];
  return {
    linha,
    area,
    faixa,
    yZero: zero,
    ultimo: fimDaLinha ? { x: px(fimDaLinha.x), y: py(fimDaLinha.y) } : { x: m, y: zero },
    rotulosX: curva.rotulosX.map((r) => ({ x: px(r.x), texto: r.texto })),
  };
}
