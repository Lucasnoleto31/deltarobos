import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/compartilhados/Faq";

export const metadata: Metadata = {
  title: "Metodologia",
  description:
    "Como cada métrica da Delta Robôs é calculada, como os dados são coletados do MetaTrader 5, o que é custo e o que é normalização por contrato.",
};

const SECOES = [
  { id: "faq", titulo: "Perguntas frequentes" },
  { id: "coleta", titulo: "Como os dados chegam" },
  { id: "normalizacao", titulo: "Por contrato" },
  { id: "custos", titulo: "Bruto e líquido" },
  { id: "operacao", titulo: "O que é uma operação" },
  { id: "resultado", titulo: "Resultado do dia, mês, ano e acumulado" },
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
    <div className="conteudo grid gap-10 py-10 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Seções" className="lg:sticky lg:top-20 lg:self-start">
        {/* no celular o índice de 17 itens ocupava a primeira tela inteira antes do texto: fica recolhido */}
        <details className="painel group px-4 py-3 lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            Nesta página
            <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="pt-3">{indice}</div>
        </details>
        <div className="hidden lg:block">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Nesta página</p>
          {indice}
        </div>
      </nav>

      <article className="max-w-prose space-y-12">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Metodologia</h1>
          <p className="text-lg text-muted-foreground">
            Cada número do site pode ser refeito à mão a partir das operações listadas. Aqui está a regra de cada um.
          </p>
        </header>

        {/* as respostas curtas primeiro; a regra de cada número vem nas seções abaixo */}
        <section id="faq" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">Perguntas frequentes</h2>
          <Faq />
        </section>

        <Secao id="coleta" titulo="Como os dados chegam">
          <p>
            Em cada terminal MetaTrader 5 da Delta Robôs roda um coletor (um Expert Advisor que <strong>não opera</strong>,
            só lê a conta). A cada negócio executado ele envia o registro para a nossa API na hora. A cada 3 segundos
            envia também saldo, posições abertas e cotação. Ao iniciar, reenvia os últimos dias para conferência.
          </p>
          <p>
            Nada é digitado à mão. Se o coletor parar por mais de 2 minutos em horário de pregão, o site avisa{" "}
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
            Todo valor é dividido pela quantidade de contratos da operação. Um gain de R$ 60 com 2 contratos aparece como{" "}
            <strong>R$ 30 por contrato</strong>. Assim, contas com lotes diferentes não distorcem a média e você multiplica
            pelo seu tamanho.
          </p>
          <p>
            Pontos viram reais pelo valor do ponto do ativo: <strong>WIN R$ 0,20</strong> e <strong>WDO R$ 10,00</strong> por
            ponto por contrato. O símbolo real muda a cada vencimento (WINV26, WINZ26…), mas tudo é agrupado pelo ativo.
          </p>
        </Secao>

        <Secao id="custos" titulo="Bruto e líquido">
          <p>
            <strong>Bruto</strong> é o lucro que o MetaTrader reporta. <strong>Líquido</strong> desconta um custo fixo por
            contrato por operação (corretagem e emolumentos), configurado por robô e exibido na seção Transparência de cada
            um. O site mostra líquido por padrão, com um toggle para ver o bruto.
          </p>
          <p>
            Gain e loss são classificados sempre pelo resultado <strong>líquido</strong>: uma operação de +R$ 0,10 bruto com
            custo de R$ 0,25 conta como loss.
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
            sugerido: 100%, 60%, 35% e 0%. Os parâmetros ficam no banco e podem ser ajustados sem deploy.
          </p>
          <p>
            O <strong>score</strong> de 0 a 100 só ordena o ranking: 50 × percentil da expectativa entre as faixas + 30 ×
            estabilidade (meses positivos ÷ meses) + 20 × confiança (operações ÷ 100). Os &quot;insights&quot; são frases
            geradas por regras fixas a partir desses números.
          </p>
        </Secao>

        <Secao id="periodos" titulo="Períodos e dia de pregão">
          <p>
            Dia de pregão é a data em Brasília. Sábados, domingos e feriados da B3 não contam como dia. Os filtros 7 dias, 30
            dias, 3 meses, 12 meses e ano são contados até hoje; &quot;personalizado&quot; aceita qualquer intervalo.
          </p>
        </Secao>

        <Secao id="glossario" titulo="Glossário">
          <dl className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <dt className="font-medium text-foreground">WIN / WDO</dt>
            <dd>Mini índice Bovespa e mini dólar, contratos futuros da B3.</dd>
            <dt className="font-medium text-foreground">Contrato</dt>
            <dd>Unidade mínima negociada. O resultado do site é sempre por 1 contrato.</dd>
            <dt className="font-medium text-foreground">Magic number</dt>
            <dd>Identificador que cada robô grava nas próprias ordens. É como o site sabe qual robô fez cada operação.</dd>
            <dt className="font-medium text-foreground">Heartbeat</dt>
            <dd>Sinal de vida do coletor, a cada 3 segundos, com saldo, posições e cotação.</dd>
            <dt className="font-medium text-foreground">Posicionado</dt>
            <dd>O robô tem posição aberta neste momento.</dd>
            <dt className="font-medium text-foreground">Flutuante</dt>
            <dd>Resultado da posição aberta se fosse fechada agora, por contrato.</dd>
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
