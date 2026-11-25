import { cn } from "cn";
import Link from "next/link";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { formatarNumero } from "@/lib/formato";
import { queryDeFiltros, type FiltrosUrl } from "./params";

interface Props {
  slug: string;
  filtros: FiltrosUrl;
  pagina: number;
  paginas: number;
  className?: string;
}

// o texto é pequeno: o ::after aumenta a área de toque sem mexer no desenho
const ELO = cn(LINK_DO_PAINEL, "relative after:absolute after:-inset-x-2 after:-inset-y-2.5");
const PARADO = "border-b border-transparent text-sutil opacity-60";

/**
 * Paginação da lista de operações, no pé da tabela (ficha Mesa, 25/11/2026): dois links de texto com fio
 * embaixo e a página atual ao lado. Eram dois botões com borda, um em cada ponta da tela, e o número no
 * meio. Os links vêm primeiro para não saírem do lugar quando o número da página ganha um algarismo; na
 * primeira e na última página, o lado sem destino vira texto apagado em vez de sumir.
 */
export function Paginacao({ slug, filtros, pagina, paginas, className }: Props) {
  if (paginas <= 1) return null;
  const base = `/robos/${slug}/operacoes`;

  return (
    <nav aria-label="Páginas" className={cn("flex flex-wrap items-baseline gap-x-5 gap-y-2", className)}>
      {pagina > 1 ? (
        <Link href={`${base}${queryDeFiltros(filtros, pagina - 1)}`} rel="prev" className={ELO}>
          Anterior
        </Link>
      ) : (
        <span className={PARADO}>Anterior</span>
      )}
      {pagina < paginas ? (
        <Link href={`${base}${queryDeFiltros(filtros, pagina + 1)}`} rel="next" className={ELO}>
          Próxima
        </Link>
      ) : (
        <span className={PARADO}>Próxima</span>
      )}
      <span className="text-muted-foreground">
        Página {formatarNumero(pagina)} de {formatarNumero(paginas)}
      </span>
    </nav>
  );
}
