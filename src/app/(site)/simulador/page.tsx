import type { Metadata } from "next";
import { Suspense } from "react";
import { PainelSimulador } from "@/components/simulador/PainelSimulador";
import { TEXTO_FIXO_SIMULADOR } from "@/components/simulador/Semaforo";
import { CabecalhoPagina, CorpoPagina, Grade } from "@/components/sistema/Pagina";
import { Skeleton } from "@/components/ui/skeleton";
import { carregarParametros, listarEstatisticas, listarMercado, listarRobos } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";
import { ordenarPorDia, valorDia } from "@/lib/stats/serie";
import { capitalMinimoDoRobo, type DiaLiquido, type RoboSimulador } from "@/lib/stats/simulador";
import type { EstatisticaPublica } from "@/lib/tipos";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Simular meu capital",
  description:
    "O histórico dos robôs aplicado ao seu capital e aos seus contratos: resultado, maior queda e capital mínimo. Aritmética sobre o histórico; não é recomendação nem projeção de resultado.",
};

/** O que aparece enquanto o painel não hidrata: o lugar dos campos à esquerda e o do número e da curva à direita. */
function Esqueleto() {
  return (
    <Grade>
      <div className="space-y-8 xl:col-span-4">
        <Skeleton className="h-11 w-full max-w-sm" />
        <Skeleton className="h-44 w-full" />
      </div>
      <div className="space-y-8 xl:col-span-8">
        <Skeleton className="h-16 w-72 max-w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </Grade>
  );
}

/**
 * Simulador "com o meu capital" (spec §8.6, 23/09/2026). O servidor monta, por robô, a série diária
 * inteira em R$ líquido por 1 contrato (a mesma conta das outras páginas: valorDia com base líquida) e o
 * capital mínimo por contrato pela regra já publicada na aba Quedas e risco; o resto é aritmética no
 * navegador. A página NÃO lê searchParams: capital, contratos e período moram na URL, mas quem lê é o painel
 * (useSearchParams, dentro de Suspense como na aba Desempenho), para a rota continuar estática com
 * ISR de 60 s. Nada de robô fixo: a lista vem de listarRobos(), sem os arquivados e sem série vazia,
 * como no Comparativo. O aviso legal não se repete aqui: o rodapé o traz em toda página (17/09/2026).
 *
 * 25/11/2026 (ficha Mesa): o título é o nome da área na barra lateral, e debaixo dele vai só o texto fixo
 * de compliance, uma vez. O caminho de volta é a barra lateral; o "Início" solto no topo saiu.
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
      // R$ líquido por 1 contrato SEM arredondar: o banco guarda 4 casas e a aba Quedas e risco não arredonda,
      // então o capital mínimo por contrato bate com o dela em R$ inteiros; a soma do dia da carteira é que sai
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
        // a regra da aba Quedas e risco: margem + maior queda de todo o histórico × fator, no inteiro publicado; null sem margem
        capitalMinimoPorContrato: capitalMinimoDoRobo(dias, margem, parametros.fatorSeguranca),
      };
    })
    .filter((r) => r.dias.length > 0);

  return (
    <>
      <CabecalhoPagina titulo="Simular meu capital" descricao={TEXTO_FIXO_SIMULADOR} />
      <CorpoPagina>
        {robosSim.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum robô com operações fechadas ainda.</p>
        ) : (
          // useSearchParams no cliente exige Suspense numa página estática (como desempenho/page.tsx)
          <Suspense fallback={<Esqueleto />}>
            <PainelSimulador robos={robosSim} hoje={hoje} fatorSeguranca={parametros.fatorSeguranca} />
          </Suspense>
        )}
      </CorpoPagina>
    </>
  );
}
