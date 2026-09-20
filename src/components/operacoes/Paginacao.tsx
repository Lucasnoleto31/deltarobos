import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { formatarNumero } from "@/lib/formato";
import { queryDeFiltros, type FiltrosUrl } from "./params";

interface Props {
  slug: string;
  filtros: FiltrosUrl;
  pagina: number;
  paginas: number;
}

export function Paginacao({ slug, filtros, pagina, paginas }: Props) {
  if (paginas <= 1) return null;
  const base = `/robos/${slug}/operacoes`;
  const desabilitado = "pointer-events-none opacity-50";

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 text-sm">
      <Link
        href={`${base}${queryDeFiltros(filtros, pagina - 1)}`}
        aria-disabled={pagina <= 1}
        className={`${buttonVariants({ size: "sm", variant: "outline" })} ${pagina <= 1 ? desabilitado : ""}`}
      >
        Anterior
      </Link>
      <span className="text-muted-foreground tabular-nums">
        Página {formatarNumero(pagina)} de {formatarNumero(paginas)}
      </span>
      <Link
        href={`${base}${queryDeFiltros(filtros, pagina + 1)}`}
        aria-disabled={pagina >= paginas}
        className={`${buttonVariants({ size: "sm", variant: "outline" })} ${pagina >= paginas ? desabilitado : ""}`}
      >
        Próxima
      </Link>
    </nav>
  );
}
