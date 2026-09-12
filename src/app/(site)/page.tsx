import type { Metadata } from "next";
import { BarraAoVivo } from "@/components/home/BarraAoVivo";
import { CasaAoVivoProvider } from "@/components/home/CasaAoVivoProvider";
import { ComoComecar } from "@/components/home/ComoComecar";
import { Comunidade } from "@/components/home/Comunidade";
import { Ecossistema } from "@/components/home/Ecossistema";
import { GradeRobos } from "@/components/home/GradeRobos";
import { Hero } from "@/components/home/Hero";
import { ResumoDoDia } from "@/components/home/ResumoDoDia";
import type { DadosCardRobo } from "@/components/home/tipos";
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
import { resumirCardRobo } from "@/lib/stats/resumo-robo";
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
      const resumoRobo = resumirCardRobo(
        porRobo.get(r.slug) ?? [],
        { base: "liquido", unidade: "brl", valorPonto: r.valor_ponto_brl },
        hoje,
      );
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
      };
    });

  const coleta: Record<string, EventoColeta> = Object.fromEntries(
    robos.map((r) => [
      r.slug,
      { slug: r.slug, ultimo_heartbeat_em: r.ultimo_heartbeat_em, posicionado: r.posicionado },
    ]),
  );

  return (
    <CasaAoVivoProvider inicial={{ resumo, mercado, coleta }} feriados={feriados} hoje={hoje}>
      <BarraAoVivo />
      <Hero textos={parametros.textos} links={parametros.links} />
      <GradeRobos cards={cards} />
      <ResumoDoDia />
      <Comunidade links={parametros.links} videos={videos} />
      <Ecossistema links={parametros.links} />
      <ComoComecar links={parametros.links} />
      <TransparenciaFaq textos={parametros.textos} />
    </CasaAoVivoProvider>
  );
}
