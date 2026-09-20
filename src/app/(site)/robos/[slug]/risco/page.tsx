import type { Metadata } from "next";
import { calcularPorPeriodo } from "@/components/robo/ops-por-periodo";
import { PainelRisco } from "@/components/risco/PainelRisco";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo, carregarParametros, listarEstatisticas, listarMercado } from "@/lib/consultas/publico";
import { resumoOperacoes } from "@/lib/stats/operacoes";
import { hojeSP } from "@/lib/stats/periodos";
import type { LinhaDiaria } from "@/lib/stats/tipos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Risco` : "Risco" };
}

/** Aba Risco: drawdown e capital, Calmar, recovery factor, Ulcer, risco de ruína, curva de drawdown, maiores drawdowns. */
export default async function PaginaRisco({ params }: Props) {
  const { slug } = await params;
  const hoje = hojeSP();
  const [robo, linhas, ops, mercado, parametros] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    listarOperacoesCompactas(slug),
    listarMercado(),
    carregarParametros(),
  ]);
  if (!robo) return null;

  const margem = mercado.find((m) => m.prefixo_simbolo === robo.ativo)?.margem_referencia ?? null;

  // 18/09/2026: das operações o painel só usava a perda média (risco de ruína), por período; ela
  // sai pronta daqui e as ~15 mil operações (~700 KB no HTML) não vão mais ao navegador
  const opcoes = { base: "liquido", unidade: "brl", valorPonto: robo.valor_ponto_brl } as const;
  const perdaMedia = calcularPorPeriodo(ops, hoje, (opsP) => resumoOperacoes(opsP, opcoes).mediaLoss);

  // só os campos de LinhaDiaria: robo_id, slug e atualizado_em de cada dia não são lidos no cliente
  const linhasDiarias: LinhaDiaria[] = linhas.map((l) => ({
    dia: l.dia,
    pontos_por_contrato: l.pontos_por_contrato,
    resultado_brl_por_contrato: l.resultado_brl_por_contrato,
    custos_brl_por_contrato: l.custos_brl_por_contrato,
    n_operacoes: l.n_operacoes,
    n_gain: l.n_gain,
    n_loss: l.n_loss,
    soma_gain_brl_por_contrato: l.soma_gain_brl_por_contrato,
    soma_loss_brl_por_contrato: l.soma_loss_brl_por_contrato,
    maior_gain_brl_por_contrato: l.maior_gain_brl_por_contrato,
    maior_loss_brl_por_contrato: l.maior_loss_brl_por_contrato,
  }));

  return (
    <PainelRisco
      linhas={linhasDiarias}
      perdaMedia={perdaMedia}
      hoje={hoje}
      valorPonto={robo.valor_ponto_brl}
      capitalReferencia={robo.capital_referencia}
      margem={margem}
      fatorSeguranca={parametros.fatorSeguranca}
    />
  );
}
