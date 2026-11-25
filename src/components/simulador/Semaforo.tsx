import { cn } from "cn";
import { formatarPct } from "@/lib/formato";
import { LIMITE_APERTADO, type ResultadoSimulacao, type RoboSimulador } from "@/lib/stats/simulador";

/**
 * O texto fixo de compliance do simulador. Vai uma vez, debaixo do título da página, onde aparece com ou
 * sem capital informado (ficha Mesa, 25/11/2026: o que repete outro lugar da tela sai; até então vinha
 * também junto do semáforo).
 */
export const TEXTO_FIXO_SIMULADOR = "Aritmética sobre o histórico; não é recomendação nem projeção de resultado.";

// O estado em uma palavra e a cor dela. Verde não entra: na ficha Mesa verde é só de ganho, e um "Cabe"
// verde se lê como recomendação. "Apertado" leva a cor de atenção e "Não cabe" a de perda (é o caso em que a
// maior queda ou o mínimo passam do capital); "Cabe" fica na cor do texto.
const APARENCIA: Record<ResultadoSimulacao["semaforo"], { titulo: string; cor: string }> = {
  cabe: { titulo: "Cabe", cor: "text-foreground" },
  apertado: { titulo: "Apertado", cor: "text-alerta" },
  nao_cabe: { titulo: "Não cabe", cor: "text-negativo" },
};

interface Props {
  resultado: ResultadoSimulacao;
  /** o capital informado */
  capital: number;
  robos: readonly RoboSimulador[];
  className?: string;
}

/**
 * O semáforo do capital (23/09/2026): "não cabe" quando o capital fica abaixo do capital mínimo publicado
 * (sem o total, por robô sem margem configurada, abaixo da soma dos mínimos conhecidos) ou quando a maior
 * queda simulada consumiria o capital inteiro; "apertado" quando cabe mas a maior queda passa de
 * LIMITE_APERTADO do capital informado; "cabe" no resto. A regra mora em semaforoDe (lib/stats/simulador);
 * aqui só se escreve a frase que a explica, na mesma ordem das regras.
 *
 * 25/11/2026 (ficha Mesa): deixou de ser um painel com título, pílula colorida e três parágrafos. É uma
 * frase debaixo do número, com o estado na frente em texto colorido. Os números que decidem (o capital, o
 * capital mínimo e a maior queda em % do capital) estão escritos ao lado, na premissa e na lista de fatos,
 * e por isso a frase não os repete; só o limite de 25% aparece aqui. "Pelo histórico" vai junto do estado
 * para ninguém ler "cabe" como garantia.
 */
export function Semaforo({ resultado, capital, robos, className }: Props) {
  const { semaforo, capitalMinimo, capitalMinimoConhecido, robosSemCapitalMinimo } = resultado;
  const aparencia = APARENCIA[semaforo];
  const limite = formatarPct(LIMITE_APERTADO, 0);
  const semMinimo = robosSemCapitalMinimo.map((slug) => robos.find((r) => r.slug === slug)?.nome ?? slug);
  // sem o total (algum robô sem margem), a parte conhecida ainda é um piso que a frase cita
  const parteConhecida = capitalMinimo === null && capitalMinimoConhecido > 0;

  let frase: string;
  if (semaforo === "nao_cabe") {
    if (capitalMinimo !== null && capital < capitalMinimo) {
      frase = "O capital está abaixo do mínimo publicado para estes robôs e contratos.";
    } else if (capital < capitalMinimoConhecido) {
      frase = "O capital está abaixo do mínimo publicado dos robôs que têm mínimo configurado.";
    } else {
      frase = "A maior queda teria consumido o capital inteiro.";
    }
  } else if (semaforo === "apertado") {
    frase =
      capitalMinimo !== null
        ? `O capital cobre o mínimo publicado, mas a maior queda passou de ${limite} do capital.`
        : parteConhecida
          ? `O capital cobre o mínimo conhecido, mas a maior queda passou de ${limite} do capital.`
          : `A maior queda passou de ${limite} do capital.`;
  } else {
    frase =
      capitalMinimo !== null
        ? `O capital cobre o mínimo publicado e a maior queda ficou dentro de ${limite} do capital.`
        : parteConhecida
          ? `O capital cobre o mínimo conhecido e a maior queda ficou dentro de ${limite} do capital.`
          : `A maior queda ficou dentro de ${limite} do capital.`;
  }

  return (
    // região viva: quem muda o capital pelo teclado ouve o estado novo sem sair do campo
    <p role="status" aria-live="polite" className={cn("max-w-3xl text-sm text-pretty text-muted-foreground", className)}>
      <span className="sr-only">Semáforo do capital: </span>
      <span className={cn("font-medium", aparencia.cor)}>{aparencia.titulo}</span>, pelo histórico. {frase}
      {semMinimo.length > 0
        ? ` Sem capital mínimo configurado: ${semMinimo.join(", ")}; ${parteConhecida ? "a soma dos outros vale como piso" : "só a maior queda decide"}.`
        : ""}
    </p>
  );
}
