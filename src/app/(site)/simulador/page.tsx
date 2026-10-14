import type { Metadata } from "next";
import { Suspense } from "react";
import { SkeletonCurva, SkeletonKpis } from "@/components/compartilhados/Skeletons";
import { Voltar } from "@/components/layout/Voltar";
import { PainelSimulador } from "@/components/simulador/PainelSimulador";
import { TEXTO_FIXO_SIMULADOR } from "@/components/simulador/Semaforo";
import { carregarParametros, listarEstatisticas, listarMercado, listarRobos } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";
import { ordenarPorDia, valorDia } from "@/lib/stats/serie";
import { capitalMinimoDoRobo, type DiaLiquido, type RoboSimulador } from "@/lib/stats/simulador";
import type { EstatisticaPublica } from "@/lib/tipos";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Simulador",
  description:
    "O histórico dos robôs, por contrato, aplicado ao seu capital e aos seus contratos: resultado, drawdown e capital mínimo. Aritmética sobre o histórico; não é recomendação nem projeção de resultado.",
};

/**
 * Simulador "com o meu capital" (spec §8.6, 23/09/2026). O servidor monta, por robô, a série diária
 * inteira em R$ líquido por 1 contrato (a mesma conta das outras páginas: valorDia com base líquida) e o
 * capital mínimo por contrato pela regra já publicada na aba Risco; o resto é aritmética no navegador.
 * A página NÃO lê searchParams: capital, contratos e período moram na URL, mas quem lê é o painel
 * (useSearchParams, dentro de Suspense como na aba Desempenho), para a rota continuar estática com
 * ISR de 60 s. Nada de robô fixo: a lista vem de listarRobos(), sem os arquivados e sem série vazia,
 * como no Comparativo. O aviso legal não se repete aqui: o rodapé o traz em toda página (17/09/2026).
 */
export default async function PaginaSimulador() {
  const hoje = hojeSP();
  const [robos, estatisticas, mercado, parametros] = await Promise.all([
    listarRobos(),
    listarEstatisticas(),
    listarMercado(),
    carregarParametros(),
  ]);

  const porRobo = new Map<string, EstatisticaPublica[]>();
  for (const e of estatisticas) {
    const lista = porRobo.get(e.slug) ?? [];
    lista.push(e);
    porRobo.set(e.slug, lista);
  }

  const robosSim: RoboSimulador[] = robos
    .filter((r) => r.status !== "arquivado")
    .map((r) => {
      const opcoes = { base: "liquido", unidade: "brl", valorPonto: r.valor_ponto_brl } as const;
      // R$ líquido por 1 contrato SEM arredondar: o banco guarda 4 casas e a aba Risco não arredonda, então
      // o capital mínimo por contrato bate com o dela em R$ inteiros; a soma do dia da carteira é que sai
      // a centavos (somarCarteira)
      const dias = ordenarPorDia((porRobo.get(r.slug) ?? []).filter((l) => l.dia <= hoje)).map(
        (l): DiaLiquido => [l.dia, valorDia(l, opcoes)],
      );
      const margem = mercado.find((m) => m.prefixo_simbolo === r.ativo)?.margem_referencia ?? null;
      return {
        slug: r.slug,
        nome: r.nome,
        ativo: r.ativo,
        ativoNome: r.ativo_nome,
        contaTipo: r.conta_tipo,
        dias,
        // a regra da aba Risco: margem + drawdown máximo de todo o histórico × fator, no inteiro publicado; null sem margem
        capitalMinimoPorContrato: capitalMinimoDoRobo(dias, margem, parametros.fatorSeguranca),
      };
    })
    .filter((r) => r.dias.length > 0);

  return (
    <div className="conteudo space-y-8 py-8">
      <Voltar href="/">Início</Voltar>
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Simulador</h1>
        <p className="text-muted-foreground">O histórico dos robôs, por contrato, aplicado ao seu capital e aos seus contratos.</p>
        <p className="text-sm text-muted-foreground">{TEXTO_FIXO_SIMULADOR}</p>
      </header>

      {robosSim.length === 0 ? (
        <p className="painel px-4 py-8 text-center text-sm text-muted-foreground">Nenhum robô com operações fechadas ainda.</p>
      ) : (
        // useSearchParams no cliente exige Suspense numa página estática (como desempenho/page.tsx)
        <Suspense
          fallback={
            <div className="space-y-6">
              <SkeletonKpis quantidade={4} />
              <SkeletonCurva />
            </div>
          }
        >
          <PainelSimulador robos={robosSim} hoje={hoje} fatorSeguranca={parametros.fatorSeguranca} />
        </Suspense>
      )}
    </div>
  );
}
