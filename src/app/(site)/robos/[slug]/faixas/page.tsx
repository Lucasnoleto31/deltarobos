import type { Metadata } from "next";
import { PainelFaixas } from "@/components/faixas/PainelFaixas";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Faixas` : "Faixas" };
}

/** Aba Faixas: validação por dia da semana × hora de entrada. */
export default async function PaginaFaixas({ params }: Props) {
  const { slug } = await params;
  const [robo, ops] = await Promise.all([buscarRobo(slug), listarOperacoesCompactas(slug)]);
  if (!robo) return null;
  return <PainelFaixas ops={ops} hoje={hojeSP()} />;
}
