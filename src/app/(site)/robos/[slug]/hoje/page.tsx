import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HojeAoVivo, type UltimoPregao } from "@/components/robo/HojeAoVivo";
import { buscarRobo, listarExposicaoDia, listarOperacoesDoDia, listarUltimasOperacoes } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Ao vivo` : "Ao vivo" };
}

/**
 * Aba "Ao vivo" do robô (revisão de 25/11/2026, DESIGN.md seção 9): o que ele está fazendo agora. O estado ao
 * vivo de hoje (operações, posição aberta, medições) já vem do layout, pelo RoboAoVivoProvider; aqui só se
 * busca o último pregão com operação antes de hoje, que a tela mostra, com a data, enquanto hoje não tem o que
 * mostrar (antes da primeira operação, no fim de semana, no feriado).
 *
 * Só existe para robô com coletor: o robô que só tem histórico importado não tem dia ao vivo, a aba não
 * aparece para ele e o endereço responde 404. A tela cheia (/robos/[slug]/ao-vivo) continua existindo e abre
 * por um link daqui.
 */
export default async function PaginaHoje({ params }: Props) {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo || !robo.tem_coletor) notFound();

  const hoje = hojeSP();
  // A operação mais recente diz qual foi o último pregão. Se ela é de hoje, hoje já tem o que mostrar e o
  // pregão anterior não é preciso.
  const [ultima] = await listarUltimasOperacoes(slug, 1);
  let ultimoPregao: UltimoPregao | null = null;
  if (ultima && ultima.dia_pregao < hoje) {
    const dia = ultima.dia_pregao;
    const [operacoes, exposicao] = await Promise.all([listarOperacoesDoDia(slug, dia), listarExposicaoDia(slug, { dia })]);
    if (operacoes.length > 0) ultimoPregao = { dia, operacoes, exposicao: exposicao[0] ?? null };
  }

  return <HojeAoVivo ultimoPregao={ultimoPregao} />;
}
