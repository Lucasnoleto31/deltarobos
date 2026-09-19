import type { Metadata } from "next";
import Link from "next/link";
import { Voltar } from "@/components/layout/Voltar";
import { formatarNumero } from "@/lib/formato";
import { LIMITE_SEM_HEARTBEAT_SEG } from "@/lib/stats/pregao";

export const metadata: Metadata = {
  title: "Metodologia",
  description:
    "Como cada métrica da Delta Robôs é calculada, como os dados são coletados do MetaTrader 5, o que é custo e o que é normalização por contrato.",
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

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{titulo}</h2>
      <div className="space-y-3 text-pretty text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </section>
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
            Em cada terminal MetaTrader 5 da Delta Robôs roda um coletor (um Expert Advisor que <strong>não opera</strong>,
            só lê a conta). A cada negócio executado ele envia o registro para o site na hora. A cada 3 segundos
            envia também saldo, posições abertas e cotação. Ao iniciar, reenvia os últimos dias para conferência.
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
            então a curva, os KPIs e os relatórios usam o mesmo conjunto de operações.
          </p>
        </Secao>

        <Secao id="normalizacao" titulo="Por contrato">
          <p>
            Todo valor é dividido pela quantidade de contratos da operação. Um gain de R$&nbsp;60 com 2 contratos aparece como{" "}
            <strong>R$&nbsp;30 por contrato</strong>. Assim, contas com lotes diferentes não distorcem a média e você multiplica
            pelo seu tamanho.
          </p>
          <p>
            Pontos viram reais pelo valor do ponto do ativo: <strong>WIN R$&nbsp;0,20</strong> e <strong>WDO R$&nbsp;10,00</strong> por
            ponto por contrato. O símbolo real muda a cada vencimento (WINV26, WINZ26…), mas tudo é agrupado pelo ativo.
          </p>
        </Secao>

        <Secao id="custos" titulo="Bruto e líquido">
          <p>
            <strong>Bruto</strong> é o lucro que o MetaTrader reporta. <strong>Líquido</strong> desconta um custo fixo por
            contrato por operação (corretagem e emolumentos), configurado por robô e exibido na seção Transparência de cada
            um. O site mostra o líquido; o bruto aparece ao lado dele no painel de resultado, nos relatórios mensais e
            no filtro Custos da aba Desempenho.
          </p>
          <p>
            Gain e loss são classificados sempre pelo resultado <strong>líquido</strong>: uma operação de +R$&nbsp;0,10 bruto com
            custo de R$&nbsp;0,25 conta como loss.
          </p>
        </Secao>

        <Secao id="operacao" titulo="O que é uma operação">
          <p>
            Uma operação vai da abertura de uma posição até ela zerar. Entradas parciais viram um preço médio de entrada;
            saídas parciais, um preço médio de saída. Se a posição inverte de lado sem zerar (reversão), fecha um ciclo e
            começa outro.
          </p>
          <p>
            Preço de entrada e saída são <strong>médios ponderados pelo volume</strong>. Pontos por contrato = (saída − entrada)
            no sentido da posição. O resultado em reais é o do MetaTrader, para bater com o relatório da corretora no centavo.
          </p>
        </Secao>

        <Secao id="resultado" titulo="Resultado do dia, mês, ano e acumulado">
          <p>
            Soma do resultado por contrato das operações fechadas no período, pelo dia de pregão do fechamento em horário de
            Brasília. <strong>Média mensal</strong> é o acumulado dividido pelo número de meses com pregão na série.
          </p>
        </Secao>

        <Secao id="mep-men" titulo="MEP e MEN do dia">
          <p>
            <strong>MEP</strong> (máxima exposição positiva) é o maior valor positivo que o resultado acumulado do dia
            atingiu; <strong>MEN</strong> (máxima exposição negativa) é o menor valor negativo desse mesmo acumulado. Os
            dois são medidos <strong>a cada fechamento de operação</strong>, líquidos de custos e por 1 contrato. Se o
            acumulado nunca ficou positivo, o MEP é zero e não há operação do MEP; o mesmo vale para o MEN. Em empate, o
            site aponta a primeira operação em que o extremo ocorreu.
          </p>
          <p>
            Como só olha os fechamentos, sem a posição aberta, o número fica sempre <strong>igual ou menor, em módulo</strong>,
            que o MEP/MEN do Profit, que acompanha o resultado tick a tick incluindo a posição em andamento.
          </p>
        </Secao>

        <Secao id="drawdown" titulo="Drawdown e recuperação">
          <p>
            A curva de capital acumula o resultado dia a dia. <strong>Drawdown</strong> é a distância entre a curva e o maior
            valor que ela já atingiu. O drawdown máximo é a maior dessas distâncias no período, em reais por contrato e, quando
            há capital de referência, em porcentagem dele.
          </p>
          <p>
            <strong>Tempo de recuperação</strong> conta os dias corridos entre o último dia no pico e o primeiro dia em que a
            curva voltou a esse pico. Se ainda não voltou, aparece &quot;em recuperação&quot;.
          </p>
        </Secao>

        <Secao id="taxa-acerto" titulo="Taxa de acerto">
          <p>Número de operações com resultado líquido positivo dividido pelo total de operações.</p>
        </Secao>

        <Secao id="fator-lucro" titulo="Fator de lucro">
          <p>
            Soma de todos os gains dividida pela soma de todos os losses (em valor absoluto). Acima de 1 o robô ganha mais
            do que perde. Sem loss no período, o fator não é definido.
          </p>
        </Secao>

        <Secao id="payoff" titulo="Payoff">
          <p>Gain médio dividido pela perda média, em valor absoluto. Mostra o tamanho relativo do que se ganha e do que se perde.</p>
        </Secao>

        <Secao id="sequencias" titulo="Sequências e dias">
          <p>
            <strong>Maior sequência de gains ou losses</strong> é contada operação a operação, em ordem de fechamento; uma
            operação zerada quebra a sequência. <strong>Dias positivos e negativos</strong> olham o resultado líquido de cada
            dia de pregão. Melhor e pior dia são os extremos dessa série.
          </p>
        </Secao>

        <Secao id="capital-minimo" titulo="Capital mínimo recomendado">
          <p>
            Por contrato: <strong>margem de referência + drawdown máximo × fator de segurança</strong>. O fator padrão é 1,5.
            A margem é a exigida pela corretora para manter um contrato em day trade e é configurada por ativo. É uma
            referência de conforto, não uma garantia: drawdowns futuros podem ser maiores que os passados.
          </p>
        </Secao>

        <Secao id="indices-risco" titulo="Calmar, recovery factor, Ulcer e tempo em drawdown">
          <p>
            <strong>Calmar</strong> = retorno anualizado ÷ drawdown máximo. O retorno anualizado é o resultado do período
            multiplicado por 252 e dividido pelo número de dias de pregão. Acima de 1, o robô rende por ano mais do que o maior drawdown que já sofreu.
          </p>
          <p>
            <strong>Recovery factor</strong> = resultado do período ÷ drawdown máximo. Quantas vezes o robô já &quot;pagou&quot; o
            seu maior drawdown.
          </p>
          <p>
            <strong>Ulcer index</strong> = raiz quadrada da média dos quadrados do drawdown dia a dia. Mede quão fundo e por
            quanto tempo a curva ficou abaixo do pico; em % do capital de referência quando ele existe.
          </p>
          <p>
            <strong>Tempo em drawdown</strong> = fração dos dias de pregão em que a curva estava abaixo do último pico.
          </p>
        </Secao>

        <Secao id="risco-de-ruina" titulo="Risco de ruína">
          <p>
            Aproximação clássica da ruína do apostador: <strong>E = acerto × payoff − (1 − acerto)</strong> é a expectativa
            por unidade arriscada; <strong>unidades = capital de referência ÷ perda média</strong>;{" "}
            <strong>risco = ((1 − E) ÷ (1 + E)) ^ unidades</strong>. Se E for zero ou negativo, o risco é 100%: sem
            expectativa positiva, é questão de tempo. É um indicador de ordem de grandeza, não uma probabilidade exata.
          </p>
        </Secao>

        <Secao id="faixas" titulo="Validação de faixas">
          <p>
            Cada combinação de dia da semana (segunda a sexta) e hora de entrada (9h às 17h) é uma faixa. Para cada uma:{" "}
            <strong>consistência</strong> = taxa de acerto pelo líquido; <strong>recuperação</strong> = resultado líquido ÷
            drawdown máximo da faixa (curva operação a operação); <strong>drawdown relativo</strong> = drawdown da faixa ÷
            mediana dos drawdowns das faixas com amostra mínima.
          </p>
          <p>
            Classificação, com os parâmetros padrão: faixa com menos de <strong>40 operações</strong> fica sem
            classificação. <strong>Evitar</strong> se qualquer uma valer: acerto abaixo de 38%, recuperação abaixo de 0,40
            ou drawdown relativo acima de 6×. <strong>Ligar</strong> se acerto ≥ 58%, recuperação ≥ 0,85 e drawdown relativo
            ≤ 4×. <strong>Cautela</strong> se acerto ≥ 48% e recuperação ≥ 0,60. O resto é <strong>Neutro</strong>. Lote
            sugerido: Ligar&nbsp;100%, Cautela&nbsp;60%, Neutro&nbsp;35%, Evitar&nbsp;0%. Os parâmetros em uso estão em Regras, na aba
            Faixas de cada robô.
          </p>
          <p>
            O <strong>score</strong> de 0 a 100 só ordena o ranking: 50 × percentil da expectativa entre as faixas + 30 ×
            estabilidade (meses positivos ÷ meses) + 20 × confiança (operações ÷ 100). As frases de &quot;O que as regras
            apontam&quot; saem de regras fixas aplicadas a esses números.
          </p>
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
