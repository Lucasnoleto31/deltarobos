"use client";

import { useAgora } from "@/hooks/useAgora";
import { haQuanto } from "@/lib/formato";

interface Props {
  em: string | null | undefined;
  /** texto antes do "há …", com os espaços que precisar */
  prefixo?: string;
}

/**
 * "há 3 min" que anda sozinho, só texto. É folha de propósito (18/09/2026): com o relógio de 1 s no
 * HojeAoVivo, o painel inteiro (curva do dia e lista) renderizava a cada segundo por causa desta frase.
 * Antes de montar não escreve nada, como o texto que ele substitui.
 */
export function HaQuanto({ em, prefixo = "" }: Props) {
  const agora = useAgora(1000);
  if (!agora) return null;
  return `${prefixo}${haQuanto(em, agora)}`;
}
