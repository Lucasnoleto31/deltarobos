/**
 * O que é cada indicador do site, em português do dia a dia (19/09/2026, Artur: "em todos os cards deve ter
 * uma info sobre o que é" e "as explicações devem ser de fácil entendimento, para qualquer leigo entender").
 * O RotuloComInfo (InfoIndicador.tsx) abre o balão com o nome em negrito e o texto embaixo.
 *
 * 25/11/2026 (ficha Mesa, DESIGN.md seção 7; Lucas: "para um leigo está muito difícil de entender"): o nome é
 * o rótulo que a tela usa ("Maior queda", "Acertos"), porque é o título do balão que abre quando alguém toca no
 * rótulo; a tela dizia "Maior queda" e o balão abria com "Drawdown máximo". O termo técnico (drawdown, MEP,
 * MAE…) não vai no nome e aparece no texto no máximo uma vez, entre parênteses, para quem o conhece de outro
 * lugar. As chaves continuam com os nomes antigos: são usadas em toda a base.
 *
 * Regras do texto (glossario.test.ts confere as mecânicas): uma ou duas frases curtas, para quem nunca
 * operou; o que o número mede e como ler; sem fórmula com símbolos, sem sigla sem explicar, sem marketing,
 * sem exclamação e sem começar repetindo o nome. Cada texto foi conferido contra a conta em src/lib/stats:
 * se a conta mudar, o texto muda junto. A conta completa, com exemplo, fica em Como funciona (/metodologia).
 *
 * Revisão dos indicadores, 25/11/2026 (DESIGN.md, seção 9): a premissa dos números passou a ser "com 1
 * contrato por entrada" (um robô pode ter várias entradas abertas ao mesmo tempo), e os textos dizem assim.
 * "Ganho típico", "perda típica", "maior perda numa operação" e "duração típica" são os nomes que a tela usa.
 * Texto nenhum cita valor de ativo (quanto vale o ponto, a garantia): isso vem do banco e muda sem deploy.
 *
 * Os custos (revisão de 25/11/2026): texto nenhum daqui diz "já descontados os custos". O robô cujo histórico
 * não tem custo cadastrado está antes dos custos, e um texto fixo afirmaria o contrário no balão dele. A
 * premissa dos custos vem escrita junto do número, por src/lib/premissa; a tela que precisa dela dentro do
 * balão passa o texto próprio (a prop `texto` do RotuloComInfo, como faz o "Como ele opera").
 *
 * Só ficam as chaves que alguma tela cita (glossario.test.ts confere): as dos indicadores que saíram do site
 * (média por mês, retorno, Calmar, índice de úlcera, risco de ruína, os recortes por ativo, por hora e por dia
 * da semana, os termos da aba Melhores horários e outros) saíram daqui junto com a última tela que as citava.
 */
export type ChaveIndicador =
  // os indicadores da revisão de 25/11/2026 (DESIGN.md, seção 9)
  | "ganhoPorQueda"
  | "mesesComGanho"
  | "piorMes"
  | "quedaAtual"
  | "diaRuimTipico"
  | "acertoParaEmpatar"
  | "resultadoPorOperacao"
  | "entradasAbertas"
  | "pregoesOperados"
  | "andamJuntos"
  // operações
  | "duracaoMedia"
  | "taxaAcerto"
  | "fatorLucro"
  | "ganhoMedio"
  | "perdaMedia"
  | "maiorPerda"
  // dias
  | "piorDia"
  | "diasPositivos"
  | "diasNegativos"
  | "sequenciaDiasNegativos"
  // risco e capital
  | "drawdown"
  | "capitalMinimo"
  | "semaforoCapital"
  // o dia por dentro
  | "mep"
  | "men"
  | "mae"
  | "flutuante"
  | "operacoesEmAberto"
  | "curvaDoDia";

export interface EntradaGlossario {
  /** o rótulo que a tela usa para o indicador; é o título, em negrito, do balão que o rótulo abre */
  nome: string;
  texto: string;
}

export const GLOSSARIO: Record<ChaveIndicador, EntradaGlossario> = {
  // ── operações ────────────────────────────────────────────────────────────────────────────────────
  // a duração típica é a mediana das operações medidas (duracaoTipica, em lib/stats/como-opera), não a média
  duracaoMedia: {
    nome: "Duração típica",
    texto: "Quanto dura uma operação típica, da entrada à saída: metade das operações dura menos do que isso, metade dura mais. Mostra se o robô fica segundos, minutos ou horas com uma operação aberta.",
  },
  taxaAcerto: {
    nome: "Acertos",
    texto: "De cada 100 operações, quantas terminaram com ganho (o mercado chama de taxa de acerto). Sozinho, não diz se o robô ganha dinheiro: veja ao lado quantos acertos ele precisa só para empatar.",
  },
  fatorLucro: {
    nome: "Fator de lucro",
    texto: "Quanto o robô ganhou para cada R$ 1 perdido, somando todas as operações. Um fator de 1,13, por exemplo, quer dizer R$ 1,13 de ganho para cada R$ 1 de perda. Acima de 1, ganhou mais do que perdeu.",
  },
  ganhoMedio: {
    nome: "Ganho típico",
    texto: "Quanto o robô ganha, em média, numa operação que termina com ganho, com 1 contrato por entrada.",
  },
  perdaMedia: {
    nome: "Perda típica",
    texto: "Quanto o robô perde, em média, numa operação que termina com perda, com 1 contrato por entrada.",
  },
  maiorPerda: {
    nome: "Maior perda numa operação",
    texto: "O resultado da operação que mais perdeu no período, com 1 contrato por entrada. É o pior caso de uma operação só.",
  },

  // ── dias ─────────────────────────────────────────────────────────────────────────────────────────
  piorDia: {
    nome: "Pior dia",
    texto: "O dia com o menor resultado no período, com a data em que aconteceu.",
  },
  diasPositivos: {
    nome: "Dias com ganho",
    texto: "Em quantos dias, do total de dias com operação, o robô terminou com ganho.",
  },
  diasNegativos: {
    nome: "Dias com perda",
    texto: "Em quantos dias o robô terminou com perda, e que parte do total isso representa.",
  },
  sequenciaDiasNegativos: {
    nome: "Maior sequência de dias com perda",
    texto: "O maior número de dias seguidos que terminaram com perda. Mostra quanto tempo seguido o robô já passou perdendo.",
  },

  // ── risco e capital ──────────────────────────────────────────────────────────────────────────────
  drawdown: {
    nome: "Maior queda",
    texto: "A distância do ponto mais alto que o resultado somado alcançou até o ponto mais baixo que veio depois. Mostra o tamanho do pior momento: quanto o robô chegou a devolver antes de voltar a subir (o mercado chama de drawdown).",
  },
  capitalMinimo: {
    nome: "Capital mínimo",
    texto: "Quanto ter na conta para usar o robô com 1 contrato por entrada: a garantia da corretora por contrato (a margem), vezes o máximo de entradas que ele já teve abertas ao mesmo tempo, mais a maior queda com folga de segurança. Quedas futuras podem ser maiores.",
  },
  // 25/11/2026 (ficha Mesa): a tela não tem mais o painel "Semáforo do capital"; mostra uma das respostas
  // ("Cabe", "Apertado", "Não cabe" ou "Não dá para avaliar se cabe") na frente da frase. A regra é semaforoDe
  // (lib/stats/simulador): sem o capital mínimo de algum robô escolhido (garantia não cadastrada ou entradas que
  // não puderam ser lidas), não há veredito. O limite de 25% é o LIMITE_APERTADO (o teste confere os dois juntos)
  semaforoCapital: {
    nome: "Cabe, apertado ou não cabe",
    texto: "Não cabe se o capital fica abaixo do mínimo ou a maior queda simulada o levaria inteiro; apertado se ela passa de 25% do capital; cabe no resto. Sem o capital mínimo de algum robô escolhido, não dá para avaliar. É uma leitura do histórico, não uma garantia.",
  },

  // ── o dia por dentro ─────────────────────────────────────────────────────────────────────────────
  // 22/09/2026: duas fontes. Nos dias que o coletor 1.1.0 acompanhou, o número é medido no MetaTrader a
  // cada movimento do preço, com a posição aberta (o mesmo do Profit); nos outros, é conferido a cada
  // operação fechada (lib/stats/operacoes, excursaoDoDia). A tela diz qual foi a fonte do dia mostrado.
  // 25/11/2026 (ficha Mesa): na tela são o melhor e o pior momento do dia (MEP e MEN) e o pior momento da
  // operação (MAE, a coluna da aba Operações); a sigla fica uma vez no texto, entre parênteses.
  mep: {
    nome: "Melhor momento do dia",
    texto: "O ponto mais alto que o resultado do dia alcançou (o mercado chama de MEP). Nos dias medidos no MetaTrader, conta cada movimento do preço, com a operação aberta; nos outros, é conferido a cada operação fechada.",
  },
  men: {
    nome: "Pior momento do dia",
    texto: "O ponto mais baixo que o resultado do dia alcançou: quanto o dia chegou a ficar no prejuízo (o mercado chama de MEN). Nos dias medidos no MetaTrader, conta cada movimento do preço; nos outros, é conferido a cada operação fechada.",
  },
  mae: {
    nome: "Pior momento da operação",
    texto: "O máximo que o preço andou contra a operação enquanto ela esteve aberta, em pontos, medido no MetaTrader a cada movimento do preço (o mercado chama de MAE). Mostra quanto ela chegou a perder antes de fechar.",
  },
  flutuante: {
    nome: "Resultado da operação aberta",
    texto: "Quanto a operação que ainda está aberta daria de ganho ou de perda, com 1 contrato, se fosse encerrada agora (o mercado chama de flutuante). Muda a cada movimento do preço e só vira resultado quando a operação fecha.",
  },
  // 21/09/2026: o contador da barra, do Ao vivo e da tela cheia. Conta entradas, nunca contratos (spec §6:
  // nada de volume na conta pública)
  operacoesEmAberto: {
    nome: "Operações em aberto",
    texto: "Cada entrada que o robô fez e ainda não fechou conta 1, mesmo que seja no mesmo ativo e no mesmo sentido. Não é a quantidade de contratos: é quantas operações estão esperando a saída neste momento.",
  },
  // 23/09/2026: 5 segundos é o InpSaldoBucketSeg padrão do EA 1.1.2. A curva do dia tem duas fontes, como o
  // melhor e o pior momento do dia: a série do saldo medida no MetaTrader (lib/stats/saldo-dia, já descontado o
  // custo das operações fechadas) nos dias que o coletor mediu, e a soma por fechamento nos outros. O "5
  // segundos" daqui é o input do EA, enquanto a legenda da curva mostra o tamanho real inferido da série
  // (bucketSeg): se o input mudar, este texto, a Metodologia e o teste do glossário (que cita "5 segundos")
  // acompanham juntos.
  // 25/11/2026 (ficha Mesa): o nome é o título que a aba Dia a dia põe em cima do desenho ("O saldo ao longo
  // do dia"); era "Curva do dia".
  curvaDoDia: {
    nome: "Saldo ao longo do dia",
    texto: "O resultado do dia enquanto o pregão anda. Nos dias medidos no MetaTrader, é o saldo com a operação aberta, a cada 5 segundos, já descontado o custo das operações fechadas; nos outros, a soma operação por operação, na ordem em que fecharam.",
  },

  // ── revisão de 25/11/2026: os indicadores que entraram no lugar dos que saíram (DESIGN.md, seção 9) ──
  ganhoPorQueda: {
    nome: "Ganho para cada R$ 1 da maior queda",
    texto: "O resultado do período dividido pela maior queda do mesmo período. Com 1,10, o robô ganhou R$ 1,10 para cada R$ 1 que já chegou a cair. Quanto maior, menos o resultado dependeu de aguentar uma queda grande.",
  },
  mesesComGanho: {
    nome: "Meses com ganho",
    texto: "Em quantos meses do período o robô terminou com ganho. O mês em andamento entra na conta com o que tem até hoje.",
  },
  piorMes: {
    nome: "Pior mês",
    texto: "O mês de menor resultado no período: aquele em que o robô mais perdeu ou, se nenhum fechou com perda, o que menos ganhou. Com 1 contrato por entrada.",
  },
  quedaAtual: {
    nome: "Abaixo do topo hoje",
    texto: "Quanto o resultado está, hoje, abaixo do ponto mais alto que já alcançou. Zero quer dizer que o robô está no topo.",
  },
  diaRuimTipico: {
    nome: "Um dia ruim típico",
    texto: "A perda que 1 em cada 20 pregões alcançou ou passou. O pior dia é um caso só; este número diz o tamanho de um dia ruim que acontece de tempos em tempos.",
  },
  acertoParaEmpatar: {
    nome: "Acertos para empatar",
    texto: "De cada 100 operações, quantas precisam terminar com ganho só para o robô não perder, dado o tamanho do ganho típico e da perda típica. Quando o ganho é pequeno e a perda é grande, é preciso acertar quase sempre.",
  },
  // a folga contra o custo: a tela escreve ao lado o custo considerado, ou que o histórico não tem custo descontado
  resultadoPorOperacao: {
    nome: "Resultado médio por operação",
    texto: "O resultado do período dividido pelo número de operações. É a folga do robô: se na sua conta cada operação custar mais ou sair a um preço pior, é daqui que sai.",
  },
  entradasAbertas: {
    nome: "Entradas abertas ao mesmo tempo",
    texto: "O máximo de operações que o robô já teve abertas no mesmo instante. Os valores do site são para 1 contrato por entrada: com várias entradas abertas, a conta carrega vários contratos, e a garantia da corretora é por contrato.",
  },
  pregoesOperados: {
    nome: "Pregões em que operou",
    texto: "Em quantos pregões o robô fechou ao menos uma operação, do primeiro ao último dia do período, contra quantos pregões a bolsa teve.",
  },
  andamJuntos: {
    nome: "Robôs que andam juntos",
    texto: "Em quantos pregões dois robôs ganharam ou perderam no mesmo dia. Quando isso acontece quase sempre, usar os dois ao mesmo tempo soma o risco em vez de dividir.",
  },
};
