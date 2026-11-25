# DESIGN.md — ficha "Mesa"

Fonte de verdade do desenho do site público (quantsrobos.com). Vale desde 25/11/2026 e manda no que for
visual; dados, regras de cálculo e rotas continuam no `docs/SPEC.md`.

A referência viva é a página inicial: `src/app/(site)/page.tsx` e `src/components/home/PainelCasa.tsx`.
Na dúvida, abra a página inicial e faça igual.

## 1. Para quem e para quê

Quem abre o site é um trader pessoa física, muitas vezes iniciante, decidindo se liga um robô na própria
conta. Ele quer três respostas, nesta ordem: **está dando resultado? quanto posso perder no caminho? como eu
começo?**

O dono do produto (Lucas) recusou quatro desenhos antes deste. As frases dele são o critério:

- "muita cara de IA"; "quero algo esteticamente bonito, moderno, sem parecer que é IA";
- "quero algo intuitivo, fácil de entender; para um leigo está muito difícil de entender";
- "que pegue a tela inteira, um sistema de verdade; veja muito espaço sem nada de conteúdo";
- e, sobre a primeira versão desta ficha, que tinha painéis com borda e muito texto: "a estrutura da página
  está ok, mas a página não está legal; coisas que não são necessárias pode tirar".

## 2. As cinco regras

1. **É um sistema, não uma landing page.** Barra lateral fixa com as áreas e os robôs ao vivo, fita de
   mercado no topo, área de trabalho na largura toda (teto de 2000 px). Essa estrutura está aprovada.
2. **Sem caixas.** O conteúdo fica direto sobre o fundo. Quem organiza é o espaço, o alinhamento e o fio de
   1 px. Não existe painel com borda, cartão, fundo mais claro em volta de um bloco, nem grade de caixinhas.
3. **Uma coisa principal por tela.** Um número grande que responde à pergunta da tela e um gráfico; depois
   uma lista ou tabela. O que repete outro lugar da tela, sai. O que não ajuda a responder à pergunta, sai.
   Num dia sem operação a tela não vira uma coleção de zeros: o dia aparece uma vez, em palavras.
4. **A curva é a assinatura.** Linha fina na cor do texto e, pintado de vermelho na própria linha, o trecho
   da maior queda (do ponto mais alto ao mais baixo que veio depois), com o valor escrito ao lado. Verde não
   entra em gráfico de curva: verde e vermelho são de número de ganho e de perda.
5. **Palavras de leigo.** "Maior queda", não drawdown. A premissa do número vem escrita junto dele ("com 1
   contrato por entrada, já descontados os custos", ou "antes dos custos" no robô sem custo cadastrado; a
   regra está na seção 7). Nenhuma tela depende de instrução para ser usada.

## 3. Estrutura

```
┌─────────────┬──────────────────────────────────────────────────────────────────────────┐
│ marca       │ ● Pregão aberto  Mini Índice 168.805 −0,10%  Hoje…        data · há 5 s  │  fita (fixa)
│ Visão geral ├──────────────────────────────────────────────────────────────────────────┤
│ Simular meu │ Resultado somado dos robôs    Somados · Lado a lado  │  período          │
│   capital   │ +R$ 77.505              Dias com ganho  170 de 241                       │
│ Como func.  │ premissa · período      Pior dia        02/09  −R$ 13.863                │
│             │                         Maior queda     −R$ 44.360                       │
│ Robôs       │ ─────────────── curva, com a maior queda em vermelho ──────────────────  │
│  Robô A     │                                                                          │
│   hoje…     │ Por robô             Em 12 meses  Maior queda  Ganho para   Capital      │
│  Robô B     │                                                cada R$ 1 da mínimo       │
│   hoje…     │                                                maior queda               │
│             │ Robô A       ~~~~    +R$ 39.845   −R$ 7.903    R$ 5,04      R$ 17.255    │
│             │  hoje… · histórico de 8 anos e 10 meses, 2.150 pregões                   │
│             │ Robô B       ~~~~    +R$ 37.660   −R$ 35.408   R$ 1,06      R$ 58.512    │
│             │  hoje… · histórico de 9 meses, 172 pregões                               │
│ nota + botão│ pé: links para fora · aviso legal                                        │
└─────────────┴──────────────────────────────────────────────────────────────────────────┘
```

Os nomes e os números do desenho são de exemplo: os robôs, a ordem e os valores vêm do banco.

- `src/app/(site)/layout.tsx` monta a casca (`.casca`, `.lateral`, `BarraTopo`, `Rodape`, `BarraInferior`) e
  assina o ao vivo uma vez. A barra lateral tem três áreas: Visão geral, Simular meu capital e Como funciona
  ("Comparar" deixou de existir em 25/11/2026: a comparação é a lista da Visão geral). Embaixo delas, os robôs
  com o que cada um fez hoje, a nota "Todos os valores são para 1 contrato por entrada, já descontados os
  custos" (com os custos da soma dos robôs, `custosDaSoma`: o robô sem custo cadastrado entra como ressalva,
  pelo nome) e o botão "Como começar".
- Na Visão geral, a linha de título leva dois seletores alinhados à borda da curva: "Somados · Lado a lado"
  (só quando há dois robôs ou mais com histórico) e o período, "12 meses · Desde o início · 30 pregões". A
  lista "Por robô" tem quatro números por robô: o resultado no período (o rótulo da coluna diz qual: "Em 12
  meses", "Desde o início", "Em 30 pregões"), a maior queda do mesmo período, o ganho para cada R$ 1 da maior
  queda e o capital mínimo. Vem ordenada pelo ganho por queda, do maior para o menor; quem não tem o número
  leva um traço com o motivo e vai para o fim. Debaixo do nome, o que o robô fez hoje e o tamanho do histórico.
  Uma coluna por número a partir de 1280 px; a miniatura da curva entra a partir de 1440 px.
- Toda tela usa `CorpoPagina` (margens da área de trabalho, seções separadas por 40 px). Tela com título
  próprio usa `CabecalhoPagina`; a página do robô tem `CabecalhoRobo` e `AbasRobo`, e o layout do robô já
  embrulha cada aba num `CorpoPagina` (a aba devolve só as seções).
- Para pôr seções lado a lado: `<Grade>` (12 colunas a partir de `xl`, vão de 48 px) e `xl:col-span-N` em
  cada filho. Sem caixa, é o vão que separa. Use lado a lado quando as duas coisas se leem juntas (campos e
  resultado do simulador; gráfico e a lista que o explica); senão, empilhe na largura toda.
- Em 1440 e 1920 px a tela principal (número, gráfico e o começo da lista) cabe sem rolar. A altura do
  gráfico vem de `--alt-curva` e por padrão ocupa o que sobra da janela.

### No celular

O celular tem versão própria (pedido do Lucas em 25/11/2026: "monte a versão também para o celular"), não a de
computador encolhida. Vale abaixo de `lg` (1024 px).

- **A navegação fica embaixo**, presa, ao alcance do polegar (`components/layout/BarraInferior.tsx`): Visão
  geral, Robôs, Simular, Mais. Só texto, com um fio em cima do item atual. "Robôs" e "Mais" abrem uma
  folha que sobe de baixo: a dos robôs traz a lista com o que cada um fez hoje, ao vivo (sem o resultado do
  mês, que seria ganho sem a maior queda ao lado); a de Mais, Como funciona, como começar, os canais e o tema.
  Não há botão de menu nem gaveta. "Comparar" saiu da barra em 25/11/2026, com a página.
- **Nada fica preso em cima**, a não ser as abas do robô. A marca e a fita de mercado rolam com a página
  (`--altura-cabecalho` é 0 no celular): presa em cima, a fita tirava tela do conteúdo.
- **O número aparece na primeira tela.** O cabeçalho do robô é compacto: nome e o que ele fez hoje, a
  descrição em até duas linhas, o botão com os dois atalhos na mesma linha e os dados de cadastro em texto
  corrido. A ordem da página inicial é número, seletor, curva, fatos, lista e, no fim, o botão "Como começar"
  (no celular não há barra lateral para ele). Na lista, cada robô é uma linha com nome, resultado e maior
  queda; o que ele fez hoje, o tamanho do histórico, o ganho para cada R$ 1 da maior queda e o capital mínimo
  vêm embaixo, em texto pequeno.
- **Não existe "passar por cima".** O que no computador se escolhe com o ponteiro, no celular tem um seletor
  em texto: na página inicial, "Somados · Lado a lado · Robô A · Robô B…" acima da curva, um seletor só para a
  vista e para o robô (só aparece com dois robôs ou mais com histórico; os robôs vêm na ordem do banco, que
  não muda com o período). Tocar numa linha de robô navega.
- **Alvo de toque de pelo menos 36 px**: os seletores em texto têm essa altura sem o fio descer do texto; linha
  de lista e de folha, 52 px.
- Tabela larga rola de lado dentro do próprio bloco, com a coluna do resultado presa; lista de fatos e de
  "mais números" ocupam a largura toda; nada estoura os 375 px.
- A barra de baixo respeita a área de gesto do aparelho (`env(safe-area-inset-bottom)`, com
  `viewportFit: "cover"`), e o conteúdo guarda o lugar dela.

## 4. Tokens

Em `src/app/globals.css`. Não se cria cor nem medida na tela: usa-se o token.

| Papel | Escuro (padrão) | Claro | Classe |
|---|---|---|---|
| Fundo (tudo: página, barra lateral, fita) | `#0a0b0d` | `#ffffff` | `bg-background` |
| Realce (linha sob o ponteiro, item atual) | `#121419` | `#f4f5f6` | `bg-(--linha-hover)` |
| Fio | `#1a1d23` | `#e6e8eb` | `border`, `border-(--painel-fio)` |
| Fio forte (zero do gráfico, borda de campo) | `#2b3039` | `#cfd3d9` | `border-(--painel-fio-forte)` |
| Texto | `#eceef1` | `#101214` | `text-foreground` |
| Apoio | `#9aa1ac` | `#5a606b` | `text-muted-foreground` |
| Terceiro nível (rótulo de coluna, data, nota) | `#7b828e` | `#7d838d` | `text-sutil` |
| Ganho | `#33c58a` | `#0c7f52` | `text-positivo` |
| Perda, maior queda | `#f0625f` | `#d02b3f` | `text-negativo` |
| Atenção | `#f0a431` | `#a85d00` | `text-alerta` |
| Em operação agora, informação | `#6ea8fe` | `#1f5fd1` | `text-info` |
| Marca | `#00ff88` | `#007a41` | `text-marca`, `bg-marca` |
| Botão principal | fundo `#eceef1`, texto `#0a0b0d` | fundo `#101214`, texto branco | `buttonVariants()` |

- **Verde e vermelho só dizem ganho e perda** (e o vermelho, a maior queda). Zero é cinza.
- **O verde da marca aparece em dois lugares:** o símbolo e o ponto de "pregão aberto". O botão principal é
  claro, justamente para não disputar com o verde do ganho. Marcador de item atual: fio na cor do texto.
- **Tipografia:** Hanken Grotesk em tudo, pesos 400, 500 e 600, algarismos tabulares (ligados no `body`).
  Sem monoespaçada, sem serifa, **sem caixa alta**. Em janela de 1700 px ou mais a raiz sobe para 17 px e a
  tela inteira cresce um degrau.
- **Escala:** número principal `.numero-grande` (40 a 72 px, peso 500, com o "+R$" em peso 400 e cinza);
  nome de robô em lista 17 px/500; título de seção 15 px/500; corpo 14 px; apoio e rótulo de coluna 13 px;
  eixo de gráfico 12 px.
- **Raio:** 6 px em botão, campo e realce de linha. Nada de `rounded-full`, a não ser em ponto de 6 a 9 px.
- **Espaço:** margem da área de trabalho 40 px (56 px em tela grande); entre seções 40 px; linha de lista de
  robôs ~70 px; linha de tabela densa 48 px (40 px quando são centenas de linhas).

## 5. Peças

| Peça | Onde | Para quê |
|---|---|---|
| `CorpoPagina`, `CabecalhoPagina`, `Grade`, `Frase` | `components/sistema/Pagina.tsx` | Esqueleto de toda tela |
| `Painel` (+ `LINK_DO_PAINEL`) | `components/sistema/Painel.tsx` | Uma **seção sem caixa**: título, apoio, ação à direita, fio embaixo do título e o conteúdo. O nome é histórico |
| `NumeroGrande`, `Fatos`, `Fato` | `components/sistema/Numero.tsx` | O número principal da tela (um por tela, com o "+R$" mais leve) e os três ou quatro fatos que ficam colados nele |
| `ListaKpi` | `components/desempenho/CardsKpi.tsx` | Números em lista: rótulo e apoio à esquerda, valor à direita, uma linha por número com fio entre elas, em duas colunas a partir de `lg`. É o "Como ele opera" do Resumo e as listas de Quedas e risco e de Melhores horários. A faixa de números lado a lado (`Indicadores`, `CardsKpi`) saiu em 25/11/2026 com as telas que a usavam |
| `GraficoResultado` | `components/graficos/GraficoResultado.tsx` | A curva com a maior queda em vermelho e a mira; `barras` liga o resultado de cada dia embaixo (só em período curto). Exporta `escalaJusta` e `noEixo` para outras curvas |
| `GraficoComparativo` | `components/comparativo/GraficoComparativo.tsx` | O "Lado a lado" da Visão geral: a curva de cada robô no mesmo eixo de tempo, cada uma num tom do texto (do mais forte ao mais leve, na ordem da lista) com o nome na ponta e a maior queda de cada uma em vermelho; o robô apontado fica em destaque e os outros apagam |
| `CurvaCapital`, `DesenhoDaCurva` | `components/graficos/` | A curva detalhada do robô (por dia e por operação), no mesmo traço; também leem `--alt-curva` |
| `MiniCurva` (`cor="neutra"`) e a `Miniatura` da home | `components/graficos/MiniCurva.tsx`, `PainelCasa` | Curva pequena em linha de lista; quando há várias, mesma escala |
| `Segmentado` | `components/compartilhados/Segmentado.tsx` | Período, agrupamento, filtro: opções em texto de 13 px com um fio debaixo da escolhida |
| `AbasRobo` | `components/robo/AbasRobo.tsx` | Abas da página do robô: texto de 14 px sobre um fio de ponta a ponta. É o único outro lugar com sublinhado; aba navega, `Segmentado` filtra |
| `.tbl` em `.tbl-moldura` | `globals.css` | Tabela: cabeçalho de 13 px em cinza (sem caixa alta), números à direita (`.num`), fio entre linhas, realce na linha sob o ponteiro |
| `TextoDeHoje` / `fraseDeHoje` | `components/home/` | O estado do robô em palavras: "hoje +R$ 240 em 3 operações", "hoje ainda sem operação", "em operação agora" |
| `RotuloComInfo` | `components/compartilhados/InfoIndicador.tsx` | Rótulo que abre a explicação do glossário. Só em termo que o leigo não conhece; rótulo comum não leva |
| `Valor` | `components/compartilhados/Valor.tsx` | Dinheiro com sinal e cor |
| `buttonVariants` | `components/ui/button.tsx` | `default` (claro; um por tela, no máximo) e `outline` |

Regras das peças:

- Uma seção não vai dentro de outra. Dentro da seção, o que separa é fio (`border-t`, `divide-y`) e espaço.
- Gráfico de curva: linha neutra de 1,6 px, sem área preenchida, sem gradiente; guias na cor do fio; eixo de
  valores à direita em "R$ 40 mil"; a leitura do ponto apontado troca o número grande da tela (não há
  cartão flutuante). Mais de uma série no mesmo gráfico: linhas neutras com o nome escrito na ponta, e a do
  ponteiro em destaque; nunca três linhas verdes.
- Barras (resultado por dia, por mês, por horário): verdes e vermelhas chapadas, sem trilho, sem gradiente.
- Lista que é controle: passar o ponteiro ou o foco numa linha troca o gráfico e o número; clicar navega.

## 6. Como montar uma tela

1. **Uma pergunta por tela.** "Este robô ganha mais do que perde?", "Qual foi o pior momento?". Se a tela
   responde a duas, são duas telas.
2. **Linha de título** em texto pequeno e cinza à esquerda (o que é o número) e o `Segmentado` de período à
   direita, alinhado à borda do gráfico.
3. **O número grande**, com a premissa e o período escritos embaixo. Ao lado, colado nele, três ou quatro
   fatos em lista (um deles sempre a maior queda ou o pior caso: tela que mostra ganho mostra o risco).
4. **O gráfico**, na largura toda, e uma linha de legenda só se algo nele precisa de explicação.
5. **A lista ou a tabela.** Em linhas com fio. Colunas alinhadas à borda direita do gráfico.
6. **A lista dos outros números**, se a tela for de análise ("Como ele opera" no Resumo, "Mais números" em
   Quedas e risco): uma `ListaKpi` no fim, cada número com a linha de apoio em português simples. Fora isso,
   mais nada.

Antes de acrescentar um bloco, pergunte: o leitor sentiria falta? Se não, não entra.

Em tela larga (1440 px ou mais) nada fica numa coluna estreita com o resto vazio: gráfico e tabela usam a
largura toda; texto corrido tem largura de leitura (`max-w-3xl`) e por isso vai ao lado de outra coisa.
Em 375 px tudo vira uma coluna, tabela rola dentro do próprio bloco e nada estoura a largura.

## 7. Linguagem

| Jargão | Na tela |
|---|---|
| Drawdown, DD máx. | **Maior queda** ("do ponto mais alto ao mais baixo que veio depois") |
| Drawdown atual | Abaixo do topo hoje |
| Resultado ÷ drawdown (fator de recuperação) | Ganho para cada R$ 1 da maior queda ("ganhou R$ 1,10 para cada R$ 1 que já chegou a cair") |
| Margem | Garantia (a margem): o que a corretora exige por contrato aberto |
| Taxa de acerto | **Acertos** ("de cada 100 operações, 83 terminaram com ganho"), sempre com o necessário para empatar ("precisa de 81 só para empatar") |
| Dias positivos | Dias com ganho ("170 de 241") |
| Gains / losses | Operações com ganho / com perda |
| Payoff | Não aparece como razão. Em "Como ele opera", ganho típico e perda típica, cada um em R$ |
| Fator de lucro | Fator de lucro, com apoio: "ganhou R$ 1,13 para cada R$ 1 perdido" |
| Acumulado | Desde o início / Resultado no período |
| Líquido | "já descontados os custos": os valores da tela são sempre líquidos, sem opção de ver antes dos custos (esse valor fica só nas planilhas). O robô cujo histórico não tem custo cadastrado diz isso no lugar ("com 1 contrato por entrada, antes dos custos"; "este histórico não tem custo nenhum descontado"). A frase sai sempre de `src/lib/premissa.ts` (regra abaixo) |
| Por contrato | "com 1 contrato por entrada" (escrito junto do número principal, não em todo número: o robô pode ter várias entradas abertas ao mesmo tempo, cada uma com 1 contrato) |
| Operando, Posicionado, Histórico | "hoje ainda sem operação", "em operação agora", "sem acompanhamento ao vivo · dados até 24/11" |
| MEP / MEN, MFE / MAE | Melhor momento / pior momento (do dia, da operação) |
| Volatilidade | O quanto o resultado varia de um dia para o outro (saiu das telas em 25/11/2026) |
| Heatmap | Mapa dos dias |
| Faixa (dia × hora) | Dia e horário |
| Score | Nota |
| Lote sugerido | Tamanho sugerido da posição |
| WIN, WDO | Mini Índice, Mini Dólar |
| Trade | Operação |

- **A premissa dos custos mora em `src/lib/premissa.ts`** (revisão de 25/11/2026: o robô sem custo cadastrado
  aparecia "já descontados os custos" em umas telas e "antes dos custos" em outras). Toda premissa de custos do
  site, do PDF, das imagens, do widget e da legenda de compartilhar sai de lá; nenhum "já descontados os
  custos" fica escrito à mão no código.
  - `temCusto(custo)`: o robô tem custo cadastrado (maior que zero)?
  - `custosDoRobo(custo)`: "já descontados os custos" ou "antes dos custos".
  - `premissaDoRobo(custo)`: "com 1 contrato por entrada, já descontados os custos" (ou "antes dos custos").
  - `custosDaSoma(robôs)`, para soma de robôs (Visão geral, simulador, prévia da casa, nota da barra lateral):
    todos com custo, "já descontados os custos"; nenhum, "antes dos custos"; parte, "já descontados os custos,
    menos no X, que não tem custo no histórico", com os nomes vindos do banco.
  - Os textos do glossário (`components/compartilhados/glossario.ts`) não trazem a premissa dos custos (o teste
    do glossário confere): a tela que precisa dela dentro do balão passa o texto próprio, montado com essas
    funções.
- Frase curta, com sujeito e número. Valores com sinal e unidade: `+R$ 2.514`, `−R$ 800`, `83%`.
- Média por dia ou por mês e percentual de retorno não entram em tela nenhuma (o iniciante multiplica a média
  do dia por 22 e lê como salário).
- O site não promete o que não sabe: "hoje ainda sem operação", nunca "ligado" ou "operando".
- Sem tom de vendas, sem adjetivo, sem promessa. Resultado passado não garante futuro.

## 8. O que não entra

- Caixa: painel com borda, cartão, bloco com fundo mais claro, grade de caixinhas, cartão dentro de cartão.
- Gradiente, brilho, sombra, vidro fosco, área preenchida sob curva.
- Pílula (`rounded-full` em botão, aba, etiqueta, segmentado); etiqueta tingida com borda da mesma cor.
- Ícone decorativo em título, item de menu ou número; ícone ⓘ; emoji; seta solta no fim de linha clicável.
- Rótulo em caixa alta. Título de marketing. Texto centralizado. Três blocos iguais lado a lado.
- Número repetido em dois lugares da mesma tela; fileira de zeros; "0 robôs", "0 operações".
- Linha de instrução ("clique para…"). Se precisa explicar, o desenho está errado.
- Animação de entrada, cartão que cresce no hover, contador animado.
- Verde ou vermelho como enfeite; verde em curva; mais de um botão principal por tela.
- Coluna estreita centralizada com as laterais vazias.

## 9. O que cada tela mostra

Revisão de 25/11/2026, a pedido do Lucas ("quais páginas e abas são necessárias? informações que não são
importantes vamos tirar, coloque indicadores que fazem sentido para o trader quando o assunto é robô"). Quatro
leituras independentes do sistema (trader iniciante, trader experiente em estratégias automatizadas, gestor
de risco, produto) chegaram quase ao mesmo desenho. O que o Lucas decidiu diferente delas está marcado.

### Páginas e abas

Site (barra lateral; no celular, barra de baixo): **Visão geral**, **Simular meu capital**, **Como funciona**.
"Comparar robôs" deixou de ser página: a comparação é a própria lista da Visão geral.

Página do robô, seis abas: **Resumo**, **Ao vivo** (só em robô com coletor), **Dia a dia**, **Quedas e risco**,
**Melhores horários**, **Operações**. Saíram como abas: Desempenho (o que servia foi para o Resumo) e Relatórios
(os arquivos de cada mês estão em Dia a dia e no pé de Operações). A Tela ao vivo em tela cheia continua
existindo e abre pela aba Ao vivo.

Decisões do Lucas que contrariam os analistas e por isso ficam: a aba Melhores horários continua; o histórico
continua descrito como hoje (sem separar "importado" de "ao vivo"); o Alaska & Square continua na lista e na
soma.

### Decisões tomadas durante a obra

- **Quedas e risco não tem seletor de período.** A aba lê sempre o histórico inteiro, para a maior queda do
  alto da tela ser a mesma que entra na conta do capital mínimo logo abaixo (com "Mês", a tela mostrava uma
  maior queda menor que a da conta).
- **"30 pregões" é a mesma janela de datas para todos os robôs.** Na Visão geral o período é um corte de data
  só, para a soma e para cada robô: os últimos 30 pregões em que algum robô operou. Um robô que não operou em
  todos eles aparece com os que operou. Assim as linhas da lista somam o número grande, e as curvas do "Lado a
  lado" dividem o mesmo eixo de tempo. O mesmo vale para "12 meses".
- **No "Lado a lado" os robôs se distinguem pelo tom do texto, com o nome escrito na ponta da linha.** Do tom
  mais forte ao mais leve, na ordem da lista; nunca uma cor por robô (verde e vermelho continuam só para ganho,
  perda e maior queda). Passar o ponteiro perto de uma linha, ou sobre o robô na lista, põe a dele em destaque
  e apaga as outras. Cada curva parte de zero no começo do período; o robô que estreou dentro do período começa
  onde o histórico dele começa.

### A pergunta de cada tela

| Tela | Pergunta | Número principal |
|---|---|---|
| Visão geral | Os robôs dão resultado, e qual deles? | Resultado somado no período |
| Robô › Resumo | Este robô vale a pena? Quanto ganhou e quanto caiu no caminho? | Resultado desde o início |
| Robô › Ao vivo | O que ele está fazendo agora? | Resultado de hoje |
| Robô › Dia a dia | Como foi cada dia e cada mês? | Resultado do mês em vista |
| Robô › Quedas e risco | Quanto posso perder e quanto capital preciso? | Maior queda |
| Robô › Melhores horários | Em que dia e horário ele vai melhor? | Melhor dia e horário |
| Robô › Operações | O que ele fez, operação por operação? | (a tabela é a tela) |
| Simular meu capital | Com o meu capital, quanto eu teria ganho e caído? | Resultado simulado |
| Como funciona | De onde vêm os números e como eu começo? | (texto) |

### Os indicadores

Ficam, porque respondem ao que o trader precisa para decidir:

| Indicador (como aparece) | Onde | O que diz |
|---|---|---|
| Resultado no período | Visão geral, Resumo, Simulador | Ganhou? Com a premissa escrita junto ("com 1 contrato por entrada, já descontados os custos", ou "antes dos custos" no robô sem custo cadastrado, de `src/lib/premissa.ts`) e o tamanho do histórico ("em 9 meses, 172 pregões") |
| Maior queda, e se já recuperou | Ao lado de todo resultado; por dentro em Quedas e risco | Quanto já caiu do ponto mais alto ao mais baixo; "ainda não recuperou" ou "recuperou em N dias" |
| Ganho para cada R$ 1 da maior queda | Lista da Visão geral, Resumo, Quedas e risco | Resultado dividido pela maior queda: "ganhou R$ 1,10 para cada R$ 1 que já chegou a cair". É o que ordena a lista de robôs |
| Capital mínimo | Lista da Visão geral, cabeçalho do robô, Resumo, Quedas e risco, Simulador | Margem por contrato × o máximo de entradas que o robô já teve abertas + maior queda × fator. A conta aparece por extenso em Quedas e risco. Sem garantia cadastrada, sem a leitura das entradas abertas ou sem histórico, o robô fica com um traço no lugar do número |
| Entradas abertas ao mesmo tempo | Cabeçalho do robô, Resumo ("Como ele opera"), Quedas e risco, Simulador | "Já teve até 36 entradas abertas ao mesmo tempo": "1 contrato" é por entrada |
| Abaixo do topo hoje | Resumo, Quedas e risco | Quanto falta para voltar ao ponto mais alto |
| Meses com ganho e pior mês | Resumo, junto das barras por mês | Consistência: "8 de 10 meses; o pior foi julho, −R$ 18.897" |
| Dias com ganho; pior dia | Visão geral, Resumo, Dia a dia, Quedas e risco | "122 de 172"; o pior dia com a data |
| Um dia ruim típico | Quedas e risco | "Em 1 de cada 20 pregões perdeu R$ X ou mais" |
| Maior sequência de dias com perda | Quedas e risco | Quanto tempo seguido de perda já houve |
| Acertos, com o necessário para empatar | Resumo ("Como ele opera"), Melhores horários (o fato do dia e horário e a coluna "Para empatar" da tabela), nunca sozinho | "Acerta 83 de cada 100; precisa de 81 só para empatar" |
| Ganho típico, perda típica e maior perda numa operação | Resumo ("Como ele opera") | Em R$: o tamanho de um ganho e de uma perda |
| Resultado médio por operação | Resumo ("Como ele opera"), Quedas e risco | "R$ 2,36 por operação; o custo considerado é R$ 0,25": mostra a folga contra custo e execução |
| Fator de lucro | Resumo ("Como ele opera"), em frase | "Ganhou R$ 1,13 para cada R$ 1 perdido" |
| Operações por dia e duração típica; pregões em que operou | Resumo ("Como ele opera") | Como é o ritmo do robô: "98 por dia, 4 min cada; operou em 172 de 194 pregões" |
| Resultado por mês | Resumo (barras), Dia a dia (mapa, com PDF e planilha do mês) | Mês a mês |
| Tempo caindo, tempo até recuperar, dias abaixo do topo, outras quedas | Quedas e risco | A queda por dentro |
| Melhor e pior momento do dia | Ao vivo, dia escolhido em Dia a dia | Até onde o dia foi, com a operação aberta |
| Resultado de hoje, operação aberta | Ao vivo; frase no cabeçalho e na barra lateral | O que o robô faz agora |
| Cabe, apertado ou não cabe | Simulador | A resposta para o capital digitado; "Não dá para avaliar se cabe" quando algum robô escolhido está sem capital mínimo (ele aparece com um traço) |
| Os robôs andam juntos? | Simulador, quando dois robôs escolhidos ganham e perdem nos mesmos dias | "Ganharam ou perderam juntos em 114 de 131 pregões": juntar os dois soma o risco |

Saíram, porque parecem promessa, repetem outro número ou não dizem nada a quem vai operar: Calmar, índice de
úlcera, risco de ruína, variação de um dia para o outro, tempo médio para recuperar, média por mês, retorno
sobre o capital, capital de referência e a queda em % dele, ganho médio contra perda média como razão (0,23),
melhor dia como indicador (fica só na lista de Dia a dia), sequências de operações, os filtros de pontos,
"antes dos custos" e contratos, resultado por dia da semana fora da aba de horários, "melhor momento" como
coluna de Operações, e "contratos por operação", "versão" e "última operação" no cabeçalho do robô.

Regras:

- Número de ganho nunca aparece sem a maior queda ao lado. Acertos nunca aparecem sem o necessário para empatar.
- Percentual de retorno e média por mês ou por dia não entram em tela nenhuma.
- Todo indicador diz o tamanho do histórico de onde saiu quando ele for curto (menos de 12 meses).
- O que depende de dado que o sistema não tem (preço da licença, resultado de clientes, motivo de o robô não
  ter operado num dia) não é inventado.

## 10. Antes de entregar uma tela

- [ ] Em três segundos dá para dizer qual é o número principal e o que ele significa.
- [ ] Nada na tela repete outra coisa da tela, e nada sobraria se saísse.
- [ ] Nenhuma caixa. Nenhum `rounded-full`, `backdrop-blur`, `shadow-*`, `bg-gradient-*`, `uppercase`.
- [ ] Em 1440 e 1920 px a largura está ocupada e a parte principal cabe sem rolar; em 375 px nada estoura.
- [ ] No celular o número principal aparece na primeira tela, tudo o que se escolhe com o ponteiro tem um seletor para o toque e os alvos têm ao menos 36 px.
- [ ] Onde aparece ganho, aparece a maior queda ou o pior caso.
- [ ] Todo termo técnico tem nome simples na tela.
- [ ] Verde e vermelho só em ganho, perda e maior queda; contraste de texto ≥ 4,5:1 nos dois temas.
- [ ] Robôs, textos e links vêm do banco; nada fixo no código (regra do `CLAUDE.md`).
- [ ] `npx tsc --noEmit -p .`, `npx eslint src` e `npx vitest run` passam.
