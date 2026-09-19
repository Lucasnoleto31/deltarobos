import type { Metadata } from "next";
import Link from "next/link";
import { GLOSSARIO, type ChaveIndicador } from "@/components/compartilhados/glossario";
import { Voltar } from "@/components/layout/Voltar";
import { formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import { PARAMETROS_FAIXAS_PADRAO } from "@/lib/stats/faixas";
import { LIMITE_SEM_HEARTBEAT_SEG } from "@/lib/stats/pregao";

export const metadata: Metadata = {
  title: "Metodologia",
  description:
    "Como cada métrica da Quants Robôs é calculada, como os dados são coletados do MetaTrader 5, o que é custo e o que é normalização por contrato.",
};

const SECOES = [
  { id: "coleta", titulo: "Como os dados chegam" },
  { id: "normalizacao", titulo: "Por contrato" },
  { id: "custos", titulo: "Bruto e líquido" },
  { id: "operacao", titulo: "O que é uma operação" },
  { id: "resultado", titulo: "Resultado do dia, mês, ano e acumulado" },
  { id: "mep-men", titulo: "MEP e MEN do dia" },
  { id: "drawdown", titulo: "Drawdown e recuperação" },
  { id: "taxa-acerto", titulo: "Taxa de acerto" },
  { id: "fator-lucro", titulo: "Fator de lucro" },
  { id: "payoff", titulo: "Payoff" },
  { id: "sequencias", titulo: "Sequências e dias" },
  { id: "capital-minimo", titulo: "Capital mínimo recomendado" },
  { id: "indices-risco", titulo: "Calmar, recovery factor, Ulcer e tempo em drawdown" },
  { id: "risco-de-ruina", titulo: "Risco de ruína" },
  { id: "faixas", titulo: "Validação de faixas" },
  { id: "periodos", titulo: "Períodos e dia de pregão" },
  { id: "glossario", titulo: "Glossário" },
];

// o mesmo limite que decide o selo "Sem atualização" (lib/stats/pregao), para o texto não descolar dele
const MINUTOS_SEM_SINAL = formatarNumero(LIMITE_SEM_HEARTBEAT_SEG / 60);

// os números das regras de faixa saem dos parâmetros padrão de lib/stats/faixas (19/09/2026), como o lote
// no glossário: se o padrão mudar lá, o texto muda junto
const PF = PARAMETROS_FAIXAS_PADRAO;
const vezes = (v: number) => `${formatarNumero(v, Number.isInteger(v) ? 0 : 1)}×`;

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{titulo}</h2>
      <div className="space-y-3 text-pretty text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </section>
  );
}

/**
 * Um indicador (19/09/2026, Artur: "as explicações sobre os indicadores devem ser de fácil entendimento, para
 * qualquer leigo entender"): primeiro o que o número quer dizer, com o mesmo texto do i ao lado dele no site
 * (GLOSSARIO), e depois a conta, para quem quiser refazer. As regras de cálculo são as de antes.
 * `nome` põe o nome do glossário em cima, quando a seção junta mais de um indicador.
 */
function Indicador({ chave, nome = false, children }: { chave: ChaveIndicador; nome?: boolean; children?: React.ReactNode }) {
  const g = GLOSSARIO[chave];
  return (
    <div className="space-y-1.5">
      {nome ? <h3 className="font-medium text-foreground">{g.nome}</h3> : null}
      <p className="text-foreground">{g.texto}</p>
      {children ? (
        <p>
          <strong className="font-medium">Como se calcula:</strong> {children}
        </p>
      ) : null}
    </div>
  );
}

/** Spec §8.7: definição de cada métrica, coleta, custos, normalização e glossário. */
export default function PaginaMetodologia() {
  const indice = (
    <ol className="space-y-1 text-sm">
      {SECOES.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">
            {s.titulo}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="conteudo grid gap-8 py-8 lg:grid-cols-[220px_1fr] lg:gap-10 lg:py-10">
      {/* o índice só no computador, na lateral; no celular a página se lê de cima a baixo (18/09/2026).
          O rótulo "Seções" em caixa alta é rótulo de grupo e fica, por preferência do dono (19/09/2026) */}
      <nav aria-label="Seções" className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Seções</p>
        {indice}
      </nav>

      <article className="max-w-prose space-y-12">
        <header className="space-y-3">
          <Voltar href="/">Início</Voltar>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Metodologia</h1>
          <p className="text-lg text-muted-foreground">
            Cada número do site pode ser refeito a partir das operações listadas na aba Operações de cada robô.
          </p>
        </header>

        <Secao id="coleta" titulo="Como os dados chegam">
          <p>
            Em cada MetaTrader 5 da Quants Robôs roda um coletor: um programa que <strong>não opera</strong>, só lê a
            conta. A cada negócio executado ele envia o registro para o site na hora. A cada 3 segundos envia também
            saldo, posições abertas e cotação. Ao iniciar, reenvia os últimos dias para conferência.
          </p>
          <p>
            Nada é digitado à mão. Se o coletor parar por mais de {MINUTOS_SEM_SINAL} minutos em horário de pregão, o site avisa{" "}
            <strong>&quot;sem atualização&quot;</strong> em vez de mostrar dado velho como se fosse ao vivo.
          </p>
          <p>
            Cada robô tem uma <strong>conta principal</strong>, que alimenta as estatísticas públicas. Quando essa conta é
            demo, o site mostra um selo &quot;conta demo&quot; ao lado do nome.
          </p>
          <p>
            Um robô pode ter um <strong>horário mínimo de operação</strong>. Operações abertas antes desse horário ficam
            fora do site e das estatísticas, embora continuem registradas. O horário vale para todo o histórico do robô,
            então a curva, os números e os relatórios usam o mesmo conjunto de operações.
          </p>
        </Secao>

        <Secao id="normalizacao" titulo="Por contrato">
          <p>
            Todo valor é dividido pela quantidade de contratos da operação. Um gain de R$&nbsp;60 com 2 contratos aparece como{" "}
            <strong>R$&nbsp;30 por contrato</strong>. Assim, contas com tamanhos de posição diferentes não distorcem a média, e
            você multiplica pelo número de contratos que pretende usar.
          </p>
          <p>
            Os pontos viram reais pelo valor do ponto de cada ativo: <strong>WIN R$&nbsp;0,20</strong> e{" "}
            <strong>WDO R$&nbsp;10,00</strong> por ponto, por contrato. O código do contrato muda a cada vencimento (WINV26,
            WINZ26…), mas tudo é agrupado pelo ativo.
          </p>
        </Secao>

        <Secao id="custos" titulo="Bruto e líquido">
          <p>
            <strong>Bruto</strong> é o resultado como o MetaTrader informa, antes dos custos. <strong>Líquido</strong> é o
            bruto menos um custo fixo por contrato em cada operação (corretagem e taxas da bolsa), configurado por robô e
            mostrado na seção Transparência de cada um. O site mostra o líquido; o bruto aparece ao lado dele no painel de
            resultado, nos relatórios mensais e no filtro Custos da aba Desempenho.
          </p>
          <p>
            Gain e loss são decididos sempre pelo <strong>líquido</strong>: uma operação que ganhou R$&nbsp;0,10 bruto e
            pagou R$&nbsp;0,25 de custo conta como loss.
          </p>
        </Secao>

        <Secao id="operacao" titulo="O que é uma operação">
          <p>
            Uma operação vai da entrada do robô no mercado até a posição zerar. Quando ele entra em partes, vale o preço
            médio das entradas; quando sai em partes, o preço médio das saídas. Nas duas médias, cada parte pesa pelo
            número de contratos. Se o robô vira a mão, passando de comprado para vendido (ou o contrário) sem zerar, uma
            operação fecha ali e outra começa.
          </p>
          <p>
            Os <strong>pontos por contrato</strong> são a diferença entre a saída e a entrada, a favor da posição: na
            compra, saída menos entrada; na venda, entrada menos saída. O resultado em reais é o do MetaTrader, para bater
            no centavo com o relatório da corretora.
          </p>
        </Secao>

        <Secao id="resultado" titulo="Resultado do dia, mês, ano e acumulado">
          <Indicador chave="resultadoPeriodo">
            soma do resultado por contrato, já com custos, das operações fechadas no período. Cada operação conta no dia
            de pregão em que fechou, pelo horário de Brasília.
          </Indicador>
          <Indicador chave="mediaMensal" nome>
            o acumulado dividido pelo número de meses com pregão na série.
          </Indicador>
        </Secao>

        <Secao id="mep-men" titulo="MEP e MEN do dia">
          <Indicador chave="mep" nome />
          <Indicador chave="men" nome />
          <p>
            <strong>Como se calcula:</strong> a cada operação que fecha, o site soma o resultado do dia até ali, já com
            custos e por 1 contrato. O MEP é o maior valor positivo dessa soma e o MEN, o menor valor negativo. Se a soma
            nunca ficou positiva, o MEP é zero e não há operação do MEP; o mesmo vale para o MEN. Em empate, o site aponta a
            primeira operação em que o extremo aconteceu.
          </p>
          <p>
            Como só olha os fechamentos, sem a posição aberta, o número fica sempre <strong>igual ou mais perto de zero</strong>{" "}
            que o MEP/MEN do Profit, que acompanha o resultado a cada negócio, incluindo a posição em andamento.
          </p>
        </Secao>

        <Secao id="drawdown" titulo="Drawdown e recuperação">
          <Indicador chave="drawdown">
            a curva de capital soma o resultado dia a dia. O drawdown de cada dia é a distância entre a curva e o maior
            valor que ela já tinha atingido. O drawdown máximo é a maior dessas distâncias no período, em reais por
            contrato e, quando há capital de referência, em porcentagem dele.
          </Indicador>
          <Indicador chave="tempoRecuperacao" nome>
            os dias corridos entre o último dia no topo e o primeiro dia em que a curva voltou a ele. Se ainda não voltou,
            aparece &quot;em recuperação&quot;.
          </Indicador>
        </Secao>

        <Secao id="taxa-acerto" titulo="Taxa de acerto">
          <Indicador chave="taxaAcerto">número de operações com resultado líquido positivo dividido pelo total de operações.</Indicador>
        </Secao>

        <Secao id="fator-lucro" titulo="Fator de lucro">
          <Indicador chave="fatorLucro">
            a soma de todos os gains dividida pela soma de todos os losses, sem o sinal de menos. Sem nenhum loss no período,
            a conta dividiria por zero, e o fator fica sem valor.
          </Indicador>
        </Secao>

        <Secao id="payoff" titulo="Payoff">
          <Indicador chave="payoff">o ganho médio dividido pela perda média, sem o sinal de menos.</Indicador>
        </Secao>

        <Secao id="sequencias" titulo="Sequências e dias">
          <Indicador chave="maiorSequencia" nome />
          <Indicador chave="diasPositivosNegativos" nome>
            olha o resultado líquido de cada dia de pregão. Melhor e pior dia são o maior e o menor desses resultados.
          </Indicador>
        </Secao>

        <Secao id="capital-minimo" titulo="Capital mínimo recomendado">
          <Indicador chave="capitalMinimo">
            por contrato, <strong>margem de referência + drawdown máximo × fator de segurança</strong>. O fator padrão é
            1,5. A margem é a exigida pela corretora para manter um contrato em day trade e é configurada por ativo. É uma
            referência de conforto, não uma garantia.
          </Indicador>
        </Secao>

        <Secao id="indices-risco" titulo="Calmar, recovery factor, Ulcer e tempo em drawdown">
          <Indicador chave="calmar" nome>
            <strong>retorno anualizado ÷ drawdown máximo</strong>. O retorno anualizado é o resultado do período
            multiplicado por 252 (o número usual de pregões num ano) e dividido pelo número de dias de pregão do período.
          </Indicador>
          <Indicador chave="recoveryFactor" nome>
            <strong>resultado do período ÷ drawdown máximo</strong>.
          </Indicador>
          <Indicador chave="ulcer" nome>
            a <strong>raiz quadrada da média dos quadrados do drawdown de cada dia</strong>. Elevar ao quadrado pesa mais as
            quedas fundas. Fica em % do capital de referência quando ele existe.
          </Indicador>
          <Indicador chave="tempoEmDrawdown" nome>
            a fração dos dias de pregão em que a curva estava abaixo do último topo.
          </Indicador>
        </Secao>

        <Secao id="risco-de-ruina" titulo="Risco de ruína">
          <Indicador chave="riscoRuina">
            é a aproximação clássica da ruína do apostador. <strong>E = acerto × payoff − (1 − acerto)</strong> é o ganho
            esperado por operação, contado em perdas médias; <strong>unidades = capital de referência ÷ perda média</strong> é quantas
            perdas médias seguidas o capital aguenta; e <strong>risco = ((1 − E) ÷ (1 + E)) ^ unidades</strong>. Se E for
            zero ou negativo, o risco é 100%: sem expectativa positiva, é questão de tempo.
          </Indicador>
          <p>
            <strong>Por que aparece 0,0%.</strong> Com expectativa positiva, a base da conta fica abaixo de 1, e o capital de
            referência costuma cobrir centenas de perdas médias. Um número abaixo de 1 elevado a centenas cai muito rápido:
            com a base em 0,95, bastam 150 perdas médias para o resultado ficar abaixo de 0,05%, e o site mostra 0,0%. Só
            quando a expectativa é quase zero a base fica tão perto de 1 que o risco continua alto. A conta supõe perdas
            espalhadas, uma independente da outra; na prática elas vêm juntas em dias ruins, e é o drawdown máximo que mostra
            o tamanho desse pior momento. O risco de ruína serve como ordem de grandeza, não como probabilidade exata.
          </p>
        </Secao>

        <Secao id="faixas" titulo="Validação de faixas">
          <Indicador chave="faixa" />
          <p>
            As faixas vão de segunda a sexta, das 9h às 17h, e cada operação entra na do dia e da hora em que abriu. Para
            cada faixa, o site calcula três números.
          </p>
          <Indicador chave="taxaAcerto" nome>
            operações da faixa com resultado líquido positivo ÷ operações da faixa. As regras chamam esse número de
            consistência.
          </Indicador>
          <Indicador chave="recuperacaoFaixa" nome>
            <strong>resultado líquido da faixa ÷ drawdown máximo da faixa</strong>, com a curva somada operação a operação.
          </Indicador>
          <Indicador chave="ddRelativo" nome>
            <strong>drawdown da faixa ÷ mediana dos drawdowns</strong> das faixas com a amostra mínima.
          </Indicador>
          <p>
            <strong>Classificação</strong>, com os parâmetros padrão e nesta ordem. Faixa com menos de{" "}
            <strong>{formatarNumero(PF.amostraMinima)} operações</strong> fica sem classificação: com tão poucas, o resultado
            pode ser sorte ou azar. <strong>Evitar</strong> se qualquer uma valer: acerto abaixo de{" "}
            {formatarPct(PF.evitar.acertoMax, 0)}, recuperação abaixo de {formatarMultiplo(PF.evitar.recuperacaoMax)} ou
            drawdown relativo acima de {vezes(PF.evitar.ddRelativoMin)}. <strong>Ligar</strong> se acerto ≥{" "}
            {formatarPct(PF.ligar.acertoMin, 0)}, recuperação ≥ {formatarMultiplo(PF.ligar.recuperacaoMin)} e drawdown
            relativo ≤ {vezes(PF.ligar.ddRelativoMax)}. <strong>Cautela</strong> se acerto ≥ {formatarPct(PF.cautela.acertoMin, 0)}{" "}
            e recuperação ≥ {formatarMultiplo(PF.cautela.recuperacaoMin)}. O resto é <strong>Neutro</strong>. Os parâmetros em
            uso estão em Regras, na aba Faixas de cada robô.
          </p>
          <Indicador chave="lote" nome />
          <Indicador chave="score" nome>
            <strong>50 × percentil da expectativa</strong> entre as faixas (0 para a pior, 1 para a melhor){" "}
            <strong>+ 30 × estabilidade</strong> (meses positivos ÷ meses com operação){" "}
            <strong>+ 20 × confiança</strong> (operações ÷ 100, no máximo 1). Faixa com expectativa zero ou negativa fica
            com no máximo 40. As frases de &quot;O que as regras apontam&quot; saem de regras fixas aplicadas a esses números.
          </Indicador>
        </Secao>

        <Secao id="periodos" titulo="Períodos e dia de pregão">
          <p>
            Dia de pregão é a data em Brasília. Sábados, domingos e feriados da B3 não contam como dia.
          </p>
          <p>
            Os atalhos de período terminam hoje: <strong>Hoje</strong> é o dia corrente, vazio em fim de semana e
            feriado; <strong>Semana</strong> vai de segunda-feira até hoje; <strong>Mês</strong>, do dia 1º até hoje;{" "}
            <strong>Ano</strong>, de 1º de janeiro até hoje; <strong>Tudo</strong> é o histórico inteiro.{" "}
            <strong>Personalizado</strong>, na aba Desempenho, é qualquer intervalo entre duas datas.
          </p>
        </Secao>

        <Secao id="glossario" titulo="Glossário">
          <dl className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <dt className="font-medium text-foreground">WIN / WDO</dt>
            <dd>Mini índice Bovespa e mini dólar, contratos futuros da B3.</dd>
            <dt className="font-medium text-foreground">Contrato</dt>
            <dd>Unidade mínima negociada. O resultado do site é sempre por 1 contrato.</dd>
            <dt className="font-medium text-foreground">Magic number</dt>
            <dd>
              Termo do MetaTrader 5: o número que cada robô grava nas próprias ordens. É como o site sabe qual robô fez
              cada operação.
            </dd>
            <dt className="font-medium text-foreground">Sinal do coletor</dt>
            <dd>Saldo, posições abertas e cotação que o coletor manda a cada 3 segundos.</dd>
            <dt className="font-medium text-foreground">Flutuante</dt>
            <dd>Resultado da posição aberta se fosse fechada agora, por contrato.</dd>
            <dt className="font-medium text-foreground">MEP / MEN</dt>
            <dd>Máxima exposição positiva e negativa do dia: o ponto mais alto e o mais baixo do acumulado do dia, medidos a cada fechamento de operação.</dd>
          </dl>
          {/* 19/09/2026: os selos ao lado do nome do robô, com as condições de statusAoVivo (lib/stats/status-robo) */}
          <h3 id="status" className="scroll-mt-24 pt-4 text-base font-semibold text-foreground">
            Selo de status
          </h3>
          <dl className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <dt className="font-medium text-foreground">Operando</dt>
            <dd>Pregão aberto, sinal do coletor em dia, sem posição aberta e dentro do horário de operação do robô.</dd>
            <dt className="font-medium text-foreground">Posicionado</dt>
            <dd>Pregão aberto, sinal do coletor em dia e o robô com posição aberta agora.</dd>
            <dt className="font-medium text-foreground">Fora do horário</dt>
            <dd>Pregão do ativo fechado; ou pregão aberto, sinal em dia, sem posição e fora do horário de operação do robô.</dd>
            <dt className="font-medium text-foreground">Sem atualização</dt>
            <dd>Pregão aberto e o coletor sem mandar sinal há mais de {MINUTOS_SEM_SINAL} minutos.</dd>
            <dt className="font-medium text-foreground">Histórico</dt>
            <dd>O robô não tem coletor no MetaTrader 5: os números vêm só do histórico importado.</dd>
            <dt className="font-medium text-foreground">Em breve</dt>
            <dd>O robô ainda não começou a operar em conta real.</dd>
            <dt className="font-medium text-foreground">Pausado</dt>
            <dd>O robô parou de operar; o histórico continua no site.</dd>
            {/* 19/09/2026: o arquivado sai da home, do menu e do Comparativo, mas robos_publico ainda o
                devolve e /robos/[slug] continua abrindo */}
            <dt className="font-medium text-foreground">Arquivado</dt>
            <dd>O robô saiu da lista do site; a página e o histórico continuam no endereço dele.</dd>
          </dl>
        </Secao>

        <p className="text-sm text-muted-foreground">
          Dúvida sobre algum número? Fale com a equipe pela{" "}
          <Link href="/#comunidade" className="underline underline-offset-4 hover:text-foreground">
            comunidade
          </Link>
          .
        </p>
      </article>
    </div>
  );
}
