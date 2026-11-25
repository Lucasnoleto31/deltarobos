import { cn } from "cn";
import Link from "next/link";
import { ArquivosDoMes, nomeDoMes } from "@/components/calendario/ArquivosDoMes";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { formatarNumero } from "@/lib/formato";

// quantos meses cabem numa linha no pé da tabela; os outros estão na lista "Mês a mês" da aba Dia a dia
const MESES_NO_PE = 3;

// o texto é pequeno: o ::after aumenta a área de toque sem mexer no desenho
const ELO = cn(LINK_DO_PAINEL, "relative after:absolute after:-inset-x-2 after:-inset-y-2.5");

interface Props {
  slug: string;
  /** os meses com operação ("YYYY-MM"), do mais recente para o mais antigo */
  meses: string[];
  className?: string;
}

/**
 * O pé da aba Operações (25/11/2026): os arquivos de cada mês, que eram a aba Relatórios. Uma linha só, com
 * os meses mais recentes (o relatório em PDF e as operações em planilha, os mesmos endereços da lista "Mês a
 * mês" da aba Dia a dia) e, quando o robô tem mais meses do que cabem aqui, o caminho para a lista inteira.
 * O ano só aparece junto do mês quando a linha atravessa a virada do ano.
 */
export function ArquivosPorMes({ slug, meses, className }: Props) {
  if (meses.length === 0) return null;
  const aVista = meses.slice(0, MESES_NO_PE);
  const viraOAno = new Set(aVista.map((m) => m.slice(0, 4))).size > 1;

  return (
    <nav
      aria-label="Arquivos de cada mês"
      // no celular cada mês ocupa uma linha, e o vão entre elas guarda o alvo de toque dos links
      className={cn("flex flex-wrap items-baseline gap-x-8 gap-y-5 border-t border-(--painel-fio) pt-4 text-[0.8125rem] sm:gap-y-3", className)}
    >
      <span className="text-sutil max-sm:w-full">Arquivos de cada mês</span>
      {aVista.map((m) => (
        <span key={m} className="flex items-baseline gap-x-4 whitespace-nowrap">
          <span className="text-muted-foreground">
            {nomeDoMes(m)}
            {viraOAno ? ` de ${m.slice(0, 4)}` : ""}
          </span>
          <ArquivosDoMes slug={slug} mes={m} />
        </span>
      ))}
      {meses.length > aVista.length ? (
        <Link href={`/robos/${slug}/calendario#mes-a-mes`} className={ELO}>
          Todos os {formatarNumero(meses.length)} meses
        </Link>
      ) : null}
    </nav>
  );
}
