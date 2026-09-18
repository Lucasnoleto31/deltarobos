"use client";

import { cn } from "cn";
import { useAgora } from "@/hooks/useAgora";
import { haQuanto } from "@/lib/formato";
import { segundosDesde } from "@/lib/stats/pregao";

interface Props {
  em: string | null | undefined;
  prefixo?: string;
  /** segundos a partir dos quais o texto fica vermelho */
  alertaApos?: number;
  className?: string;
}

/** "atualizado há 12 s". Só texto: fica vermelho quando passou do limite. A bolinha que pulsava saiu em 18/09/2026. */
export function AtualizadoHa({ em, prefixo = "atualizado", alertaApos = 120, className }: Props) {
  const agora = useAgora(1000);

  if (!agora) {
    return <span className={cn("text-xs text-muted-foreground", className)}>{prefixo} …</span>;
  }

  const s = segundosDesde(em, agora);
  const atrasado = s !== null && s > alertaApos;

  return (
    <span
      className={cn("text-xs tabular-nums", atrasado ? "text-negativo" : "text-muted-foreground", className)}
      aria-live="polite"
    >
      {prefixo} {haQuanto(em, agora)}
    </span>
  );
}
