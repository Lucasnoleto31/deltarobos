import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AbasRobo } from "@/components/robo/AbasRobo";
import { CabecalhoRobo } from "@/components/robo/CabecalhoRobo";
import { RoboAoVivoProvider } from "@/components/robo/RoboAoVivoProvider";
import {
  buscarRobo,
  listarFeriados,
  listarMercado,
  listarOperacoesDoDia,
  listarPosicoes,
} from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";

// Slug novo cadastrado no banco funciona sem deploy: nada de lista fixa.
export const revalidate = 60;
export const dynamicParams = true;

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo) return { title: "Robô não encontrado" };
  const descricao =
    robo.descricao_publica ??
    `Performance ao vivo do robô ${robo.nome} (${robo.ativo_nome}), direto do MetaTrader 5.`;
  return {
    title: robo.nome,
    description: descricao,
    openGraph: {
      title: `${robo.nome} · Delta Robôs`,
      description: descricao,
      images: [{ url: `/api/og/${slug}`, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image" },
  };
}

/** Cabeçalho, status ao vivo e abas compartilhados por todas as páginas do robô. */
export default async function LayoutRobo({ children, params }: Props) {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo) notFound();

  const hoje = hojeSP();
  const [operacoes, posicoes, feriados, mercado] = await Promise.all([
    listarOperacoesDoDia(slug, hoje),
    listarPosicoes(slug),
    listarFeriados(),
    listarMercado(),
  ]);

  const mercadoDoAtivo = mercado.find((m) => m.prefixo_simbolo === robo.ativo);
  const pregao = mercadoDoAtivo
    ? { inicio: mercadoDoAtivo.pregao_inicio, fim: mercadoDoAtivo.pregao_fim }
    : { inicio: "09:00", fim: "18:00" };

  return (
    <article className="conteudo space-y-6 py-8">
      <RoboAoVivoProvider
        robo={robo}
        inicial={{ operacoes, posicoes, ultimoHeartbeatEm: robo.ultimo_heartbeat_em, dia: hoje }}
        pregao={pregao}
        feriados={feriados}
      >
        <CabecalhoRobo />
        <AbasRobo slug={slug} />
        {children}
      </RoboAoVivoProvider>
    </article>
  );
}
