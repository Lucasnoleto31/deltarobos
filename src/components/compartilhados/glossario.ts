import { formatarPct } from "@/lib/formato";
import { LOTE_POR_CLASSE } from "@/lib/stats/faixas";

/**
 * O que é cada indicador do site, em português do dia a dia (19/09/2026, Artur: "em todos os cards deve ter
 * uma info sobre o que é" e "as explicações devem ser de fácil entendimento, para qualquer leigo entender").
 * O InfoIndicador mostra o nome em negrito e o texto ao lado do rótulo.
 *
 * Regras do texto (glossario.test.ts confere as mecânicas): uma ou duas frases curtas, para quem nunca
 * operou; o que o número mede e como ler; sem fórmula com símbolos, sem sigla sem explicar, sem marketing,
 * sem exclamação e sem começar repetindo o nome. Cada texto foi conferido contra a conta em src/lib/stats:
 * se a conta mudar, o texto muda junto. A conta completa, com as fórmulas, fica na metodologia.
 */
export type ChaveIndicador =
  // resultado
  | "acumulado"
  | "resultadoPeriodo"
  | "resultadoDia"
  | "mesAtual"
  | "resultadoMes"
  | "mediaMensal"
  | "retorno"
  | "melhorRobo"
  // operações
  | "operacoes"
  | "operacoesDia"
  | "duracaoMedia"
  | "taxaAcerto"
  | "gainsLosses"
  | "fatorLucro"
  | "payoff"
  | "ganhoMedio"
  | "perdaMedia"
  | "maiorGanho"
  | "maiorPerda"
  | "maiorSequencia"
  // dias
  | "diasPregao"
  | "melhorDia"
  | "piorDia"
  | "diasPositivosNegativos"
  | "diasPositivos"
  | "diasNegativos"
  | "sequenciaDiasNegativos"
  | "volatilidade"
  // risco e capital
  | "drawdown"
  | "drawdownPct"
  | "tempoEmDrawdown"
  | "tempoRecuperacao"
  | "recuperacaoMedia"
  | "calmar"
  | "recoveryFactor"
  | "ulcer"
  | "riscoRuina"
  | "capitalReferencia"
  | "capitalMinimo"
  // o dia por dentro
  | "mep"
  | "men"
  | "mfe"
  | "mae"
  | "flutuante"
  | "posicionados"
  | "operacoesEmAberto"
  // base dos números
  | "pontos"
  | "valorPonto"
  | "bruto"
  | "liquido"
  | "custos"
  | "porContrato"
  | "contratosPadrao"
  // faixas
  | "faixa"
  | "score"
  | "lote"
  | "classeLigar"
  | "classeCautela"
  | "classeNeutro"
  | "classeEvitar"
  | "semAmostra"
  | "amostraMinima"
  | "recuperacaoFaixa"
  | "drawdownFaixa"
  | "ddRelativo"
  | "medianaDrawdown"
  | "expectativaOperacao"
  | "totalFaixa"
  | "mesesPositivos"
  // gráficos e quadros
  | "curvaCapital"
  | "curvaDoDia"
  | "resultadoMensal"
  | "mapaMeses"
  | "porAtivo"
  | "porDiaSemana"
  | "porHora"
  | "histograma"
  | "melhoresDias"
  | "pioresDias"
  | "abaixoDoPico"
  | "maioresDrawdowns"
  | "profundidade"
  | "quemRendeuMais"
  | "mapaFaixas"
  | "distribuicaoFaixas"
  | "melhoresFaixas";

export interface EntradaGlossario {
  /** como o indicador se chama na tela; vai em negrito no balão e no aria-label "O que é …" */
  nome: string;
  texto: string;
}

// o lote de cada classe sai da mesma constante que a aba Faixas usa, para o texto não descolar dela
const lote = (c: keyof typeof LOTE_POR_CLASSE) => formatarPct(LOTE_POR_CLASSE[c], 0);

export const GLOSSARIO: Record<ChaveIndicador, EntradaGlossario> = {
  // ── resultado ────────────────────────────────────────────────────────────────────────────────────
  acumulado: {
    nome: "Resultado acumulado",
    texto: "Soma de tudo o que o robô ganhou e perdeu desde a primeira operação registrada no site, já descontados os custos.",
  },
  resultadoPeriodo: {
    nome: "Resultado do período",
    texto: "Soma dos ganhos menos as perdas de todas as operações fechadas no intervalo escolhido. Positivo quer dizer que o robô terminou o período no lucro.",
  },
  resultadoDia: {
    nome: "Resultado do dia",
    texto: "Quanto o robô ganhou ou perdeu nas operações fechadas naquele pregão, já descontados os custos.",
  },
  mesAtual: {
    nome: "Mês atual",
    texto: "Resultado das operações fechadas do dia 1º deste mês até hoje, já descontados os custos.",
  },
  resultadoMes: {
    nome: "Resultado do mês",
    texto: "Soma do resultado de todos os pregões do mês mostrado, já descontados os custos.",
  },
  mediaMensal: {
    nome: "Média mensal",
    texto: "O resultado acumulado dividido pelo número de meses em que o robô operou. Mostra quanto ele rendeu, em média, por mês.",
  },
  retorno: {
    nome: "Retorno sobre o capital",
    texto: "O resultado do período em porcentagem do capital de referência. Mostra quanto o dinheiro separado para o robô cresceu ou encolheu.",
  },
  melhorRobo: {
    nome: "Melhor robô",
    texto: "O robô com o maior resultado por contrato no dia, já descontados os custos.",
  },

  // ── operações ────────────────────────────────────────────────────────────────────────────────────
  operacoes: {
    nome: "Operações",
    texto: "Quantas vezes o robô entrou no mercado e saiu. Cada operação vai da entrada até a posição zerar.",
  },
  operacoesDia: {
    nome: "Operações por dia",
    texto: "Média de operações em cada pregão em que o robô operou. Mostra se ele opera pouco ou muito num dia.",
  },
  duracaoMedia: {
    nome: "Duração média",
    texto: "Tempo médio entre a entrada e a saída de cada operação.",
  },
  taxaAcerto: {
    nome: "Taxa de acerto",
    texto: "Parte das operações que terminou com lucro depois dos custos. Sozinha não diz se o robô ganha dinheiro: depende também do tamanho dos ganhos e das perdas.",
  },
  gainsLosses: {
    nome: "Gains e losses",
    texto: "Operações que terminaram no lucro (gains) e no prejuízo (losses), já descontados os custos. Uma operação que ganha menos que o custo conta como loss.",
  },
  fatorLucro: {
    nome: "Fator de lucro",
    texto: "Quanto o robô ganhou para cada real que perdeu, somando todas as operações. Acima de 1, ganhou mais do que perdeu.",
  },
  payoff: {
    nome: "Payoff",
    texto: "Tamanho do ganho médio comparado com a perda média. Payoff 2 quer dizer que cada gain vale, em média, o dobro de cada loss; quanto menor, mais o robô precisa acertar para lucrar.",
  },
  ganhoMedio: {
    nome: "Ganho médio",
    texto: "Quanto o robô ganha, em média, numa operação que termina no lucro.",
  },
  perdaMedia: {
    nome: "Perda média",
    texto: "Quanto o robô perde, em média, numa operação que termina no prejuízo.",
  },
  maiorGanho: {
    nome: "Maior ganho",
    texto: "O resultado da melhor operação do período.",
  },
  maiorPerda: {
    nome: "Maior perda",
    texto: "O resultado da pior operação do período. Mostra o maior prejuízo que o robô teve numa operação só.",
  },
  maiorSequencia: {
    nome: "Maior sequência",
    texto: "O maior número de gains seguidos e de losses seguidos, contando uma operação depois da outra na ordem em que fecharam. Uma operação zerada interrompe a contagem.",
  },

  // ── dias ─────────────────────────────────────────────────────────────────────────────────────────
  diasPregao: {
    nome: "Dias de pregão",
    texto: "Quantos dias de bolsa aberta tiveram pelo menos uma operação do robô. Fins de semana e feriados não contam.",
  },
  melhorDia: {
    nome: "Melhor dia",
    texto: "O pregão com o maior resultado somado no período, e a data em que aconteceu.",
  },
  piorDia: {
    nome: "Pior dia",
    texto: "O pregão com o menor resultado somado no período, e a data em que aconteceu.",
  },
  diasPositivosNegativos: {
    nome: "Dias positivos e negativos",
    texto: "Quantos pregões terminaram no lucro e quantos terminaram no prejuízo. Dias que fecharam zerados não entram em nenhum dos dois.",
  },
  diasPositivos: {
    nome: "Dias positivos",
    texto: "Parte dos pregões que terminaram no lucro, já descontados os custos.",
  },
  diasNegativos: {
    nome: "Dias negativos",
    texto: "Quantos pregões terminaram no prejuízo, e que parte do total isso representa.",
  },
  sequenciaDiasNegativos: {
    nome: "Maior sequência de dias negativos",
    texto: "O maior número de pregões seguidos que terminaram no prejuízo. Mostra quanto tempo seguido o robô já passou perdendo.",
  },
  volatilidade: {
    nome: "Volatilidade diária",
    texto: "Quanto o resultado de um dia costuma se afastar da média dos dias. Quanto maior, mais o resultado varia de um dia para o outro.",
  },

  // ── risco e capital ──────────────────────────────────────────────────────────────────────────────
  drawdown: {
    nome: "Drawdown máximo",
    texto: "A maior queda do saldo desde um topo até o fundo seguinte, antes de voltar a subir. Mostra o tamanho do pior momento.",
  },
  drawdownPct: {
    nome: "Drawdown máximo em % do capital",
    texto: "A maior queda do saldo, de um topo até o fundo seguinte, em porcentagem do capital de referência. Mostra que parte desse capital a pior fase consumiu.",
  },
  tempoEmDrawdown: {
    nome: "Tempo em drawdown",
    texto: "Parte dos pregões em que o saldo estava abaixo do maior valor já alcançado. Quanto menor, menos tempo o robô passa recuperando perdas.",
  },
  tempoRecuperacao: {
    nome: "Tempo de recuperação",
    texto: "Quantos dias corridos o saldo levou para voltar ao topo depois da maior queda. Enquanto não volta, aparece em recuperação.",
  },
  recuperacaoMedia: {
    nome: "Recuperação média",
    texto: "Quantos dias corridos, em média, o saldo levou para voltar ao topo depois de cada queda. Só conta as quedas que já foram recuperadas.",
  },
  calmar: {
    nome: "Calmar",
    texto: "Quanto o robô renderia em um ano, no ritmo do período, comparado com a maior queda. Acima de 1, o ganho estimado para um ano é maior que o pior drawdown.",
  },
  recoveryFactor: {
    nome: "Recovery factor",
    texto: "Quantas vezes o lucro do período cobre a maior queda. Acima de 1, o robô já ganhou mais do que perdeu no pior momento.",
  },
  ulcer: {
    nome: "Ulcer index",
    texto: "Mede ao mesmo tempo a profundidade e a duração das quedas do saldo. Quanto menor, mais estável foi a curva; quanto maior, mais tempo o saldo passou bem abaixo do topo.",
  },
  // honesto sobre o zero (19/09/2026, "o risco de ruína está zero, pq?"): riscoDeRuina em lib/stats/risco
  // eleva a razão de perda a capital ÷ perda média, que passa de centenas; sem sequência de perdas, some
  riscoRuina: {
    nome: "Risco de ruína",
    texto: "Estimativa da chance de perder todo o capital de referência, supondo toda perda do tamanho da perda média e cada operação sem relação com a anterior. Como perdas reais costumam vir juntas em dias ruins, pode dar perto de zero mesmo com drawdown grande.",
  },
  capitalReferencia: {
    nome: "Capital de referência",
    texto: "Valor de conta usado como base para operar o robô com 1 contrato. As porcentagens do site, como retorno e drawdown em %, são calculadas sobre ele.",
  },
  capitalMinimo: {
    nome: "Capital mínimo",
    texto: "Quanto ter na conta para operar 1 contrato: a margem exigida pela corretora mais o maior drawdown já visto, com uma folga de segurança. Quedas futuras podem ser maiores.",
  },

  // ── o dia por dentro ─────────────────────────────────────────────────────────────────────────────
  // 22/09/2026: duas fontes. Nos dias que o coletor 1.1.0 acompanhou, o número é medido no MetaTrader a
  // cada movimento do preço, com a posição aberta (o mesmo do Profit); nos outros, é conferido a cada
  // operação fechada (lib/stats/operacoes, excursaoDoDia). A tela diz qual foi a fonte do dia mostrado.
  mep: {
    nome: "MEP (máxima exposição positiva)",
    texto: "O ponto mais alto que o saldo do dia alcançou. Nos dias que o coletor acompanhou, é medido a cada movimento do preço, com a posição aberta; nos outros, conferido a cada operação fechada.",
  },
  men: {
    nome: "MEN (máxima exposição negativa)",
    texto: "O ponto mais baixo que o saldo do dia alcançou: o quanto o dia chegou a ficar no prejuízo. Nos dias que o coletor acompanhou, é medido a cada movimento do preço; nos outros, a cada operação fechada.",
  },
  mfe: {
    nome: "MFE (máxima excursão favorável)",
    texto: "O máximo que o preço andou a favor da operação enquanto ela esteve aberta, em pontos por contrato, medido no MetaTrader a cada movimento. Mostra quanto a operação chegou a ter de lucro antes de fechar.",
  },
  mae: {
    nome: "MAE (máxima excursão adversa)",
    texto: "O máximo que o preço andou contra a operação enquanto ela esteve aberta, em pontos por contrato, medido no MetaTrader a cada movimento. Mostra o quanto a operação chegou a ficar no prejuízo antes de fechar.",
  },
  flutuante: {
    nome: "Flutuante",
    texto: "Resultado da operação que ainda está aberta, se ela fosse encerrada agora. Muda a cada movimento do preço e só vira resultado quando a operação fecha.",
  },
  posicionados: {
    nome: "Posicionados",
    texto: "Quantos robôs estão com pelo menos uma operação aberta neste momento, esperando a saída.",
  },
  // 21/09/2026: o contador da barra, dos cards, do Hoje ao vivo e da tela Ao vivo. Conta entradas, nunca
  // contratos (spec §6: nada de volume na conta pública)
  operacoesEmAberto: {
    nome: "Operações em aberto",
    texto: "Cada entrada que o robô fez e ainda não fechou conta 1, mesmo que seja no mesmo ativo e no mesmo sentido. Não é a quantidade de contratos: é quantas operações estão esperando a saída neste momento.",
  },

  // ── base dos números ─────────────────────────────────────────────────────────────────────────────
  pontos: {
    nome: "Pontos",
    texto: "Quanto o preço andou a favor ou contra nas operações, antes de converter em reais. No mini índice, cada ponto vale 20 centavos por contrato.",
  },
  valorPonto: {
    nome: "Valor do ponto",
    texto: "Quanto vale, em reais, cada ponto que o preço anda, para 1 contrato. No mini índice são 20 centavos.",
  },
  bruto: {
    nome: "Bruto",
    texto: "Resultado das operações como a plataforma informa, antes de descontar corretagem e taxas da bolsa.",
  },
  liquido: {
    nome: "Líquido",
    texto: "Resultado depois de descontar o custo de cada operação, como corretagem e taxas da bolsa. É a base padrão dos números do site.",
  },
  custos: {
    nome: "Custos",
    texto: "Corretagem e taxas da bolsa cobradas a cada operação, num valor fixo por contrato. São a diferença entre o bruto e o líquido.",
  },
  porContrato: {
    nome: "Por contrato",
    texto: "Todo resultado é dividido pela quantidade de contratos de cada operação. Assim dá para comparar robôs e multiplicar pelo número de contratos que você pretende usar.",
  },
  contratosPadrao: {
    nome: "Contratos padrão",
    texto: "Quantos contratos o robô costuma usar em cada operação. Os resultados do site aparecem sempre por 1 contrato.",
  },

  // ── faixas ───────────────────────────────────────────────────────────────────────────────────────
  faixa: {
    nome: "Faixa",
    texto: "Uma combinação de dia da semana e hora de entrada, como segunda às 10h. Cada faixa junta as operações que começaram naquele dia e hora.",
  },
  score: {
    nome: "Score",
    texto: "Nota de 0 a 100 que só serve para ordenar as faixas. Metade vem de quanto a faixa ganha por operação em comparação com as outras, 30 pontos da regularidade mês a mês e 20 da quantidade de operações.",
  },
  lote: {
    nome: "Lote sugerido",
    texto: `Quanto do tamanho normal da posição usar em cada faixa: ${lote("ligar")} em Ligar, ${lote("cautela")} em Cautela, ${lote("neutro")} em Neutro e ${lote("evitar")} em Evitar.`,
  },
  classeLigar: {
    nome: "Ligar",
    texto: "Faixa que passou nos três critérios das regras: acerta bastante, o lucro cobre bem a pior queda e essa queda não é muito maior que a das outras faixas.",
  },
  classeCautela: {
    nome: "Cautela",
    texto: "Faixa com acerto e recuperação razoáveis, mas que não passou em todos os critérios de Ligar. A sugestão é operar com lote menor.",
  },
  classeNeutro: {
    nome: "Neutro",
    texto: "Faixa com amostra suficiente que não chegou aos mínimos de Cautela nem caiu nos limites de Evitar. A sugestão é operar com lote bem reduzido.",
  },
  classeEvitar: {
    nome: "Evitar",
    texto: "Faixa que falhou em pelo menos um limite: acerta pouco, o lucro não cobre a pior queda ou essa queda é muito maior que a das outras faixas. A sugestão é não operar.",
  },
  semAmostra: {
    nome: "Sem amostra",
    texto: "Faixa com menos operações que o mínimo exigido. Fica sem classificação, porque com tão poucas operações o resultado pode ser sorte ou azar.",
  },
  amostraMinima: {
    nome: "Amostra mínima",
    texto: "Quantidade mínima de operações que uma faixa precisa ter para ser classificada. Com menos que isso, o resultado pode ser sorte ou azar.",
  },
  recuperacaoFaixa: {
    nome: "Recuperação",
    texto: "Quantas vezes o lucro da faixa cobre a maior queda dela, contando uma operação depois da outra. Acima de 1, o lucro já pagou a pior queda; sem queda nenhuma, aparece ∞.",
  },
  drawdownFaixa: {
    nome: "Drawdown da faixa",
    texto: "A maior queda do resultado desta faixa, somando as operações dela uma depois da outra.",
  },
  ddRelativo: {
    nome: "Drawdown relativo",
    texto: "Compara a pior queda desta faixa com a queda típica das faixas. 1 é igual à típica, 2 é o dobro; quanto maior, mais esta faixa cai em comparação com as outras.",
  },
  medianaDrawdown: {
    nome: "Mediana de drawdown",
    texto: "A queda típica das faixas: pondo a pior queda de cada faixa em ordem, é a que fica no meio. Serve de base para o drawdown relativo.",
  },
  expectativaOperacao: {
    nome: "Expectativa por operação",
    texto: "Quanto a faixa ganhou ou perdeu, em média, por operação, já com custos. Positiva quer dizer que, no histórico, operar ali deu lucro.",
  },
  totalFaixa: {
    nome: "Total da faixa",
    texto: "Soma do resultado de todas as operações da faixa, já descontados os custos.",
  },
  mesesPositivos: {
    nome: "Meses positivos",
    texto: "Em quantos dos meses com operação a faixa terminou no lucro. Mostra se o resultado é regular ou veio de poucos meses bons.",
  },

  // ── gráficos e quadros ───────────────────────────────────────────────────────────────────────────
  curvaCapital: {
    nome: "Curva de capital",
    texto: "O saldo somado dia após dia, ou operação após operação. Subindo, o robô está ganhando; as descidas são os drawdowns.",
  },
  curvaDoDia: {
    nome: "Curva do dia",
    texto: "O saldo do dia somado operação por operação, na ordem em que fecharam. Mostra o caminho do dia, e não só como ele terminou.",
  },
  resultadoMensal: {
    nome: "Resultado mensal",
    texto: "Quanto o robô ganhou ou perdeu em cada mês, já descontados os custos.",
  },
  mapaMeses: {
    nome: "Resultado mensal por ano",
    texto: "Quanto o robô ganhou ou perdeu em cada mês, com um ano por linha. Quanto mais forte a cor, maior o lucro ou o prejuízo do mês.",
  },
  porAtivo: {
    nome: "Resultado por ativo",
    texto: "Quanto o robô ganhou ou perdeu em cada código de contrato negociado. O código muda a cada vencimento, então cada linha cobre um período diferente.",
  },
  porDiaSemana: {
    nome: "Por dia da semana",
    texto: "Resultado somado das operações de cada dia da semana. Mostra se o robô costuma ir melhor ou pior em algum dia.",
  },
  porHora: {
    nome: "Por hora de entrada",
    texto: "Resultado somado das operações pela hora em que começaram. Mostra em que horários o robô costuma ganhar ou perder.",
  },
  histograma: {
    nome: "Resultado por operação",
    texto: "Quantas operações terminaram em cada faixa de resultado, da maior perda ao maior ganho. Mostra se os resultados ficam em valores pequenos ou se há extremos.",
  },
  melhoresDias: {
    nome: "Melhores dias",
    texto: "Os pregões com o maior resultado, com o número de operações de cada um.",
  },
  pioresDias: {
    nome: "Piores dias",
    texto: "Os pregões com o menor resultado, com o número de operações de cada um.",
  },
  abaixoDoPico: {
    nome: "Abaixo do pico",
    texto: "Quanto o saldo estava abaixo do maior valor já alcançado, em cada dia. No zero, o robô está no topo; quanto mais fundo, maior a queda naquele momento.",
  },
  maioresDrawdowns: {
    nome: "Maiores drawdowns",
    texto: "As maiores quedas do saldo, com o dia em que começaram, o fundo e a volta ao topo. Aberto quer dizer que o saldo ainda não voltou.",
  },
  profundidade: {
    nome: "Distribuição por profundidade",
    texto: "Quantas quedas do saldo tiveram cada tamanho, das mais rasas às mais fundas.",
  },
  quemRendeuMais: {
    nome: "Quem rendeu mais",
    texto: "Resultado de cada robô no período escolhido, por 1 contrato e já com custos, do maior para o menor.",
  },
  mapaFaixas: {
    nome: "Mapa de faixas",
    texto: "Cada quadrado é um dia da semana numa hora de entrada, com a classificação pelas regras, o número de operações e a taxa de acerto.",
  },
  distribuicaoFaixas: {
    nome: "Distribuição das faixas",
    texto: "Quantas faixas caíram em cada classificação. As que não têm a amostra mínima ficam fora da conta.",
  },
  melhoresFaixas: {
    nome: "Melhores faixas",
    texto: "As faixas classificadas como Ligar com o maior score. Se nenhuma for Ligar, aparecem as de maior score entre todas.",
  },
};
