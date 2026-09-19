import type { Metadata } from "next";
import { BarraAoVivo } from "@/components/home/BarraAoVivo";
import { CasaAoVivoProvider } from "@/components/home/CasaAoVivoProvider";
import { ComoComecar } from "@/components/home/ComoComecar";
import { Comunidade } from "@/components/home/Comunidade";
import { horarioGeral } from "@/components/home/datas";
import { Ecossistema } from "@/components/home/Ecossistema";
import { GradeRobos } from "@/components/home/GradeRobos";
import { Hero } from "@/components/home/Hero";
import { ResumoDoDia } from "@/components/home/ResumoDoDia";
import type { DadosCardRobo, UltimoPregao, UltimoPregaoCasa } from "@/components/home/tipos";
import { TransparenciaFaq } from "@/components/home/TransparenciaFaq";
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
import { ultimosVideos } from "@/lib/youtube";

// Estatísticas pesadas com cache de 60s; o painel "hoje" é realtime puro no cliente.
export const revalidate = 60;

export const metadata: Metadata = {
  openGraph: {
    title: "Delta Robôs · Performance ao vivo",
    description: "Resultado ao vivo dos robôs de day trade, direto do MetaTrader 5, por contrato.",
    images: [{ url: "/api/og/casa", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

/**
 * Último dia com operação até hoje, inclusive. Fora do pregão, sem operação hoje, a home mostra esse
 * dia com a data no rótulo em vez de uma tela inteira de zeros (19/09/2026). Hoje entra na busca porque
 * a página pode ter sido montada num dia e lida no seguinte (ISR, aba aberta de um dia para o outro):
 * com "antes de hoje", o pregão que tinha acabado de fechar era pulado. Quando hoje tem operação, o
 * resumo ao vivo também tem, e o último pregão nem aparece.
 */
function ultimoPregaoDoRobo(
  linhas: readonly EstatisticaPublica[],
  o: OpcoesSerie,
  hoje: string,
): UltimoPregao | null {
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

export default async function Home() {
  const hoje = hojeSP();

  const [robos, estatisticas, mercado, feriados, resumo, parametros] = await Promise.all([
    listarRobos(),
    listarEstatisticas(),
    listarMercado(),
    listarFeriados(),
    resumoCasaHoje(),
    carregarParametros(),
  ]);
  const videos = await ultimosVideos(parametros.links.youtube_canal_id);

  const porRobo = new Map<string, EstatisticaPublica[]>();
  for (const e of estatisticas) {
    const lista = porRobo.get(e.slug) ?? [];
    lista.push(e);
    porRobo.set(e.slug, lista);
  }

  const cards: DadosCardRobo[] = robos
    .filter((r) => r.status !== "arquivado")
    .map((r) => {
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
      { slug: r.slug, ultimo_heartbeat_em: r.ultimo_heartbeat_em, posicionado: r.posicionado },
    ]),
  );

  return (
    <CasaAoVivoProvider
      inicial={{ resumo, mercado, coleta }}
      feriados={feriados}
      hoje={hoje}
      pregaoAbertoNoServidor={pregaoAberto(new Date(), horarioGeral(mercado), feriados)}
    >
      <BarraAoVivo />
      <Hero textos={parametros.textos} links={parametros.links} ultimoPregao={ultimoPregaoDaCasa(cards)} />
      <GradeRobos cards={cards} />
      <ResumoDoDia />
      <Comunidade links={parametros.links} videos={videos} />
      <Ecossistema links={parametros.links} />
      <ComoComecar links={parametros.links} />
      <TransparenciaFaq totalOperacoes={estatisticas.reduce((s, e) => s + e.n_operacoes, 0)} />
    </CasaAoVivoProvider>
  );
}
