import { cn } from "cn";
import { RevelarNaRolagem } from "@/components/compartilhados/RevelarNaRolagem";

/** O título de seção da home, igual em todas: quem não usa a CabecaSecao (a Transparência, em coluna) usa a classe. */
export const CLASSE_TITULO_SECAO = "text-xl font-semibold tracking-tight sm:text-2xl";

/**
 * Cabeça das seções da home (13/10/2026): título, a frase de apoio (o fato do dia, não a descrição da seção)
 * e, à direita, a ação da seção quando há (filtros dos robôs). Antes cada seção repetia as próprias classes e
 * o espaço entre título e apoio variava. Entra ao rolar, como antes.
 */
export function CabecaSecao({
  titulo,
  apoio,
  children,
  className,
}: {
  titulo: React.ReactNode;
  apoio?: React.ReactNode;
  /** a ação da seção, alinhada à direita (ou embaixo, quando não cabe) */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <RevelarNaRolagem className={cn("mb-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 className={CLASSE_TITULO_SECAO}>{titulo}</h2>
        {apoio ? <p className="mt-1 text-sm text-muted-foreground">{apoio}</p> : null}
      </div>
      {children}
    </RevelarNaRolagem>
  );
}
