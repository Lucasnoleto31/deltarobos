import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardEmbed } from "@/components/embed/CardEmbed";
import { ForcarTema } from "@/components/embed/ForcarTema";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
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

/** Widget leve pra iframe (spec §8.8). ?tema=claro|escuro. Sem realtime: cache de 60s. */
export default async function PaginaEmbed({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const robo = await buscarRobo(slug);
  if (!robo) notFound();

  const hoje = hojeSP();
  const linhas = await listarEstatisticas(slug);
  const resumo = resumirCardRobo(linhas, { base: "liquido", unidade: "brl", valorPonto: robo.valor_ponto_brl }, hoje);
  const tema = (Array.isArray(sp.tema) ? sp.tema[0] : sp.tema) === "claro" ? "claro" : "escuro";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <div className="p-3">
      <ForcarTema tema={tema} />
      <CardEmbed robo={robo} resumo={resumo} hoje={hoje} linkSite={`${site}/robos/${slug}`} />
    </div>
  );
}
