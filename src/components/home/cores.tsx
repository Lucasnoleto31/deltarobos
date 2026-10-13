import { cn } from "cn";
import { corDoRobo } from "@/lib/cores-robo";

/**
 * As cores da home no mídia kit da Zeve (13/10/2026, pedido do Lucas: "mais cores, principalmente valores
 * positivos e negativos"). Três famílias, cada uma com um papel só: verde e vermelho para resultado, o azul do
 * acento para o que é ação ou ao vivo, e uma cor por robô para dizer de quem é o número.
 */

/**
 * A cor do robô como variável de CSS (--cor-robo) no contêiner, pela `ordem` do banco (corDoRobo), nunca pelo
 * slug. Quem está dentro usa bg-(--cor-robo), border-[color-mix(...var(--cor-robo)...)] e afins.
 */
export function estiloDoRobo(ordem: number): React.CSSProperties {
  return { "--cor-robo": corDoRobo(ordem) } as React.CSSProperties;
}

/**
 * O ponto na cor do robô, ao lado do nome. Só marca, nunca texto: no tema claro algumas cores da paleta ficam
 * em 3:1 sobre o branco, o bastante para um ponto e pouco para letra miúda. Sem `ordem`, usa a --cor-robo
 * do contêiner.
 */
export function PontoRobo({ ordem, className }: { ordem?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full bg-(--cor-robo)", className)}
      style={ordem === undefined ? undefined : estiloDoRobo(ordem)}
    />
  );
}

type Sinal = "positivo" | "negativo" | "neutro";

export function sinalDe(valor: number): Sinal {
  return valor > 0 ? "positivo" : valor < 0 ? "negativo" : "neutro";
}

/**
 * Fundo tingido pelo sinal, para o número que precisa saltar do meio do texto (o resultado da casa na barra ao
 * vivo). O texto não vai na cor pura: sobre o próprio tingido o verde do claro caía para 4,4:1 e o vermelho
 * do escuro para 4,4:1; com 20% da cor do texto da página dá 5,4:1 a 7,8:1 nos dois temas (medido com os
 * tokens de 13/10/2026, tingido de 10% sobre o cartão). Mesma receita do selo de status (BadgeStatusRobo).
 * Quem usa passa colorir={false} ao Valor dentro, para a cor vir daqui.
 */
export const CHIP_DO_SINAL: Record<Sinal, string> = {
  positivo:
    "border-positivo/30 bg-positivo/10 text-[color-mix(in_srgb,var(--positivo)_80%,var(--foreground))] dark:text-positivo",
  negativo: "border-negativo/30 bg-negativo/10 text-[color-mix(in_srgb,var(--negativo)_80%,var(--foreground))]",
  neutro: "border-(--painel-fio) bg-muted text-muted-foreground",
};
