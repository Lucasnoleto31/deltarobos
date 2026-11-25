import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardEmbed } from "@/components/embed/CardEmbed";
import { ForcarTema } from "@/components/embed/ForcarTema";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { tempoDeHistorico } from "@/lib/stats/card-do-dia";
import { hojeSP } from "@/lib/stats/periodos";
import { resumirCardRobo } from "@/lib/stats/resumo-robo";

export const revalidate = 60;
export const dynamicParams = true;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Embed` : "Embed", robots: { index: false } };
}

/**
 * Widget leve para iframe (spec §8.8). ?tema=claro|escuro. Sem tempo real: cache de 60 s. Sem caixa em volta
 * do conteúdo (ficha Mesa, 25/11/2026): quem delimita o widget é o próprio iframe, e o fundo é o do tema.
 */
export default async function PaginaEmbed({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const robo = await buscarRobo(slug);
  if (!robo) notFound();

  const hoje = hojeSP();
  const linhas = await listarEstatisticas(slug);
  const opcoes = { base: "liquido" as const, unidade: "brl" as const, valorPonto: robo.valor_ponto_brl };
  // A mesma regra da aba Dia a dia: só o robô com coletor e ativo é acompanhado dia a dia. Nos outros o site só sabe
  // até o último dia com operação, e os "30 dias" do widget terminam nele, não hoje (revisão de 25/11/2026: o robô
  // de histórico importado aparecia com "Hoje: sem operação" e com a data de hoje em dados que terminavam antes).
  const acompanhado = robo.tem_coletor && robo.status === "ativo";
  const ateHoje = resumirCardRobo(linhas, opcoes, hoje);
  const resumo = !acompanhado && ateHoje.ultimoDia ? resumirCardRobo(linhas, opcoes, ateHoje.ultimoDia) : ateHoje;
  const tema = (Array.isArray(sp.tema) ? sp.tema[0] : sp.tema) === "claro" ? "claro" : "escuro";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <div className="p-4">
      <ForcarTema tema={tema} />
      <CardEmbed
        robo={robo}
        resumo={resumo}
        hoje={hoje}
        acompanhado={acompanhado}
        linkSite={`${site}/robos/${slug}`}
        historico={tempoDeHistorico(linhas, hoje)?.texto ?? null}
      />
    </div>
  );
}
