import { cn } from "cn";
import { Valor } from "@/components/compartilhados/Valor";
import { fraseDeHoje, type RoboAgora } from "./frase-de-hoje";

const TOM = { neutro: "text-muted-foreground", info: "text-info", alerta: "text-alerta" } as const;

/**
 * O que o robô fez hoje, em uma linha de texto (ver fraseDeHoje). Só o valor leva verde ou vermelho. Vai
 * debaixo do nome do robô na lista da página inicial e na barra lateral, no lugar do selo de estado.
 */
export function TextoDeHoje({ robo, className }: { robo: RoboAgora; className?: string }) {
  const f = fraseDeHoje(robo);
  return (
    <span className={cn("text-[0.8125rem]", TOM[f.tom], className)}>
      {f.antes}
      {f.valor !== null ? <Valor valor={f.valor} inteiro={Math.abs(f.valor) >= 1000} className="font-medium" /> : null}
      {f.depois}
    </span>
  );
}
