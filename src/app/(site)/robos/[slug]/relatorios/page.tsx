import { cn } from "cn";
import type { Metadata } from "next";
import { Valor } from "@/components/compartilhados/Valor";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { mesesRelatorio, type MesRelatorio } from "@/lib/consultas/relatorios";
import { formatarNumero } from "@/lib/formato";
import { hojeSP, mesDe } from "@/lib/stats/periodos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Relatórios` : "Relatórios" };
}

const fmtMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

/** "Novembro" a partir de "2026-11". */
function nomeDoMes(mes: string): string {
  const nome = fmtMes.format(new Date(`${mes}-01T12:00:00Z`));
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

// o texto é pequeno: o ::after aumenta a área de toque sem mexer no desenho
const ELO = cn(LINK_DO_PAINEL, "relative after:absolute after:-inset-x-2 after:-inset-y-2.5");

/**
 * Aba Relatórios: "onde baixo os números para conferir?". Um PDF e uma planilha (CSV) por mês, gerados na
 * hora a partir das operações públicas.
 *
 * Ficha Mesa (25/11/2026): era uma tabela de seis colunas dentro de um painel, com dois botões com ícone
 * por linha. Agora é uma lista de arquivos, sem caixa: os meses agrupados por ano, uma linha com fio por
 * mês (o mês, quantas operações e pregões tem, o resultado e os dois links), em duas colunas na tela
 * larga, lidas de cima para baixo. Saiu a coluna do resultado antes dos custos, que está nos arquivos.
 *
 * 19/09/2026: o título "Relatórios mensais" repetia a aba logo acima; no lugar dele fica uma linha que diz
 * o que há para baixar e a premissa do resultado. O aviso do mês corrente fica na linha do próprio mês.
 */
export default async function PaginaRelatorios({ params }: Props) {
  const { slug } = await params;
  const [robo, linhas] = await Promise.all([buscarRobo(slug), listarEstatisticas(slug)]);
  if (!robo) return null;

  const meses = mesesRelatorio(linhas);
  const mesCorrente = mesDe(hojeSP());

  if (meses.length === 0) {
    return (
      <section aria-labelledby="relatorios-titulo">
        <h2 id="relatorios-titulo" className="sr-only">
          Relatórios mensais
        </h2>
        <p className="text-sm text-muted-foreground">Ainda não há relatório: este robô não tem operações fechadas.</p>
      </section>
    );
  }

  // os meses chegam do mais recente para o mais antigo; os anos saem na mesma ordem
  const anos: { ano: string; meses: MesRelatorio[] }[] = [];
  for (const m of meses) {
    const ano = m.mes.slice(0, 4);
    const grupo = anos[anos.length - 1];
    if (grupo && grupo.ano === ano) grupo.meses.push(m);
    else anos.push({ ano, meses: [m] });
  }

  // a mesma regra do bloco "De onde vêm os números": robô sem custo cadastrado mostra o valor antes dos custos
  const premissa = robo.custo_por_contrato > 0 ? "com 1 contrato, já descontados os custos" : "com 1 contrato, antes dos custos";

  return (
    <section aria-labelledby="relatorios-titulo" className="painel">
      <header className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <h2 id="relatorios-titulo" className="text-[0.9375rem] text-muted-foreground">
          Um relatório por mês, em PDF e em planilha (CSV)
        </h2>
        <p className="text-[0.8125rem] text-muted-foreground">resultado de cada mês {premissa}</p>
      </header>

      {anos.map(({ ano, meses: doAno }) => (
        <section key={ano} aria-labelledby={`relatorios-${ano}`} className="mt-10 first-of-type:mt-7">
          <h3 id={`relatorios-${ano}`} className="painel-nome border-b border-(--painel-fio) pb-3">
            {ano}
          </h3>
          {/* a partir de xl, duas colunas preenchidas de cima para baixo: a primeira metade do ano de um lado, a segunda do outro */}
          <ul
            className="grid gap-x-12 xl:grid-flow-col xl:grid-cols-2 xl:grid-rows-[repeat(var(--linhas),auto)]"
            style={{ "--linhas": Math.ceil(doAno.length / 2) } as React.CSSProperties}
          >
            {doAno.map((m) => {
              const nome = nomeDoMes(m.mes);
              return (
                <li key={m.mes} className="flex items-center justify-between gap-x-6 border-b border-(--painel-fio) py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {nome}
                      {m.mes === mesCorrente ? <span className="ml-2 text-[0.8125rem] font-normal text-muted-foreground">em andamento</span> : null}
                    </p>
                    <p className="text-[0.8125rem] text-muted-foreground">
                      {formatarNumero(m.nOperacoes)} {m.nOperacoes === 1 ? "operação" : "operações"} em {formatarNumero(m.nDias)}{" "}
                      {m.nDias === 1 ? "pregão" : "pregões"}
                    </p>
                  </div>
                  {/* no celular o resultado fica em cima e os links embaixo; a partir de sm, lado a lado */}
                  <div className="flex shrink-0 flex-col items-end gap-y-0.5 sm:flex-row sm:items-baseline sm:gap-x-8">
                    <Valor valor={m.liquido} inteiro={Math.abs(m.liquido) >= 1000} className="text-sm font-medium" />
                    <span className="flex gap-x-5 text-[0.8125rem]">
                      <a href={`/api/relatorios/${slug}/${m.mes}/pdf`} aria-label={`Relatório de ${nome} de ${ano} em PDF`} className={ELO}>
                        PDF
                      </a>
                      <a href={`/api/relatorios/${slug}/${m.mes}/csv`} aria-label={`Operações de ${nome} de ${ano} em planilha (CSV)`} className={ELO}>
                        CSV
                      </a>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}
