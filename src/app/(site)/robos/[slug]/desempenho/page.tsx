import type { Metadata } from "next";
import { Suspense } from "react";
import { empacotar, soLinhaDiaria } from "@/components/compartilhados/ops-codec";
import { PainelDesempenho } from "@/components/desempenho/PainelDesempenho";
import { Skeleton } from "@/components/ui/skeleton";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Desempenho` : "Desempenho" };
}

/**
 * O esqueleto da aba, na forma que ela tem desde a ficha Mesa (25/11/2026): a linha de título com os filtros,
 * o número grande com os fatos ao lado e a curva na largura toda. Sem caixas, como a tela. Eram quatro
 * cartões e um painel.
 */
function Carregando() {
  return (
    <div aria-busy aria-label="Carregando o desempenho">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-4 w-[34rem] max-w-full" />
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-16 gap-y-6">
        <div className="space-y-3">
          <Skeleton className="h-14 w-72 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="w-full max-w-[22rem] space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
      <Skeleton className="mt-8 h-[360px] w-full" />
    </div>
  );
}

/**
 * Aba Desempenho (ficha Mesa, 25/11/2026): em que períodos o robô ganha e em que períodos perde. O layout do
 * robô já põe o cabeçalho, as abas e as margens; aqui só se buscam os dados, e o PainelDesempenho devolve as
 * seções. Os filtros (período, unidade, custos, contratos) valem para a tela toda e moram na URL.
 */
export default async function PaginaDesempenho({ params }: Props) {
  const { slug } = await params;
  const hoje = hojeSP();
  // 19/09/2026: feriados, margem e fator de segurança saíram com a seção de risco (está na aba Risco)
  const [robo, linhas, ops] = await Promise.all([buscarRobo(slug), listarEstatisticas(slug), listarOperacoesCompactas(slug)]);
  if (!robo) return null;

  return (
    <Suspense fallback={<Carregando />}>
      <PainelDesempenho
        slug={slug}
        linhas={soLinhaDiaria(linhas)}
        pacote={empacotar(ops)}
        hoje={hoje}
        valorPonto={robo.valor_ponto_brl}
        capitalReferencia={robo.capital_referencia}
        // o ativo do cadastro: junta os códigos de contrato (WINQ26, WINV26…) num ativo só em "por ativo"
        ativo={robo.ativo}
        ativoNome={robo.ativo_nome}
      />
    </Suspense>
  );
}
