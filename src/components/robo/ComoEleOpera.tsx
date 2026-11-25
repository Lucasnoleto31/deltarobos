import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Valor } from "@/components/compartilhados/Valor";
import { ListaKpi, type ItemKpi } from "@/components/desempenho/CardsKpi";
import { formatarBRL, formatarData, formatarDuracao, formatarNumero } from "@/lib/formato";
import { casasDosAcertos, type ComoOpera, type PregoesOperados } from "@/lib/stats/como-opera";
import { VAZIO_DO_PERIODO } from "./periodos-resumo";

interface Props {
  /** as contas do histórico inteiro (comoOpera, em lib/stats/como-opera) */
  como: ComoOpera;
  /** a duração típica de uma operação, em segundos; nula quando nenhuma foi medida (histórico importado) */
  duracaoSeg: number | null;
  /** em quantos pregões operou, contra os que a bolsa teve quando o calendário de feriados cobre o histórico */
  pregoes: PregoesOperados;
  /** o máximo de entradas abertas ao mesmo tempo e quando foi (capitalDoRobo); nulo sem medição */
  entradas: { maximo: number; em: string } | null;
  className?: string;
}

// A duração é a mediana das operações medidas (duracaoTipica): o texto do glossário fala em tempo médio
const TEXTO_DA_DURACAO =
  "Quanto dura uma operação típica, da entrada à saída: metade das operações dura menos do que isso e metade dura mais. Mostra se o robô fica segundos, minutos ou horas com uma operação aberta.";

/**
 * "Como ele opera", na aba Resumo do robô (revisão de 25/11/2026, DESIGN.md seção 9): o jeito do robô em uma
 * lista, uma linha por número, cada um com a frase que o explica. Entrou no lugar de "Mais números".
 *
 * - Acertos vêm sempre com o necessário para empatar: 83 de cada 100 não diz nada sem saber que ele precisa
 *   de 81, porque o ganho típico é pequeno e a perda típica é grande. Os dois tamanhos vêm logo abaixo, em R$.
 * - O resultado médio por operação vem com o custo considerado: é a folga contra custo e execução na conta
 *   de quem vai usar.
 * - O ritmo: operações por dia, quanto dura uma operação, em quantos pregões operou e quantas entradas chega
 *   a ter abertas ao mesmo tempo ("1 contrato" é por entrada).
 *
 * Saíram, com a revisão: média por mês, retorno sobre o capital, a razão entre ganho médio e perda média, o
 * melhor dia e as sequências. O que o sistema não mediu não aparece: sem horário de entrada (histórico
 * importado) não há duração nem entradas abertas, e sem calendário de feriados do período não há comparação
 * com os pregões da bolsa. Tudo com 1 contrato por entrada e já descontados os custos.
 */
export function ComoEleOpera({ como: c, duracaoSeg, pregoes, entradas, className }: Props) {
  if (c.operacoes === 0 || c.acertos === null) {
    return <p className="py-6 text-sm text-muted-foreground">{VAZIO_DO_PERIODO.tudo}</p>;
  }

  // "83 de cada 100" e "81": inteiros, ou com uma casa quando os dois arredondariam para o mesmo número
  const casas = casasDosAcertos(c.acertos, c.paraEmpatar);
  const de100 = {
    acertos: formatarNumero(c.acertos * 100, casas),
    paraEmpatar: c.paraEmpatar === null ? null : formatarNumero(c.paraEmpatar * 100, casas),
  };
  const itens: ItemKpi[] = [
    {
      rotulo: "Acertos",
      info: "taxaAcerto",
      valor: `${de100.acertos} de cada 100`,
      detalhe:
        de100.paraEmpatar !== null ? (
          // o "só para empatar" abre a explicação: é a metade da frase que o leigo não conhece
          <RotuloComInfo chave="acertoParaEmpatar">{`precisa de ${de100.paraEmpatar} só para empatar`}</RotuloComInfo>
        ) : c.perdaTipica === null
            ? "nenhuma operação terminou com perda até aqui"
            : "nenhuma operação terminou com ganho até aqui",
    },
  ];

  if (c.fatorLucro !== null) {
    itens.push({
      rotulo: "Fator de lucro",
      info: "fatorLucro",
      valor: formatarBRL(c.fatorLucro),
      detalhe: "o que ganhou para cada R$ 1 perdido, somando todas as operações",
    });
  }
  if (c.ganhoTipico !== null) {
    itens.push({
      rotulo: "Ganho típico",
      info: "ganhoMedio",
      valor: <Valor valor={c.ganhoTipico} />,
      detalhe: "o tamanho médio de uma operação que termina com ganho",
    });
  }
  if (c.perdaTipica !== null) {
    itens.push({
      rotulo: "Perda típica",
      info: "perdaMedia",
      valor: <Valor valor={c.perdaTipica} />,
      detalhe: "o tamanho médio de uma operação que termina com perda",
    });
  }
  if (c.maiorPerda !== null) {
    itens.push({
      rotulo: "Maior perda numa operação",
      info: "maiorPerda",
      valor: <Valor valor={c.maiorPerda.valor} inteiro={Math.abs(c.maiorPerda.valor) >= 1000} />,
      detalhe: `em ${formatarData(c.maiorPerda.dia)}`,
    });
  }
  if (c.porOperacao !== null) {
    itens.push({
      rotulo: "Resultado médio por operação",
      info: "resultadoPorOperacao",
      valor: <Valor valor={c.porOperacao.resultado} />,
      detalhe:
        c.porOperacao.custo > 0
          ? `o custo considerado é ${formatarBRL(c.porOperacao.custo)} por operação`
          : "o histórico não tem custo descontado",
    });
  }
  if (c.operacoesPorDia !== null) {
    itens.push({
      rotulo: "Operações por dia",
      valor: formatarNumero(c.operacoesPorDia, c.operacoesPorDia >= 10 ? 0 : 1),
      detalhe: "nos pregões em que operou",
    });
  }
  if (duracaoSeg !== null) {
    itens.push({
      rotulo: "Duração típica",
      info: "duracaoMedia",
      infoTexto: TEXTO_DA_DURACAO,
      valor: formatarDuracao(duracaoSeg),
      detalhe: "da entrada à saída de uma operação",
    });
  }
  if (pregoes.operou > 0 && pregoes.de && pregoes.ate) {
    const intervalo = `de ${formatarData(pregoes.de)} a ${formatarData(pregoes.ate)}`;
    itens.push(
      pregoes.daBolsa !== null
        ? {
            rotulo: "Pregões em que operou",
            info: "pregoesOperados",
            valor: `${formatarNumero(pregoes.operou)} de ${formatarNumero(pregoes.daBolsa)}`,
            detalhe: `dos pregões que a bolsa teve ${intervalo}`,
          }
        : { rotulo: "Pregões em que operou", valor: formatarNumero(pregoes.operou), detalhe: intervalo },
    );
  }
  if (entradas !== null) {
    itens.push(
      entradas.maximo > 1
        ? {
            rotulo: "Entradas abertas ao mesmo tempo",
            info: "entradasAbertas",
            valor: `até ${formatarNumero(entradas.maximo)}`,
            detalhe: `o máximo foi em ${formatarData(entradas.em)}; cada entrada usa 1 contrato`,
          }
        : {
            rotulo: "Entradas abertas ao mesmo tempo",
            info: "entradasAbertas",
            valor: "1 por vez",
            detalhe: "nunca teve mais de uma entrada aberta",
          },
    );
  }

  return <ListaKpi itens={itens} className={className} />;
}
