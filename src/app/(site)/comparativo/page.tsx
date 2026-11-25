import type { Metadata } from "next";
import { PainelComparativo, type RoboDoComparativo } from "@/components/comparativo/PainelComparativo";
import { CabecalhoPagina, CorpoPagina } from "@/components/sistema/Pagina";
import { carregarCasa } from "@/lib/consultas/casa";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Comparar robôs",
  description:
    "Os robôs da Quants Robôs lado a lado no mesmo período: resultado, maior queda e acertos, com 1 contrato e já descontados os custos.",
};

/**
 * "Comparar robôs" (ficha Mesa, 25/11/2026). A tela responde a uma pergunta, "qual robô foi melhor, e em
 * quê?", com um número, um gráfico e uma tabela (ver PainelComparativo). Em 18/09/2026 a página era a tabela
 * de 13 métricas virada de lado, as barras de "quem rendeu mais" e "todos juntos" mês a mês; o Lucas mandou
 * tirar o que não é necessário, e a soma dos robôs já é a página inicial.
 *
 * Os dados são os do carregarCasa, que o layout do site já chamou neste mesmo render (cache por
 * requisição): os robôs do banco, sem os arquivados, e a série diária compacta de cada um (dia, valor,
 * operações e ganhos), a mesma que a página inicial desenha. Em 18/09/2026 a série saiu do HTML porque ia
 * com as onze colunas do banco e pesava 870 KB; nesta forma ela é a da página inicial. Entra só robô com
 * pregão no histórico, como antes: o "em breve" não tem o que comparar. Nada de robô fixo no código.
 */
export default async function PaginaComparativo() {
  const casa = await carregarCasa();

  const series = casa.series.filter((s) => s.dias.length > 0);
  const comHistorico = new Set(series.map((s) => s.slug));
  // de cada robô, só o que a tela mostra e o que o ao vivo precisa
  const robos: RoboDoComparativo[] = casa.cards
    .filter((c) => comHistorico.has(c.slug))
    .map((c) => ({
      slug: c.slug,
      nome: c.nome,
      ativo: c.ativo,
      ativoNome: c.ativoNome,
      status: c.status,
      horarioInicio: c.horarioInicio,
      horarioFim: c.horarioFim,
      posicionado: c.posicionado,
      nPosicoesAbertas: c.nPosicoesAbertas,
      ultimoHeartbeatEm: c.ultimoHeartbeatEm,
      temColetor: c.temColetor,
      hoje: c.hoje,
      mes: c.mes,
      acumulado: c.acumulado,
    }));

  return (
    <>
      <CabecalhoPagina titulo="Comparar robôs" descricao="O resultado de cada robô no mesmo período e na mesma escala." />
      <CorpoPagina>
        {robos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum robô com operações fechadas ainda.</p>
        ) : (
          <PainelComparativo robos={robos} series={series} />
        )}
      </CorpoPagina>
    </>
  );
}
