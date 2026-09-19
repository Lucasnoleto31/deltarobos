"use client";

import { cn } from "cn";
import { useAgora } from "@/hooks/useAgora";
import { formatarDuracao, haQuanto } from "@/lib/formato";
import { segundosDesde } from "@/lib/stats/pregao";

interface Props {
  em: string | null | undefined;
  prefixo?: string;
  /** segundos a partir dos quais o texto fica laranja */
  alertaApos?: number;
  className?: string;
}

/**
 * "atualizado há 12 s". Só texto: fica laranja quando passou do limite. A bolinha que pulsava saiu em 18/09/2026.
 * 19/09/2026: laranja em vez de vermelho (vermelho é só resultado em dinheiro) e sem aria-live no texto, que muda
 * a cada segundo; o leitor de tela ouve só a passagem para atrasado, numa região à parte que muda uma vez.
 */
export function AtualizadoHa({ em, prefixo = "atualizado", alertaApos = 120, className }: Props) {
  const agora = useAgora(1000);

  // a região existe desde o primeiro render para o leitor de tela perceber quando ela ganha texto
  if (!agora) {
    return (
      <>
        <span className={cn("text-xs text-muted-foreground", className)}>{prefixo} …</span>
        <span role="status" className="sr-only" />
      </>
    );
  }

  const s = segundosDesde(em, agora);
  const atrasado = s !== null && s > alertaApos;

  return (
    <>
      <span className={cn("text-xs tabular-nums", atrasado ? "text-alerta" : "text-muted-foreground", className)}>
        {prefixo} {haQuanto(em, agora)}
      </span>
      <span role="status" className="sr-only">
        {atrasado ? `Sem atualização há mais de ${formatarDuracao(alertaApos)}.` : null}
      </span>
    </>
  );
}
