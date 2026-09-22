import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TelaAoVivo } from "@/components/ao-vivo/TelaAoVivo";
import { RoboAoVivoProvider } from "@/components/robo/RoboAoVivoProvider";
import {
  buscarRobo,
  listarExposicaoDia,
  listarFeriados,
  listarMercado,
  listarOperacoesDoDia,
  listarPosicoes,
  listarRobos,
} from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";
import { pregaoAberto } from "@/lib/stats/pregao";

export const revalidate = 60;
export const dynamicParams = true;

/**
 * Mesmo par do layout do robô (18/09/2026): sem generateStaticParams a rota é dinâmica e ignora o
 * revalidate. Este grupo de rotas não herda o layout de (site), então a lista se repete aqui; robô
 * cadastrado depois do deploy entra na primeira visita (dynamicParams).
 */
export async function generateStaticParams() {
  const robos = await listarRobos();
  return robos.map((r) => ({ slug: r.slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo) return { title: "Robô não encontrado" };
  return {
    title: `${robo.nome} · Ao vivo`,
    description: `Resultado do dia do ${robo.nome} em tempo real.`,
    openGraph: { images: [{ url: `/api/og/${slug}`, width: 1200, height: 630 }] },
  };
}

/** Tela cheia só com o dia: pra compartilhar e deixar aberta no celular (spec §8.4). */
export default async function PaginaAoVivo({ params }: Props) {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo) notFound();

  const hoje = hojeSP();
  const [operacoes, posicoes, feriados, mercado, exposicao] = await Promise.all([
    listarOperacoesDoDia(slug, hoje),
    listarPosicoes(slug),
    listarFeriados(),
    listarMercado(),
    // o mesmo estado inicial do layout do robô (MEP/MEN de hoje pelo EA), para o provider nascer igual
    listarExposicaoDia(slug, { dia: hoje }),
  ]);
  const m = mercado.find((x) => x.prefixo_simbolo === robo.ativo);
  const pregao = m ? { inicio: m.pregao_inicio, fim: m.pregao_fim } : { inicio: "09:00", fim: "18:00" };

  return (
    <div className="dark min-h-dvh bg-background text-foreground">
      <RoboAoVivoProvider
        robo={robo}
        inicial={{ operacoes, posicoes, ultimoHeartbeatEm: robo.ultimo_heartbeat_em, dia: hoje, exposicaoHoje: exposicao[0] ?? null }}
        pregao={pregao}
        feriados={feriados}
        pregaoAbertoNoServidor={pregaoAberto(new Date(), pregao, feriados)}
      >
        <TelaAoVivo />
      </RoboAoVivoProvider>
    </div>
  );
}
