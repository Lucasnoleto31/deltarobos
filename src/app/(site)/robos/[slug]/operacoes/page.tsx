import type { Metadata } from "next";
import Link from "next/link";
import { Valor } from "@/components/compartilhados/Valor";
import { ArquivosPorMes } from "@/components/operacoes/ArquivosPorMes";
import { BotaoCsv } from "@/components/operacoes/BotaoCsv";
import { FiltrosOperacoes } from "@/components/operacoes/FiltrosOperacoes";
import { Paginacao } from "@/components/operacoes/Paginacao";
import { queryDeFiltros, temFiltro } from "@/components/operacoes/params";
import { descreverFiltro, resumirFiltro } from "@/components/operacoes/resumo-do-filtro";
import { TabelaOperacoes } from "@/components/operacoes/TabelaOperacoes";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { listarOperacoes, type FiltroLado, type FiltroResultado } from "@/lib/consultas/operacoes";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { mesesRelatorio } from "@/lib/consultas/relatorios";
import { formatarNumero } from "@/lib/formato";
import { premissaDoRobo } from "@/lib/premissa";
import { historicoCurto } from "@/lib/stats/calendario";
import { tempoEmPalavras } from "@/lib/stats/indicadores-robo";
import { ehDia, hojeSP } from "@/lib/stats/periodos";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Operações` : "Operações" };
}

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Aba Operações: "o que o robô fez, operação por operação?". Tabela completa paginada, filtros na URL,
 * planilha para baixar e, na primeira página sem filtro, as operações de hoje entrando ao vivo.
 *
 * Ficha Mesa (25/11/2026): a tabela é a tela. Em cima dela, uma linha de título que diz quantas operações
 * há no filtro, quanto somam, a maior queda do período e a pior operação, com a premissa escrita junto; a
 * linha de filtros, sem caixa; a tabela na largura toda; e no pé, discretos, a paginação, o arquivo do
 * filtro e os arquivos de cada mês. Saíram o painel de filtros com os botões Filtrar e Limpar, o botão de
 * exportar com ícone no topo e três colunas (símbolo, resultado antes dos custos e custos), que continuam
 * no arquivo.
 *
 * Revisão de 25/11/2026 (DESIGN.md, seção 9):
 * - saiu a coluna "Melhor momento" da tabela (ver TabelaOperacoes);
 * - a soma do filtro vem com a maior queda do mesmo período ao lado, e deixou de aparecer quando o filtro
 *   é só das operações que ganharam ou só das que perderam (ver resumirFiltro);
 * - a aba Relatórios deixou de existir: os arquivos dos meses mais recentes estão no pé desta tabela, e a
 *   lista de todos os meses, na aba Dia a dia.
 *
 * 19/09/2026: o título "Operações" repetia a aba logo acima. Continua sem repetir: o título visível agora
 * é a contagem ("16.773 operações"); sem operação nenhuma, fica só para leitor de tela.
 *
 * A soma, a maior queda e a pior operação vêm da série diária do robô, que o banco grava com a mesma regra
 * da lista (ver resumirFiltro). Só aparecem quando a série contou exatamente as operações que a lista tem;
 * com filtro de compra ou venda, que a série não separa, a linha mostra só a contagem. A mesma série diz
 * quais meses têm arquivo (mesesRelatorio, a consulta que a página de relatórios usava).
 */
export default async function PaginaOperacoes({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const hoje = hojeSP();

  const de = ehDia(primeiro(sp.de)) ? (primeiro(sp.de) as string) : null;
  const ate = ehDia(primeiro(sp.ate)) ? (primeiro(sp.ate) as string) : null;
  const ladoBruto = primeiro(sp.lado);
  const lado: FiltroLado | null = ladoBruto === "compra" || ladoBruto === "venda" ? ladoBruto : null;
  const resBruto = primeiro(sp.resultado);
  const resultado: FiltroResultado | null = resBruto === "gain" || resBruto === "loss" ? resBruto : null;
  const paginaBruta = Number.parseInt(primeiro(sp.pagina) ?? "1", 10);
  const pagina = Number.isFinite(paginaBruta) && paginaBruta > 0 ? paginaBruta : 1;

  const filtros = { de, ate, lado, resultado };
  const filtrado = temFiltro(filtros);
  const [robo, dados, dias] = await Promise.all([
    buscarRobo(slug),
    listarOperacoes(slug, { ...filtros, pagina }),
    // a série diária inteira: dela saem a soma do filtro e os meses que têm arquivo para baixar
    listarEstatisticas(slug),
  ]);
  if (!robo) return null; // o layout já tratou o 404

  // Página além da última (só se chega aqui mexendo na URL): a consulta volta vazia e sem contagem. Em vez
  // de dizer que o robô não tem operações, o que seria falso, a tela diz o que houve e leva de volta.
  if (dados.total === 0 && pagina > 1) {
    return (
      <section aria-labelledby="operacoes-titulo" className="painel">
        <h2 id="operacoes-titulo" className="sr-only">
          Operações
        </h2>
        <p className="text-sm text-muted-foreground">
          Não há operações nesta página.{" "}
          <Link href={`/robos/${slug}/operacoes${queryDeFiltros(filtros)}`} className={LINK_DO_PAINEL}>
            Voltar à primeira página
          </Link>
        </p>
      </section>
    );
  }

  const resumo = resumirFiltro(dias, filtros);
  const soma = resumo !== null && resumo.operacoes === dados.total ? resumo : null;
  // a regra única de lib/premissa: robô sem custo cadastrado mostra o valor antes dos custos
  const premissa = premissaDoRobo(robo.custo_por_contrato);
  const descricao = descreverFiltro(filtros);
  // os meses com operação, do mais recente para o mais antigo: cada um tem um PDF e uma planilha
  const meses = mesesRelatorio(dias).map((m) => m.mes);
  // Sem filtro de período, a soma é a do histórico inteiro: quando ele tem menos de 12 meses, a linha diz
  // o tamanho ("em 9 meses"). A série chega em ordem de data.
  const primeiroDia = dias[0]?.dia;
  const ultimoDia = dias[dias.length - 1]?.dia;
  const emQuanto = !de && !ate && primeiroDia && ultimoDia && historicoCurto(primeiroDia, ultimoDia) ? ` em ${tempoEmPalavras(primeiroDia, ultimoDia)}` : "";

  const miolo = (
    <>
      {/* robô sem operação nenhuma não tem o que filtrar */}
      {dados.total > 0 || filtrado ? <FiltrosOperacoes slug={slug} filtros={filtros} hoje={hoje} className="peer" /> : null}
      {/* enquanto a busca do filtro está a caminho, a lista antiga fica mais apagada */}
      <div className="mt-3 transition-opacity duration-150 peer-aria-busy:opacity-50">
        <TabelaOperacoes itens={dados.itens} slug={slug} dia={hoje} aoVivo={pagina === 1 && !filtrado} filtrado={filtrado} semLado={lado !== null} />
        {dados.total > 0 ? (
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-4 text-[0.8125rem]">
            <Paginacao slug={slug} filtros={filtros} pagina={dados.pagina} paginas={dados.paginas} />
            <BotaoCsv slug={slug} filtros={filtros} total={dados.total} className="ml-auto" />
          </div>
        ) : null}
      </div>
      {/* os arquivos de cada mês não dependem do filtro: ficam fora do bloco que apaga durante a busca */}
      <ArquivosPorMes slug={slug} meses={meses} className="mt-5" />
    </>
  );

  if (dados.total === 0) {
    return (
      <section aria-labelledby="operacoes-titulo" className="painel">
        <h2 id="operacoes-titulo" className="sr-only">
          Operações
        </h2>
        {miolo}
      </section>
    );
  }

  return (
    <Painel
      id="operacoes"
      fio={false}
      corpo="pt-5"
      titulo={
        <>
          {formatarNumero(dados.total)} {dados.total === 1 ? "operação" : "operações"}
          {descricao ? <span className="font-normal text-muted-foreground"> {descricao}</span> : null}
        </>
      }
      apoio={
        // um degrau mais claro que o apoio padrão da seção: é aqui que estão a soma e a premissa dela
        <span className="text-muted-foreground">
          {soma ? (
            <>
              {dados.total === 1 ? "resultado " : "resultado somado "}
              <Valor valor={soma.soma} inteiro={Math.abs(soma.soma) >= 1000} className="font-medium" />
              {emQuanto}
              {/* onde aparece o resultado, aparece a maior queda do mesmo período */}
              {soma.maiorQueda > 0 ? (
                <>
                  {" · maior queda "}
                  <Valor valor={-soma.maiorQueda} inteiro={soma.maiorQueda >= 1000} className="font-medium" />
                </>
              ) : null}
              {soma.pior !== null && dados.total > 1 ? (
                <>
                  {" · pior operação "}
                  <Valor valor={soma.pior} inteiro={Math.abs(soma.pior) >= 1000} className="font-medium" />
                </>
              ) : null}
              {" · "}
              {premissa}
            </>
          ) : (
            `valores ${premissa}`
          )}
        </span>
      }
    >
      {miolo}
    </Painel>
  );
}
