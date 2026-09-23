import { cn } from "cn";
import { classesDoTom } from "@/components/compartilhados/BadgeStatusRobo";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { formatarBRL, formatarPct } from "@/lib/formato";
import { LIMITE_APERTADO, type ResultadoSimulacao, type RoboSimulador } from "@/lib/stats/simulador";
import type { TomStatus } from "@/lib/stats/status-robo";

/** O texto fixo de compliance do simulador: sob o título da página e de novo junto do semáforo. */
export const TEXTO_FIXO_SIMULADOR = "Aritmética sobre o histórico; não é recomendação nem projeção de resultado.";

// A pílula usa as classes de status do BadgeStatusRobo (fundo tingido a 15% e, onde a cor pura não chegava
// a 4,5:1, texto com 20% da cor do texto da página): uma quarta variação de pílula com a cor pura deixava
// "Não cabe" em 4,4:1 no tema escuro, justamente no estado de alerta máximo (revisão de 23/09/2026).
const APARENCIA: Record<ResultadoSimulacao["semaforo"], { titulo: string; tom: TomStatus }> = {
  cabe: { titulo: "Cabe", tom: "positivo" },
  apertado: { titulo: "Apertado", tom: "alerta" },
  nao_cabe: { titulo: "Não cabe", tom: "negativo" },
};

interface Props {
  resultado: ResultadoSimulacao;
  /** o capital inicial informado: a frase repete os números que decidiram */
  capital: number;
  robos: readonly RoboSimulador[];
}

/**
 * O semáforo do capital (23/09/2026): "não cabe" quando o capital fica abaixo do capital mínimo publicado
 * (sem o total, por robô sem margem configurada, abaixo da soma dos mínimos conhecidos) ou quando o
 * drawdown máximo simulado consumiria o capital inteiro; "apertado" quando cabe mas o drawdown passa de
 * LIMITE_APERTADO do capital inicial; "cabe" no resto. A regra mora em semaforoDe (lib/stats/simulador);
 * aqui só se escreve a frase que a explica, na mesma ordem das regras e sempre com os números que
 * decidiram, e o texto fixo de compliance logo abaixo.
 */
export function Semaforo({ resultado, capital, robos }: Props) {
  const { semaforo, capitalMinimo, capitalMinimoConhecido, ddMax, ddMaxPct, robosSemCapitalMinimo } = resultado;
  const aparencia = APARENCIA[semaforo];
  const limite = formatarPct(LIMITE_APERTADO, 0);
  const pct = formatarPct(ddMaxPct, 1);
  const brl = (v: number) => formatarBRL(v, { inteiro: true });
  const nomes = robosSemCapitalMinimo.map((slug) => robos.find((r) => r.slug === slug)?.nome ?? slug).join(", ");
  // sem o total (algum robô sem margem), a parte conhecida ainda é um piso que a frase cita
  const parteConhecida = capitalMinimo === null && capitalMinimoConhecido > 0;

  let frase: string;
  if (semaforo === "nao_cabe") {
    if (capitalMinimo !== null && capital < capitalMinimo) {
      frase = `O capital está abaixo do capital mínimo publicado (${brl(capitalMinimo)}) para esses robôs e contratos.`;
    } else if (capital < capitalMinimoConhecido) {
      frase = `O capital está abaixo do capital mínimo publicado só para os robôs com margem configurada (${brl(capitalMinimoConhecido)}), sem contar ${nomes}.`;
    } else {
      frase = `O drawdown máximo simulado (${brl(ddMax)}, ${pct} do capital inicial) teria consumido o capital inteiro.`;
    }
  } else if (semaforo === "apertado") {
    frase =
      capitalMinimo !== null
        ? `O capital cobre o capital mínimo publicado (${brl(capitalMinimo)}), mas o drawdown máximo simulado passou de ${limite} do capital inicial (${pct}).`
        : parteConhecida
          ? `O capital cobre a parte conhecida do capital mínimo (${brl(capitalMinimoConhecido)}), mas o drawdown máximo simulado passou de ${limite} do capital inicial (${pct}).`
          : `O drawdown máximo simulado passou de ${limite} do capital inicial (${pct}).`;
  } else {
    frase =
      capitalMinimo !== null
        ? `O capital cobre o capital mínimo publicado (${brl(capitalMinimo)}) e o drawdown máximo simulado ficou em ${pct} do capital inicial (limite de ${limite}).`
        : parteConhecida
          ? `O capital cobre a parte conhecida do capital mínimo (${brl(capitalMinimoConhecido)}) e o drawdown máximo simulado ficou em ${pct} do capital inicial (limite de ${limite}).`
          : `O drawdown máximo simulado ficou em ${pct} do capital inicial (limite de ${limite}).`;
  }

  return (
    <section aria-label="Semáforo do capital" className="painel p-4 sm:p-5">
      {/* o título da seção é o rótulo (na lista de títulos do leitor de tela lê-se "Semáforo do capital",
          não a palavra solta do estado); a pílula e a frase ficam numa região viva, para quem muda o
          capital pelo teclado ouvir o estado novo sem sair do campo */}
      <h2 className="rotulo-metrica">
        <RotuloComInfo chave="semaforoCapital">Semáforo do capital</RotuloComInfo>
      </h2>
      <div role="status" aria-live="polite">
        <p className="mt-2">
          <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold", classesDoTom(aparencia.tom))}>
            <span aria-hidden className="size-2 rounded-full bg-current" />
            {aparencia.titulo}
          </span>
        </p>
        <p className="mt-3 text-sm text-pretty">{frase}</p>
        {robosSemCapitalMinimo.length > 0 ? (
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Capital mínimo não configurado para: {nomes}. O semáforo usou a soma dos mínimos conhecidos como piso e o drawdown
            simulado.
          </p>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{TEXTO_FIXO_SIMULADOR}</p>
    </section>
  );
}
