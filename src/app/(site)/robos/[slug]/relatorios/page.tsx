import { FileDown, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import { Valor } from "@/components/compartilhados/Valor";
import { buttonVariants } from "@/components/ui/button";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { mesesRelatorio } from "@/lib/consultas/relatorios";
import { formatarMesAno, formatarNumero } from "@/lib/formato";

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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Relatórios mensais</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          PDF com resumo, resultado por dia, por série do contrato e as operações; CSV com as mesmas operações. Por 1 contrato, com bruto, custos e líquido.
        </p>
      </header>

      {meses.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Ainda não há mês com operações fechadas.</p>
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
                  <td className="font-medium first-letter:uppercase">{formatarMesAno(`${m.mes}-01`)}</td>
                  <td className="text-right">{m.nDias}</td>
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

      <p className="text-xs text-muted-foreground">
        O mês corrente muda ao longo do dia.
      </p>
    </div>
  );
}
