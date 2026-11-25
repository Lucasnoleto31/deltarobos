import { cn } from "cn";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import type { ResultadoSimulacao, RoboSimulador } from "@/lib/stats/simulador";
import { oQueEOCapitalMinimoDaEscolha, respostaDoSimulador, type RespostaDoSimulador } from "./serie-simulada";

/**
 * O texto fixo de compliance do simulador. Vai uma vez, debaixo do título da página, onde aparece com ou
 * sem capital informado (ficha Mesa, 25/11/2026: o que repete outro lugar da tela sai; até então vinha
 * também junto do semáforo).
 */
export const TEXTO_FIXO_SIMULADOR = "Aritmética sobre o histórico; não é recomendação nem projeção de resultado.";

// A cor da palavra que responde. Verde não entra: na ficha Mesa verde é só de ganho, e um "Cabe" verde se lê
// como recomendação. "Apertado" leva a cor de atenção e "Não cabe" a de perda (é o caso em que a maior queda
// ou o mínimo passam do capital); "Cabe", o capital mínimo e o "não dá para avaliar" ficam na cor do texto.
const COR: Record<RespostaDoSimulador["estado"], string> = {
  cabe: "text-foreground",
  apertado: "text-alerta",
  nao_cabe: "text-negativo",
  sem_avaliacao: "text-foreground",
  minimo: "text-foreground",
};

const TERMO = /capital mínimo/i;

interface Props {
  resultado: ResultadoSimulacao;
  /** o capital da simulação: o digitado ou, sem ele, o capital mínimo da escolha */
  capital: number;
  /** false = ninguém digitou capital */
  digitado: boolean;
  /** os robôs e contratos escolhidos em palavras: "1 contrato por entrada em cada um dos 3 robôs" */
  escolha: string;
  robos: readonly RoboSimulador[];
  /** o fator da regra publicada do capital mínimo: só para o "o que é" */
  fatorSeguranca: number;
  className?: string;
}

/**
 * A resposta do simulador, a primeira coisa da tela depois do campo de capital (25/11/2026, DESIGN.md seção
 * 9): "Cabe", "Apertado" ou "Não cabe" em uma palavra, e uma frase com os números que decidem. "Não cabe"
 * quando o capital fica abaixo do capital mínimo dos robôs e contratos escolhidos ou quando a maior queda
 * simulada consumiria o capital inteiro; "apertado" quando cabe mas a maior queda passa de LIMITE_APERTADO do
 * capital; "cabe" no resto. Com algum robô escolhido sem capital mínimo (sem garantia cadastrada ou sem a
 * leitura das entradas abertas), "Não dá para avaliar se cabe", com o motivo. A regra mora em semaforoDe
 * (lib/stats/simulador) e a frase em respostaDoSimulador (serie-simulada), com teste; aqui é só o desenho.
 *
 * Era uma frase pequena debaixo do número grande, sem os números. Subiu para antes do resultado e ganhou o
 * capital mínimo e o quanto falta: o capital mínimo saiu da lista de fatos, para não aparecer duas vezes. O
 * próprio termo "capital mínimo" abre a explicação da conta. "Pelo histórico" vai junto da palavra para
 * ninguém ler "cabe" como garantia. Sem capital digitado, o título é o capital mínimo da escolha.
 */
export function Semaforo({ resultado, capital, digitado, escolha, robos, fatorSeguranca, className }: Props) {
  const resposta = respostaDoSimulador({
    semaforo: resultado.semaforo,
    capital,
    digitado,
    capitalMinimo: resultado.capitalMinimo,
    capitalMinimoConhecido: resultado.capitalMinimoConhecido,
    capitalQueFalta: resultado.capitalQueFalta,
    ddMax: resultado.ddMax,
    escolha,
    semMinimo: resultado.robosSemCapitalMinimo.map((slug) => {
      const robo = robos.find((r) => r.slug === slug);
      return { nome: robo?.nome ?? slug, porque: robo?.semMinimoPorque ?? "garantia" };
    }),
  });

  // o "o que é" do glossário fala de 1 robô com 1 contrato; aqui é a soma da escolha
  const oQueE = oQueEOCapitalMinimoDaEscolha(fatorSeguranca);
  // o termo aparece uma vez, no título (sem capital digitado) ou na frase, e é ele que abre a explicação
  const comOQueE = (texto: string) => {
    const achado = TERMO.exec(texto);
    if (!achado) return texto;
    return (
      <>
        {texto.slice(0, achado.index)}
        <RotuloComInfo chave="capitalMinimo" texto={oQueE}>
          {achado[0]}
        </RotuloComInfo>
        {texto.slice(achado.index + achado[0].length)}
      </>
    );
  };

  return (
    // região viva: quem muda o capital pelo teclado ouve a resposta nova sem sair do campo
    <div role="status" aria-live="polite" className={cn("max-w-3xl", className)}>
      <p className="text-[1.375rem] leading-tight font-medium tracking-tight">
        {resposta.estado === "minimo" ? (
          comOQueE(resposta.titulo)
        ) : resposta.estado === "sem_avaliacao" ? (
          // não é veredito: sem o ", pelo histórico"
          <span className={COR.sem_avaliacao}>{resposta.titulo}</span>
        ) : (
          <>
            <span className={COR[resposta.estado]}>{resposta.titulo}</span>
            <span className="font-normal text-muted-foreground">, pelo histórico</span>
          </>
        )}
      </p>
      <p className="mt-2 text-[0.9375rem] text-pretty text-muted-foreground">{resposta.estado === "minimo" ? resposta.frase : comOQueE(resposta.frase)}</p>
    </div>
  );
}
