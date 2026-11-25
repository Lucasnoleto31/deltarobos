import { cache } from "react";
import { horarioGeral } from "@/components/home/datas";
import type { DadosCardRobo, UltimoPregao, UltimoPregaoCasa } from "@/components/home/tipos";
import {
  carregarParametros,
  listarEstatisticas,
  listarFeriados,
  listarMercado,
  listarRobos,
  resumoCasaHoje,
} from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";
import { pregaoAberto } from "@/lib/stats/pregao";
import { resumirCardRobo } from "@/lib/stats/resumo-robo";
import { valorDia } from "@/lib/stats/serie";
import type { OpcoesSerie } from "@/lib/stats/tipos";
import type { EstatisticaPublica, EventoColeta } from "@/lib/tipos";

/**
 * Último dia com operação até hoje, inclusive. Fora do pregão, sem operação hoje, a home mostra esse
 * dia com a data no rótulo em vez de uma tela inteira de zeros (19/09/2026). Hoje entra na busca porque
 * a página pode ter sido montada num dia e lida no seguinte (ISR, aba aberta de um dia para o outro).
 */
function ultimoPregaoDoRobo(linhas: readonly EstatisticaPublica[], o: OpcoesSerie, hoje: string): UltimoPregao | null {
  let dia: string | null = null;
  for (const l of linhas) {
    if (l.dia <= hoje && l.n_operacoes > 0 && (dia === null || l.dia > dia)) dia = l.dia;
  }
  if (dia === null) return null;
  const doDia = linhas.filter((l) => l.dia === dia);
  return {
    dia,
    valor: doDia.reduce((s, l) => s + valorDia(l, o), 0),
    nOperacoes: doDia.reduce((s, l) => s + l.n_operacoes, 0),
    nGain: doDia.reduce((s, l) => s + l.n_gain, 0),
  };
}

/** O dia mais recente entre os últimos pregões dos robôs, somando quem operou nele. */
function ultimoPregaoDaCasa(cards: readonly DadosCardRobo[]): UltimoPregaoCasa | null {
  let dia: string | null = null;
  for (const c of cards) {
    if (c.ultimoPregao && (dia === null || c.ultimoPregao.dia > dia)) dia = c.ultimoPregao.dia;
  }
  if (dia === null) return null;
  const total: UltimoPregaoCasa = { dia, valor: 0, nOperacoes: 0, nGain: 0, melhor: null };
  for (const c of cards) {
    const u = c.ultimoPregao;
    if (!u || u.dia !== dia) continue;
    total.valor += u.valor;
    total.nOperacoes += u.nOperacoes;
    total.nGain += u.nGain;
    if (total.melhor === null || u.valor > total.melhor.valor) total.melhor = { nome: c.nome, valor: u.valor };
  }
  return total;
}

/** Resultado da casa em cada pregão (soma dos robôs, por 1 contrato, líquido), do mais antigo ao mais novo. */
export interface DiaDaCasa {
  dia: string;
  valor: number;
  nOperacoes: number;
}

/** Um pregão de um robô: resultado (R$, 1 contrato, já com custos), operações fechadas e quantas com ganho. */
export interface DiaDoRobo {
  dia: string;
  valor: number;
  n: number;
  g: number;
}

/** A série diária de um robô, do pregão mais antigo ao mais novo. */
export interface SerieDoRobo {
  slug: string;
  dias: DiaDoRobo[];
}

/**
 * Tudo o que a casca do sistema e a página inicial leem (25/11/2026). A casca (barra lateral com os robôs e
 * fita de mercado) existe em toda página e precisa dos mesmos números da home; com `cache`, o layout e a
 * página chamam isto no mesmo render e as consultas rodam uma vez só.
 */
export const carregarCasa = cache(async () => {
  const hoje = hojeSP();

  const [robos, estatisticas, mercado, feriados, resumo, parametros] = await Promise.all([
    listarRobos(),
    listarEstatisticas(),
    listarMercado(),
    listarFeriados(),
    resumoCasaHoje(),
    carregarParametros(),
  ]);

  const porRobo = new Map<string, EstatisticaPublica[]>();
  for (const e of estatisticas) {
    const lista = porRobo.get(e.slug) ?? [];
    lista.push(e);
    porRobo.set(e.slug, lista);
  }

  const visiveis = robos.filter((r) => r.status !== "arquivado");
  const valorPonto = new Map(visiveis.map((r) => [r.slug, r.valor_ponto_brl]));

  const cards: DadosCardRobo[] = visiveis.map((r) => {
    const linhas = porRobo.get(r.slug) ?? [];
    const opcoes: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: r.valor_ponto_brl };
    const resumoRobo = resumirCardRobo(linhas, opcoes, hoje);
    return {
      slug: r.slug,
      nome: r.nome,
      ativo: r.ativo,
      ativoNome: r.ativo_nome,
      status: r.status,
      descricao: r.descricao_publica,
      horarioInicio: r.horario_inicio,
      horarioFim: r.horario_fim,
      posicionado: r.posicionado,
      nPosicoesAbertas: r.n_posicoes_abertas,
      ultimoHeartbeatEm: r.ultimo_heartbeat_em,
      temColetor: r.tem_coletor,
      hoje: resumoRobo.hoje,
      mes: resumoRobo.mes,
      acumulado: resumoRobo.acumulado,
      drawdownMaximo: resumoRobo.drawdownMaximo,
      sparkline: resumoRobo.sparkline,
      nDias: resumoRobo.nDias,
      contaRealDesde: r.conta_real_desde,
      ultimoPregao: ultimoPregaoDoRobo(linhas, opcoes, hoje),
    };
  });

  const coleta: Record<string, EventoColeta> = Object.fromEntries(
    robos.map((r) => [
      r.slug,
      {
        slug: r.slug,
        ultimo_heartbeat_em: r.ultimo_heartbeat_em,
        posicionado: r.posicionado,
        n_posicoes_abertas: r.n_posicoes_abertas,
      },
    ]),
  );

  // a casa dia a dia: soma dos robôs visíveis, cada um com o próprio valor do ponto
  const porDia = new Map<string, DiaDaCasa>();
  for (const e of estatisticas) {
    const vp = valorPonto.get(e.slug);
    if (vp === undefined || e.dia > hoje) continue;
    const d = porDia.get(e.dia) ?? { dia: e.dia, valor: 0, nOperacoes: 0 };
    d.valor += valorDia(e, { base: "liquido", unidade: "brl", valorPonto: vp });
    d.nOperacoes += e.n_operacoes;
    porDia.set(e.dia, d);
  }
  const dias = [...porDia.values()].sort((a, b) => (a.dia < b.dia ? -1 : 1));

  // cada robô dia a dia, para a página inicial desenhar a curva do robô escolhido e a de todos somados
  const series: SerieDoRobo[] = visiveis.map((r) => {
    const opcoes: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: r.valor_ponto_brl };
    const porDiaDoRobo = new Map<string, DiaDoRobo>();
    for (const e of porRobo.get(r.slug) ?? []) {
      if (e.dia > hoje) continue;
      const d = porDiaDoRobo.get(e.dia) ?? { dia: e.dia, valor: 0, n: 0, g: 0 };
      d.valor += valorDia(e, opcoes);
      d.n += e.n_operacoes;
      d.g += e.n_gain;
      porDiaDoRobo.set(e.dia, d);
    }
    return {
      slug: r.slug,
      dias: [...porDiaDoRobo.values()]
        .sort((a, b) => (a.dia < b.dia ? -1 : 1))
        // centavos bastam: o número vai inteiro para o navegador
        .map((d) => ({ ...d, valor: Math.round(d.valor * 100) / 100 })),
    };
  });

  return {
    hoje,
    robos,
    estatisticas,
    mercado,
    feriados,
    resumo,
    parametros,
    cards,
    coleta,
    dias,
    series,
    ultimoPregao: ultimoPregaoDaCasa(cards),
    pregaoAbertoNoServidor: pregaoAberto(new Date(), horarioGeral(mercado), feriados),
  };
});
