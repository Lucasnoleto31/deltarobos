import type { Metadata } from "next";
import Link from "next/link";
import { Valor } from "@/components/compartilhados/Valor";
import { BotaoCsv } from "@/components/operacoes/BotaoCsv";
import { FiltrosOperacoes } from "@/components/operacoes/FiltrosOperacoes";
import { Paginacao } from "@/components/operacoes/Paginacao";
import { queryDeFiltros, temFiltro } from "@/components/operacoes/params";
import { descreverFiltro, resumirFiltro } from "@/components/operacoes/resumo-do-filtro";
import { TabelaOperacoes } from "@/components/operacoes/TabelaOperacoes";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { listarOperacoes, type FiltroLado, type FiltroResultado } from "@/lib/consultas/operacoes";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { formatarNumero } from "@/lib/formato";
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
 * há no filtro, quanto somam e qual foi a pior, com a premissa escrita junto; a linha de filtros, sem
 * caixa; a tabela na largura toda; e no pé, discretos, a paginação e o arquivo para baixar. Saíram o
 * painel de filtros com os botões Filtrar e Limpar, o botão de exportar com ícone no topo e três colunas
 * (símbolo, resultado antes dos custos e custos), que continuam no arquivo.
 *
 * 19/09/2026: o título "Operações" repetia a aba logo acima. Continua sem repetir: o título visível agora
 * é a contagem ("16.773 operações"); sem operação nenhuma, fica só para leitor de tela.
 *
 * A soma e a pior operação vêm da série diária do robô, que o banco grava com a mesma regra da lista (ver
 * resumirFiltro). Só aparecem quando a série contou exatamente as operações que a lista tem; com filtro de
 * compra ou venda, que a série não separa, a linha mostra só a contagem.
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
    // a série diária, para a soma do filtro; com filtro de lado ela não serve, então nem é lida
    lado ? [] : listarEstatisticas(slug, { de }),
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
  // a mesma regra do bloco "De onde vêm os números": robô sem custo cadastrado mostra o valor antes dos custos
  const premissa = robo.custo_por_contrato > 0 ? "com 1 contrato, já descontados os custos" : "com 1 contrato, antes dos custos";
  const descricao = descreverFiltro(filtros);

  const miolo = (
    <>
      {/* robô sem operação nenhuma não tem o que filtrar */}
      {dados.total > 0 || filtrado ? <FiltrosOperacoes slug={slug} filtros={filtros} hoje={hoje} className="peer" /> : null}
      {/* enquanto a busca do filtro está a caminho, a lista antiga fica mais apagada */}
      <div className="mt-3 transition-opacity duration-150 peer-aria-busy:opacity-50">
        <TabelaOperacoes itens={dados.itens} slug={slug} dia={hoje} aoVivo={pagina === 1 && !filtrado} filtrado={filtrado} semLado={lado !== null} />
        {dados.total > 0 ? (
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 text-[0.8125rem]">
            <Paginacao slug={slug} filtros={filtros} pagina={dados.pagina} paginas={dados.paginas} />
            <BotaoCsv slug={slug} filtros={filtros} total={dados.total} className="ml-auto" />
          </div>
        ) : null}
      </div>
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
