import { cn } from "cn";
import type { Metadata } from "next";
import { Suspense } from "react";
import { GRADE_DO_SIMULADOR, LUGAR_DA_RESPOSTA, LUGAR_DO_CAPITAL, LUGAR_DO_RESULTADO, LUGAR_DOS_ROBOS } from "@/components/simulador/grade";
import { PainelSimulador } from "@/components/simulador/PainelSimulador";
import { TEXTO_FIXO_SIMULADOR } from "@/components/simulador/Semaforo";
import { CabecalhoPagina, CorpoPagina } from "@/components/sistema/Pagina";
import { Skeleton } from "@/components/ui/skeleton";
import { capitaisDaCasa } from "@/lib/consultas/capital";
import { carregarCasa } from "@/lib/consultas/casa";
import { ordenarPorDia, valorDia } from "@/lib/stats/serie";
import type { DiaLiquido, RoboSimulador } from "@/lib/stats/simulador";
import type { EstatisticaPublica } from "@/lib/tipos";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Simular meu capital",
  description:
    "O histórico dos robôs aplicado ao seu capital e aos seus contratos: se cabe, quanto teria ganho e quanto teria caído. Aritmética sobre o histórico; não é recomendação nem projeção de resultado.",
};

/**
 * O que aparece enquanto o painel não hidrata, na mesma grade e nos mesmos lugares dele (grade.ts), para a
 * tela não pular: o capital, a resposta, os robôs e o resultado com a curva.
 */
function Esqueleto() {
  return (
    <div className={GRADE_DO_SIMULADOR}>
      <Skeleton className={cn("h-[4.375rem]", LUGAR_DO_CAPITAL)} />
      <Skeleton className={cn("h-21 max-w-3xl", LUGAR_DA_RESPOSTA)} />
      <Skeleton className={cn("h-56", LUGAR_DOS_ROBOS)} />
      <div className={cn("space-y-8", LUGAR_DO_RESULTADO)}>
        <Skeleton className="h-16 w-72 max-w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

/**
 * Simulador "com o meu capital" (spec §8.6, 23/09/2026). O servidor monta, por robô, a série diária
 * inteira em R$ líquido por 1 contrato (a mesma conta das outras páginas: valorDia com base líquida); o
 * resto é aritmética no navegador. A página NÃO lê searchParams: capital, contratos e período moram na URL,
 * mas quem lê é o painel (useSearchParams, dentro de Suspense), para a rota continuar estática com ISR de
 * 60 s. Nada de robô fixo: a lista vem do banco, sem os arquivados e sem série vazia. O aviso legal não se
 * repete aqui: o rodapé o traz em toda página (17/09/2026).
 *
 * 25/11/2026 (ficha Mesa): o título é o nome da área na barra lateral, e debaixo dele vai só o texto fixo
 * de compliance, uma vez. O caminho de volta é a barra lateral; o "Início" solto no topo saiu.
 *
 * 25/11/2026 (DESIGN.md, seção 9; decisão do Lucas sobre a margem): o capital mínimo de cada robô e o
 * máximo de entradas abertas que ele considera vêm de capitaisDaCasa, o mesmo lugar de onde a lista da
 * Visão geral, o Resumo e Quedas e risco tiram os seus: margem por contrato × o máximo de entradas que o
 * robô já teve abertas ao mesmo tempo + maior queda × fator. Aqui não se refaz a conta, para o número ser
 * o mesmo em toda tela. Os dados da série vêm do carregarCasa, que o layout do site e o capitaisDaCasa já
 * leram nesta mesma renderização (cache por requisição): a simulação e o capital mínimo saem das mesmas linhas.
 */
export default async function PaginaSimulador() {
  const [casa, capitais] = await Promise.all([carregarCasa(), capitaisDaCasa()]);
  const { hoje } = casa;

  const porRobo = new Map<string, EstatisticaPublica[]>();
  for (const e of casa.estatisticas) {
    const lista = porRobo.get(e.slug) ?? [];
    lista.push(e);
    porRobo.set(e.slug, lista);
  }

  const robosSim: RoboSimulador[] = casa.robos
    .filter((r) => r.status !== "arquivado")
    .map((r) => {
      const opcoes = { base: "liquido", unidade: "brl", valorPonto: r.valor_ponto_brl } as const;
      // R$ líquido por 1 contrato SEM arredondar: o banco guarda 4 casas e a conta do capital mínimo também não
      // arredonda os dias; a soma do dia da carteira é que sai a centavos (somarCarteira)
      const dias = ordenarPorDia((porRobo.get(r.slug) ?? []).filter((l) => l.dia <= hoje)).map(
        (l): DiaLiquido => [l.dia, valorDia(l, opcoes)],
      );
      const capital = capitais[r.slug];
      return {
        slug: r.slug,
        nome: r.nome,
        ativo: r.ativo,
        ativoNome: r.ativo_nome,
        contaTipo: r.conta_tipo,
        dias,
        // o número publicado do robô com 1 contrato por entrada; null sem margem cadastrada para o ativo
        capitalMinimoPorContrato: capital?.capitalMinimo ?? null,
        entradasAbertas: capital?.entradas ?? 1,
        // sem operação acompanhada ao vivo não há o que medir: a tela diz isso em vez de afirmar "1 entrada"
        entradasMedidas: capital ? capital.entradasEm !== null : false,
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
          // useSearchParams no cliente exige Suspense numa página estática
          <Suspense fallback={<Esqueleto />}>
            <PainelSimulador robos={robosSim} hoje={hoje} fatorSeguranca={casa.parametros.fatorSeguranca} />
          </Suspense>
        )}
      </CorpoPagina>
    </>
  );
}
