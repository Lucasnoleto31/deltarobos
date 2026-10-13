import { cn } from "cn";
import { corDoRobo } from "@/lib/cores-robo";

/**
 * O ponto na cor do robô, ao lado do nome (13/10/2026, mídia kit da Zeve: "cor por robô"). A cor sai da posição
 * `ordem` do banco (src/lib/cores-robo.ts), nunca do slug, e acompanha o tema. Só identidade: o nome continua
 * escrito ao lado, então o ponto é decorativo para o leitor de tela. Serve ao Comparativo e ao Simulador.
 */
export function PontoDoRobo({ ordem, className }: { ordem: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: corDoRobo(ordem) }}
    />
  );
}
