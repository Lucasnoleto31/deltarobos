import { FileDown, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import { Valor } from "@/components/compartilhados/Valor";
import { buttonVariants } from "@/components/ui/button";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { mesesRelatorio } from "@/lib/consultas/relatorios";
import { formatarMesAno, formatarNumero } from "@/lib/formato";
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

/** Aba Relatórios: um PDF e um CSV por mês, gerados na hora a partir das operações públicas. */
export default async function PaginaRelatorios({ params }: Props) {
  const { slug } = await params;
  const [robo, linhas] = await Promise.all([buscarRobo(slug), listarEstatisticas(slug)]);
  if (!robo) return null;

  const meses = mesesRelatorio(linhas);
  const mesCorrente = mesDe(hojeSP());

  // 19/09/2026: o título "Relatórios mensais" repetia a aba logo acima e o parágrafo descrevia o que os
  // botões baixam; ficou a linha de fatos. O aviso do mês corrente, que ficava solto no rodapé, foi para
  // a linha do próprio mês.
  return (
    <div className="space-y-4">
      <header>
        <h2 className="sr-only">Relatórios mensais</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatarNumero(meses.length)} {meses.length === 1 ? "mês" : "meses"} com operação · valores por 1 contrato
        </p>
      </header>

      {meses.length === 0 ? (
        <p className="painel px-4 py-8 text-center text-sm text-muted-foreground">Sem operações fechadas ainda.</p>
      ) : (
        <div className="overflow-x-auto painel">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">
                <th>Mês</th>
                <th className="text-right">Pregões</th>
                <th className="text-right">Operações</th>
                <th className="text-right">Bruto</th>
                <th className="text-right">Líquido</th>
                <th className="text-right">Baixar</th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t">
              {meses.map((m) => (
                <tr key={m.mes} className="tabular-nums [&>td]:px-4 [&>td]:py-2.5">
                  <td className="font-medium first-letter:uppercase">
                    {formatarMesAno(`${m.mes}-01`)}
                    {m.mes === mesCorrente ? <span className="ml-2 text-xs font-normal text-muted-foreground">em andamento</span> : null}
                  </td>
                  <td className="text-right">{formatarNumero(m.nDias)}</td>
                  <td className="text-right">{formatarNumero(m.nOperacoes)}</td>
                  <td className="text-right">
                    <Valor valor={m.bruto} inteiro={Math.abs(m.bruto) >= 1000} colorir={false} />
                  </td>
                  <td className="text-right">
                    <Valor valor={m.liquido} inteiro={Math.abs(m.liquido) >= 1000} className="font-semibold" />
                  </td>
                  <td className="text-right">
                    <div className="inline-flex gap-2">
                      <a href={`/api/relatorios/${slug}/${m.mes}/pdf`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                        <FileDown data-icon="inline-start" /> PDF
                      </a>
                      <a href={`/api/relatorios/${slug}/${m.mes}/csv`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                        <FileSpreadsheet data-icon="inline-start" /> CSV
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
