import type { FiltroLado, FiltroResultado } from "@/lib/consultas/operacoes";

export interface FiltrosUrl {
  de: string | null;
  ate: string | null;
  lado: FiltroLado | null;
  resultado: FiltroResultado | null;
}

/** Monta a query string da página de operações a partir dos filtros. */
export function queryDeFiltros(f: FiltrosUrl, pagina?: number): string {
  const p = new URLSearchParams();
  if (f.de) p.set("de", f.de);
  if (f.ate) p.set("ate", f.ate);
  if (f.lado) p.set("lado", f.lado);
  if (f.resultado) p.set("resultado", f.resultado);
  if (pagina && pagina > 1) p.set("pagina", String(pagina));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}
