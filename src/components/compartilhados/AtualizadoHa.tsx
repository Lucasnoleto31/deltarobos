"use client";

import { cn } from "cn";
import { useAgora } from "@/hooks/useAgora";
import { haQuanto } from "@/lib/formato";
import { segundosDesde } from "@/lib/stats/pregao";

interface Props {
  em: string | null | undefined;
  prefixo?: string;
  /** segundos a partir dos quais o ponto fica vermelho */
  alertaApos?: number;
  className?: string;
}

/** "atualizado há 12 s" com um ponto que pulsa quando o dado é fresco. */
export function AtualizadoHa({ em, prefixo = "atualizado", alertaApos = 120, className }: Props) {
  const agora = useAgora(1000);

  if (!agora) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <span className="inline-block size-1.5 rounded-full bg-muted-foreground/60" />
        {prefixo} …
      </span>
    );
  }

  const s = segundosDesde(em, agora);
  const tom =
    s === null
      ? "bg-muted-foreground/60"
      : s > alertaApos
        ? "bg-negativo"
        : s <= 15
          ? "bg-positivo animate-pulse"
          : "bg-muted-foreground/60";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums", className)}
      aria-live="polite"
    >
      <span className={cn("inline-block size-1.5 rounded-full", tom)} />
      {prefixo} {haQuanto(em, agora)}
    </span>
  );
}
