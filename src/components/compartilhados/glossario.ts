import { formatarPct } from "@/lib/formato";
import { LOTE_POR_CLASSE } from "@/lib/stats/faixas";

/**
 * O que é cada indicador do site, em português do dia a dia (19/09/2026, Artur: "em todos os cards deve ter
 * uma info sobre o que é" e "as explicações devem ser de fácil entendimento, para qualquer leigo entender").
 * O RotuloComInfo (InfoIndicador.tsx) abre o balão com o nome em negrito e o texto embaixo.
 *
 * 25/11/2026 (ficha Mesa, DESIGN.md seção 7; Lucas: "para um leigo está muito difícil de entender"): o nome é
 * o rótulo que a tela usa ("Maior queda", "Acertos", "Nota"), porque é o título do balão que abre quando
 * alguém toca no rótulo; a tela dizia "Maior queda" e o balão abria com "Drawdown máximo". O termo técnico
 * (drawdown, payoff, MEP, MFE…) não vai no nome e aparece no texto no máximo uma vez, entre parênteses, para
 * quem o conhece de outro lugar. As chaves continuam com os nomes antigos: são usadas em toda a base.
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
  | "simulador"
  | "semaforoCapital"
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
  | "faixaSaldo"
  | "dentesExcursao"
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
  /** o rótulo que a tela usa para o indicador; é o título, em negrito, do balão que o rótulo abre */
  nome: string;
  texto: string;
}

// a parte da posição de cada classe sai da mesma constante que a aba Melhores horários usa, para o texto
// não descolar dela
const lote = (c: keyof typeof LOTE_POR_CLASSE) => formatarPct(LOTE_POR_CLASSE[c], 0);

export const GLOSSARIO: Record<ChaveIndicador, EntradaGlossario> = {
  // ── resultado ────────────────────────────────────────────────────────────────────────────────────
  acumulado: {
    nome: "Resultado desde o início",
    texto: "Soma de tudo o que o robô ganhou e perdeu desde a primeira operação registrada no site, com 1 contrato e já descontados os custos.",
  },
  resultadoPeriodo: {
    nome: "Resultado no período",
    texto: "Soma dos ganhos menos as perdas das operações fechadas no período escolhido. Positivo quer dizer que o robô terminou o período com ganho.",
  },
  resultadoDia: {
    nome: "Resultado do dia",
    texto: "Quanto o robô ganhou ou perdeu nas operações fechadas naquele dia, com 1 contrato e já descontados os custos.",
  },
  mesAtual: {
    nome: "Mês atual",
    texto: "Resultado das operações fechadas do dia 1º deste mês até hoje, com 1 contrato e já descontados os custos.",
  },
  resultadoMes: {
    nome: "Resultado do mês",
    texto: "Soma do resultado de todos os dias do mês mostrado, com 1 contrato e já descontados os custos.",
  },
  mediaMensal: {
    nome: "Média por mês",
    texto: "O resultado do período dividido pelo número de meses em que o robô operou. É uma média: não diz quanto esperar de cada mês.",
  },
  retorno: {
    nome: "Retorno sobre o capital",
    texto: "O resultado do período em porcentagem do capital de referência, o valor de conta usado como base para cada contrato. Mostra quanto esse dinheiro teria crescido ou encolhido no período.",
  },
  melhorRobo: {
    nome: "Melhor robô",
    texto: "O robô com o maior resultado no dia, com 1 contrato e já descontados os custos.",
  },

  // ── operações ────────────────────────────────────────────────────────────────────────────────────
  operacoes: {
    nome: "Operações",
    texto: "Quantas vezes o robô entrou no mercado e saiu. Cada operação vai da entrada até a saída completa.",
  },
  operacoesDia: {
    nome: "Operações por dia",
    texto: "Média de operações em cada dia em que o robô operou. Mostra se ele opera pouco ou muito num dia.",
  },
  duracaoMedia: {
    nome: "Duração média",
    texto: "Tempo médio entre a entrada e a saída de cada operação.",
  },
  taxaAcerto: {
    nome: "Acertos",
    texto: "De cada 100 operações, quantas terminaram com ganho, já descontados os custos (o mercado chama de taxa de acerto). Sozinho, não diz se o robô ganha dinheiro: depende também do tamanho dos ganhos e das perdas.",
  },
  gainsLosses: {
    nome: "Operações com ganho e com perda",
    texto: "Quantas operações terminaram com ganho e quantas com perda, já descontados os custos. Uma operação que ganha menos do que o custo conta como perda.",
  },
  fatorLucro: {
    nome: "Fator de lucro",
    texto: "Quanto o robô ganhou para cada R$ 1 perdido, somando todas as operações. Um fator de 1,13, por exemplo, quer dizer R$ 1,13 de ganho para cada R$ 1 de perda. Acima de 1, ganhou mais do que perdeu.",
  },
  payoff: {
    nome: "Ganho médio contra perda média",
    texto: "O tamanho do ganho médio comparado com o da perda média (o mercado chama de payoff). Se der 2, o ganho médio é o dobro da perda média. Quanto menor, mais o robô precisa acertar para lucrar.",
  },
  ganhoMedio: {
    nome: "Ganho médio por operação",
    texto: "Quanto o robô ganha, em média, numa operação que termina com ganho.",
  },
  perdaMedia: {
    nome: "Perda média por operação",
    texto: "Quanto o robô perde, em média, numa operação que termina com perda.",
  },
  maiorGanho: {
    nome: "Melhor operação",
    texto: "O resultado da operação que mais ganhou no período.",
  },
  maiorPerda: {
    nome: "Pior operação",
    texto: "O resultado da operação que mais perdeu no período. Mostra a maior perda que o robô teve numa operação só.",
  },
  maiorSequencia: {
    nome: "Maior sequência",
    texto: "O maior número de operações com ganho seguidas e o de operações com perda seguidas, na ordem em que fecharam. Uma operação que fecha em zero interrompe a contagem.",
  },

  // ── dias ─────────────────────────────────────────────────────────────────────────────────────────
  diasPregao: {
    nome: "Dias de pregão",
    texto: "Quantos dias de bolsa aberta tiveram pelo menos uma operação do robô. Fins de semana e feriados não contam.",
  },
  melhorDia: {
    nome: "Melhor dia",
    texto: "O dia com o maior resultado no período, com a data em que aconteceu.",
  },
  piorDia: {
    nome: "Pior dia",
    texto: "O dia com o menor resultado no período, com a data em que aconteceu.",
  },
  diasPositivosNegativos: {
    nome: "Dias com ganho e com perda",
    texto: "Quantos dias terminaram com ganho e quantos com perda. Dia que fecha em zero não entra em nenhum dos dois.",
  },
  diasPositivos: {
    nome: "Dias com ganho",
    texto: "Em quantos dias, do total de dias com operação, o robô terminou com ganho, já descontados os custos.",
  },
  diasNegativos: {
    nome: "Dias com perda",
    texto: "Em quantos dias o robô terminou com perda, e que parte do total isso representa.",
  },
  sequenciaDiasNegativos: {
    nome: "Maior sequência de dias com perda",
    texto: "O maior número de dias seguidos que terminaram com perda. Mostra quanto tempo seguido o robô já passou perdendo.",
  },
  volatilidade: {
    nome: "Variação de um dia para o outro",
    texto: "O quanto o resultado de um dia costuma se afastar da média dos dias (o mercado chama de volatilidade). Quanto maior, mais o resultado muda de um dia para o outro.",
  },

  // ── risco e capital ──────────────────────────────────────────────────────────────────────────────
  drawdown: {
    nome: "Maior queda",
    texto: "A distância do ponto mais alto que o resultado somado alcançou até o ponto mais baixo que veio depois. Mostra o tamanho do pior momento: quanto o robô chegou a devolver antes de voltar a subir (o mercado chama de drawdown).",
  },
  drawdownPct: {
    nome: "Maior queda, em % do capital",
    texto: "A maior queda, do ponto mais alto ao mais baixo que veio depois, em porcentagem do capital de referência. Mostra que parte desse capital o pior momento levou.",
  },
  tempoEmDrawdown: {
    nome: "Dias abaixo do topo",
    texto: "Em quantos dias o resultado somado estava abaixo do ponto mais alto que já tinha alcançado. Quanto menos dias, menos tempo o robô passa recuperando perdas.",
  },
  tempoRecuperacao: {
    nome: "Tempo até recuperar",
    texto: "Quantos dias corridos o resultado levou para voltar ao ponto mais alto depois da maior queda. Enquanto não volta, a tela diz que ainda não recuperou.",
  },
  recuperacaoMedia: {
    nome: "Tempo médio para recuperar",
    texto: "Quantos dias corridos, em média, o resultado levou para voltar ao ponto mais alto depois de cada queda. Só conta as quedas que já foram recuperadas.",
  },
  calmar: {
    nome: "Calmar",
    texto: "Quanto o robô renderia em um ano, no ritmo do período, comparado com a maior queda. Acima de 1, esse ganho de um ano seria maior que a maior queda. É uma conta sobre o histórico, não uma previsão.",
  },
  recoveryFactor: {
    nome: "Fator de recuperação",
    texto: "Quantas vezes o resultado do período cobre a maior queda (o mercado chama de recovery factor). Acima de 1, o robô já ganhou mais do que perdeu no pior momento.",
  },
  ulcer: {
    nome: "Índice de úlcera",
    texto: "Mede ao mesmo tempo o tamanho e a duração das quedas (o mercado chama de ulcer index). Quanto menor, mais estável foi a curva; quanto maior, mais tempo o resultado passou bem abaixo do topo.",
  },
  // honesto sobre o zero (19/09/2026, "o risco de ruína está zero, pq?"): riscoDeRuina em lib/stats/risco
  // eleva a razão de perda a capital ÷ perda média, que passa de centenas; sem sequência de perdas, some
  riscoRuina: {
    nome: "Risco de ruína",
    texto: "Estimativa da chance de perder todo o capital de referência, supondo toda perda do tamanho da perda média e cada operação sem relação com a anterior. Como perdas reais costumam vir juntas em dias ruins, pode dar perto de zero mesmo com uma queda grande.",
  },
  capitalReferencia: {
    nome: "Capital de referência",
    texto: "Valor de conta usado como base para operar o robô com 1 contrato. As porcentagens do site, como o retorno e a maior queda em %, são calculadas sobre ele.",
  },
  capitalMinimo: {
    nome: "Capital mínimo",
    texto: "Quanto ter na conta para operar 1 contrato com alguma folga: a garantia que a corretora exige (a margem) mais a maior queda que o robô já teve, aumentada por um fator de segurança. Quedas futuras podem ser maiores.",
  },
  // 23/09/2026: a página /simulador (lib/stats/simulador). Compliance: aritmética sobre o histórico, nunca
  // recomendação nem projeção; a maior queda em % é sobre o capital inicial informado; o capital mínimo é só
  // a regra já publicada na aba Quedas e risco, somada por robô × contratos
  simulador: {
    nome: "Simulador",
    texto: "Aritmética sobre o histórico: soma o resultado de cada dia de cada robô vezes os contratos escolhidos e mede a maior queda sobre o capital informado. Não é recomendação nem projeção de resultado.",
  },
  // 25/11/2026 (ficha Mesa): a tela não tem mais o painel "Semáforo do capital"; mostra uma das três
  // palavras ("Cabe", "Apertado", "Não cabe") na frente da frase, e o nome daqui são elas. O limite de 25% é
  // o LIMITE_APERTADO de lib/stats/simulador (o teste do glossário confere os dois juntos)
  semaforoCapital: {
    nome: "Cabe, apertado ou não cabe",
    texto: "Não cabe quando o capital fica abaixo do mínimo publicado ou quando a maior queda simulada levaria o capital inteiro; apertado quando cabe, mas essa queda passa de 25% do capital; cabe no resto. É uma leitura do histórico, não uma garantia.",
  },

  // ── o dia por dentro ─────────────────────────────────────────────────────────────────────────────
  // 22/09/2026: duas fontes. Nos dias que o coletor 1.1.0 acompanhou, o número é medido no MetaTrader a
  // cada movimento do preço, com a posição aberta (o mesmo do Profit); nos outros, é conferido a cada
  // operação fechada (lib/stats/operacoes, excursaoDoDia). A tela diz qual foi a fonte do dia mostrado.
  // 25/11/2026 (ficha Mesa): na tela são o melhor e o pior momento, do dia (MEP e MEN) e da operação (MFE e
  // MAE); a sigla fica uma vez no texto, entre parênteses.
  mep: {
    nome: "Melhor momento do dia",
    texto: "O ponto mais alto que o resultado do dia alcançou (o mercado chama de MEP). Nos dias medidos no MetaTrader, conta cada movimento do preço, com a operação aberta; nos outros, é conferido a cada operação fechada.",
  },
  men: {
    nome: "Pior momento do dia",
    texto: "O ponto mais baixo que o resultado do dia alcançou: quanto o dia chegou a ficar no prejuízo (o mercado chama de MEN). Nos dias medidos no MetaTrader, conta cada movimento do preço; nos outros, é conferido a cada operação fechada.",
  },
  mfe: {
    nome: "Melhor momento da operação",
    texto: "O máximo que o preço andou a favor da operação enquanto ela esteve aberta, em pontos, medido no MetaTrader a cada movimento do preço (o mercado chama de MFE). Mostra quanto ela chegou a ganhar antes de fechar.",
  },
  mae: {
    nome: "Pior momento da operação",
    texto: "O máximo que o preço andou contra a operação enquanto ela esteve aberta, em pontos, medido no MetaTrader a cada movimento do preço (o mercado chama de MAE). Mostra quanto ela chegou a perder antes de fechar.",
  },
  flutuante: {
    nome: "Resultado da operação aberta",
    texto: "Quanto a operação que ainda está aberta daria de ganho ou de perda, com 1 contrato, se fosse encerrada agora (o mercado chama de flutuante). Muda a cada movimento do preço e só vira resultado quando a operação fecha.",
  },
  posicionados: {
    nome: "Robôs em operação agora",
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
    texto: "Quanto o preço andou a favor ou contra nas operações, antes de converter em reais. No Mini Índice, cada ponto vale R$ 0,20 com 1 contrato.",
  },
  valorPonto: {
    nome: "Quanto vale 1 ponto",
    texto: "Valor, em reais, de cada ponto que o preço anda, com 1 contrato. No Mini Índice é R$ 0,20.",
  },
  bruto: {
    nome: "Antes dos custos",
    texto: "Resultado das operações como a plataforma informa, sem descontar a corretagem e as taxas da bolsa (o mercado chama de resultado bruto).",
  },
  liquido: {
    nome: "Já descontados os custos",
    texto: "Resultado depois de tirar o custo de cada operação, que é a corretagem mais as taxas da bolsa (o mercado chama de resultado líquido). É como o site mostra os números, a não ser que a tela diga antes dos custos.",
  },
  custos: {
    nome: "Custos",
    texto: "Corretagem e taxas da bolsa, cobradas a cada operação num valor fixo por contrato. O site tira esse valor de cada operação antes de mostrar o resultado.",
  },
  porContrato: {
    nome: "Com 1 contrato",
    texto: "Todo resultado é dividido pela quantidade de contratos da operação, para mostrar quanto daria com 1 contrato. Assim dá para comparar os robôs e multiplicar pelo número de contratos que você pretende usar.",
  },
  contratosPadrao: {
    nome: "Contratos por operação",
    texto: "Quantos contratos o robô costuma usar em cada operação. Os resultados do site são calculados para 1 contrato.",
  },

  // ── dias e horários ──────────────────────────────────────────────────────────────────────────────
  // 25/11/2026 (ficha Mesa): na tela, "faixa" é "dia e horário", "score" é "nota", "lote sugerido" é
  // "tamanho sugerido da posição" e "drawdown" é "maior queda" (a aba se chama Melhores horários). As
  // chaves guardam os nomes antigos.
  faixa: {
    nome: "Dia e horário",
    texto: "Uma combinação de dia da semana e hora de entrada, como segunda às 10h. Junta as operações que começaram naquele dia e naquela hora.",
  },
  score: {
    nome: "Nota",
    texto: "Vai de 0 a 100 e só serve para pôr os dias e horários em ordem. Metade vem de quanto cada um ganha por operação comparado aos outros, 30 pontos da regularidade mês a mês e 20 da quantidade de operações.",
  },
  lote: {
    nome: "Tamanho sugerido da posição",
    texto: `Que parte da quantidade normal de contratos usar em cada dia e horário, conforme a classe dele: ${lote("ligar")} em Ligar, ${lote("cautela")} em Cautela, ${lote("neutro")} em Neutro e ${lote("evitar")} em Evitar.`,
  },
  classeLigar: {
    nome: "Ligar",
    texto: "Dia e horário que passou nos três critérios das regras: acerta bastante, o resultado cobre bem a maior queda e essa queda não é muito maior que a dos outros dias e horários.",
  },
  classeCautela: {
    nome: "Cautela",
    texto: "Dia e horário que acerta razoavelmente e em que o resultado cobre boa parte da maior queda, mas que não passou em todos os critérios de Ligar. A sugestão é operar com uma posição menor.",
  },
  classeNeutro: {
    nome: "Neutro",
    texto: "Dia e horário com operações suficientes que não chegou aos mínimos de Cautela nem caiu nos limites de Evitar. A sugestão é operar com uma posição bem reduzida.",
  },
  classeEvitar: {
    nome: "Evitar",
    texto: "Dia e horário que caiu em pelo menos um limite: acerta pouco, o resultado não cobre a maior queda ou essa queda é muito maior que a dos outros. A sugestão é não operar.",
  },
  semAmostra: {
    nome: "Sem classificação",
    texto: "Dia e horário com menos operações que o mínimo exigido. Fica sem classe, porque com tão poucas operações o resultado pode ser sorte ou azar.",
  },
  amostraMinima: {
    nome: "Mínimo de operações",
    texto: "Quantas operações um dia e horário precisa ter para ser classificado. Com menos que isso, o resultado pode ser sorte ou azar.",
  },
  recuperacaoFaixa: {
    nome: "Recuperação",
    texto: "Quantas vezes o resultado do dia e horário cobre a maior queda dele, somando uma operação depois da outra. Acima de 1, o resultado já pagou a pior queda.",
  },
  drawdownFaixa: {
    nome: "Maior queda do dia e horário",
    texto: "A maior queda do resultado deste dia e horário, somando as operações dele uma depois da outra: do ponto mais alto ao mais baixo que veio depois.",
  },
  ddRelativo: {
    nome: "Queda relativa",
    texto: "Compara a maior queda deste dia e horário com a queda típica dos outros. 1 é igual à típica, 2 é o dobro; quanto maior, mais ele cai em comparação com os outros.",
  },
  medianaDrawdown: {
    nome: "Maior queda típica",
    texto: "Pondo em ordem a maior queda de cada dia e horário, é a que fica no meio. Serve de base para a queda relativa.",
  },
  expectativaOperacao: {
    nome: "Resultado médio por operação",
    texto: "Quanto o dia e horário ganhou ou perdeu, em média, por operação, já descontados os custos. Positivo quer dizer que, no histórico, operar ali deu ganho.",
  },
  totalFaixa: {
    nome: "Resultado do dia e horário",
    texto: "Soma do resultado de todas as operações que começaram neste dia e horário, já descontados os custos.",
  },
  mesesPositivos: {
    nome: "Meses com ganho",
    texto: "Em quantos dos meses com operação o dia e horário terminou com ganho. Mostra se o resultado é regular ou veio de poucos meses bons.",
  },

  // ── gráficos e quadros ───────────────────────────────────────────────────────────────────────────
  curvaCapital: {
    nome: "Curva do resultado",
    texto: "O resultado somado dia após dia, ou operação após operação. Subindo, o robô está ganhando; o trecho em vermelho é a maior queda.",
  },
  // 23/09/2026: 5 segundos é o InpSaldoBucketSeg padrão do EA 1.1.2. A curva do dia passou a ter duas fontes,
  // como o melhor e o pior momento do dia: a série do saldo medida no MetaTrader (lib/stats/saldo-dia, já
  // descontado o custo das operações fechadas) nos dias que o coletor mediu, e a soma por fechamento nos
  // outros. A área clara e os traços são os dois desenhos em cima da linha (CurvaProfit); a conta completa
  // fica na metodologia. O "5 segundos" daqui e de faixaSaldo é o input do EA, enquanto a legenda da curva
  // mostra o tamanho real inferido da série (bucketSeg): se o input mudar, estes dois textos, a Metodologia
  // e o teste do glossário (que cita "5 segundos") acompanham juntos.
  // 25/11/2026 (ficha Mesa): o nome é o título que a aba Dia a dia põe em cima do desenho ("O saldo ao longo
  // do dia"); era "Curva do dia". "Faixa do saldo" virou "Oscilação do saldo" e "Dentes de MFE e MAE",
  // "Melhor e pior momento de cada operação".
  curvaDoDia: {
    nome: "Saldo ao longo do dia",
    texto: "O resultado do dia enquanto o pregão anda. Nos dias medidos no MetaTrader, é o saldo com a operação aberta, a cada 5 segundos, já descontado o custo das operações fechadas; nos outros, a soma operação por operação, na ordem em que fecharam.",
  },
  faixaSaldo: {
    nome: "Oscilação do saldo",
    texto: "Na imagem do dia, a área clara em volta da linha: o menor e o maior valor que o saldo alcançou dentro de cada intervalo de 5 segundos. Mostra o quanto o saldo subiu e desceu entre um ponto e o outro da curva.",
  },
  dentesExcursao: {
    nome: "Melhor e pior momento de cada operação",
    texto: "O traço vertical em cada operação: vai do ponto mais baixo ao mais alto que o saldo chegou enquanto ela esteve aberta, medidos no MetaTrader a cada movimento do preço (o mercado chama de MAE e MFE). Mostra o quanto ela oscilou antes de fechar.",
  },
  resultadoMensal: {
    nome: "Resultado por mês",
    texto: "Quanto o robô ganhou ou perdeu em cada mês.",
  },
  mapaMeses: {
    nome: "Mês a mês",
    texto: "Quanto o robô ganhou ou perdeu em cada mês, com um ano por linha e o total do ano no fim. Quanto mais forte a cor, maior o ganho ou a perda do mês.",
  },
  // 25/11/2026 (ficha Mesa): a lista deixou de ser por código de contrato (WINQ26, WINV26…); os códigos são
  // juntados no ativo (components/desempenho/por-ativo)
  porAtivo: {
    nome: "Resultado por ativo",
    texto: "Quanto o robô ganhou ou perdeu em cada ativo que negociou, como Mini Índice e Mini Dólar. Os contratos de vencimentos diferentes do mesmo ativo entram somados.",
  },
  porDiaSemana: {
    nome: "Resultado por dia da semana",
    texto: "Soma do resultado das operações de cada dia da semana. Mostra se o robô costuma ir melhor ou pior em algum dia.",
  },
  porHora: {
    nome: "Resultado por horário de entrada",
    texto: "Soma do resultado das operações pela hora em que começaram. Mostra em que horários o robô costuma ganhar ou perder.",
  },
  histograma: {
    nome: "Resultado por operação",
    texto: "Quantas operações terminaram em cada tamanho de resultado, da maior perda ao maior ganho. Mostra se os resultados ficam em valores pequenos ou se há extremos.",
  },
  melhoresDias: {
    nome: "Melhores dias",
    texto: "Os dias com o maior resultado, com o número de operações de cada um.",
  },
  pioresDias: {
    nome: "Piores dias",
    texto: "Os dias com o menor resultado, com o número de operações de cada um.",
  },
  abaixoDoPico: {
    nome: "Abaixo do topo",
    texto: "Quanto o resultado somado estava abaixo do ponto mais alto já alcançado, em cada dia. No zero, o robô está no topo; quanto mais fundo, maior a queda naquele momento.",
  },
  maioresDrawdowns: {
    nome: "Maiores quedas",
    texto: "As maiores quedas do resultado, com o dia em que cada uma começou, o dia do ponto mais baixo e o da volta ao topo. Onde o resultado ainda não voltou ao topo, a tabela diz “ainda não”.",
  },
  profundidade: {
    nome: "Tamanho das quedas",
    texto: "Quantas quedas do resultado tiveram cada tamanho, das menores às maiores.",
  },
  quemRendeuMais: {
    nome: "Quem rendeu mais",
    texto: "Resultado de cada robô no período escolhido, com 1 contrato e já descontados os custos, do maior para o menor.",
  },
  mapaFaixas: {
    nome: "Mapa dos dias e horários",
    texto: "Cada quadro é um dia da semana numa hora de entrada, com a classe que as regras deram a ele pelo histórico das operações que começaram ali. O traço marca onde há operações de menos para avaliar.",
  },
  distribuicaoFaixas: {
    nome: "Dias e horários por classe",
    texto: "Quantos dias e horários caíram em cada classe. Os que não têm o mínimo de operações ficam fora da conta.",
  },
  melhoresFaixas: {
    nome: "Melhores dias e horários",
    texto: "Os dias e horários classificados como Ligar com a maior nota. Se nenhum for Ligar, aparecem os de maior nota entre todos.",
  },
};
