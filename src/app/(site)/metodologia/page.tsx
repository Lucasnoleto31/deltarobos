import type { Metadata } from "next";
import Link from "next/link";
import { GLOSSARIO, type ChaveIndicador } from "@/components/compartilhados/glossario";
import { RevelarNaRolagem } from "@/components/compartilhados/RevelarNaRolagem";
import { NavSecoes } from "@/components/layout/NavSecoes";
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
  { id: "operacoes-em-aberto", titulo: "Operações em aberto" },
  { id: "resultado", titulo: "Resultado do dia, mês, ano e acumulado" },
  { id: "mep-men", titulo: "MEP e MEN do dia" },
  { id: "curva-do-dia", titulo: "A curva do dia" },
  { id: "drawdown", titulo: "Drawdown e recuperação" },
  { id: "taxa-acerto", titulo: "Taxa de acerto" },
  { id: "fator-lucro", titulo: "Fator de lucro" },
  { id: "payoff", titulo: "Payoff" },
  { id: "sequencias", titulo: "Sequências e dias" },
  { id: "capital-minimo", titulo: "Capital mínimo recomendado" },
  { id: "simulador", titulo: "Simulador com o meu capital" },
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
    // 19/09/2026: sem scroll-mt aqui — o scroll-padding-top do html (globals.css) já desconta o
    // cabeçalho fixo, e os dois somavam, deixando a seção quase 100 px abaixo do necessário.
    // A entrada ao rolar fica DENTRO da <section>, nunca nela: quem carrega o id não pode ser o
    // elemento que translada, senão o clique na âncora mira a posição ainda deslocada e o título
    // termina encostado no cabeçalho (medido: 12 px a menos de folga). A casca parada não aparece,
    // porque a <section> não tem fio nem fundo — o que entra é o texto inteiro, de uma vez só.
    <section id={id}>
      <RevelarNaRolagem className="space-y-3" desloca={10}>
        <h2 className="text-xl font-semibold tracking-tight">{titulo}</h2>
        <div className="space-y-3 text-pretty text-muted-foreground [&_strong]:text-foreground">{children}</div>
      </RevelarNaRolagem>
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
  return (
    <div className="conteudo grid gap-8 py-8 lg:grid-cols-[220px_1fr] lg:gap-10 lg:py-10">
      {/* o índice só no computador, na lateral; no celular a página se lê de cima a baixo (18/09/2026).
          O rótulo "Seções" em caixa alta é rótulo de grupo e fica, por preferência do dono (19/09/2026).
          19/09/2026: o índice acompanha a rolagem e marca a seção que está sendo lida (NavSecoes); o
          pl-3 do rótulo alinha com os links, que agora têm o fio da marca à esquerda. A altura máxima é
          a da tela menos o cabeçalho: com 18 seções a lista rola no próprio lugar em tela baixa. */}
      <nav aria-label="Seções" className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
        <p className="mb-2 pl-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Seções</p>
        <NavSecoes secoes={SECOES.map(({ id, titulo }) => ({ id, rotulo: titulo }))} />
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
            saldo, posições abertas e cotação. Ao iniciar, reenvia os últimos dias para conferência. Desde a versão
            1.1.0, mede também, a cada movimento do preço, o MFE e o MAE de cada operação e o MEP e o MEN do dia; desde
            a 1.1.2, guarda a cada 5 segundos o saldo do dia com a posição aberta, que desenha a curva do dia (ver
            abaixo).
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
          <p>
            Também pode ter uma <strong>duração mínima</strong>: operações coletadas do MetaTrader abertas e fechadas em
            menos tempo que isso ficam fora (o histórico importado não tem duração e não entra nessa regra). A regra existe porque a conta pode preencher uma ordem a mercado num preço
            defasado e bater o alvo milissegundos depois, um ganho que nenhuma corretora daria de verdade; esses
            registros continuam no banco, mas não entram na performance.
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

        {/* 21/09/2026: o contador "operações em aberto" da barra, dos cards, do Hoje ao vivo e da tela Ao vivo */}
        <Secao id="operacoes-em-aberto" titulo="Operações em aberto">
          <p>
            <strong>Operações em aberto</strong> é quantas entradas o robô fez e ainda não fechou neste momento, na conta
            principal. Cada entrada ainda aberta conta 1: se o robô entrou duas vezes e nenhuma zerou, são 2 operações em
            aberto; quando uma delas fecha, o número cai. É uma contagem de entradas, não de contratos: o site não mostra
            quantos contratos há em cada entrada nem o tamanho da conta.
          </p>
          <p>
            O número vem do sinal do coletor, que manda as posições abertas a cada 3 segundos, e aparece na barra da
            home, no card do robô, no painel Hoje ao vivo e na tela Ao vivo. Respeita o atraso configurável de cada robô:
            uma entrada só passa a contar depois desse atraso. Fora do pregão o contador não aparece, e se o coletor ficar
            mais de {MINUTOS_SEM_SINAL} minutos sem mandar sinal ele some, pela mesma regra do selo{" "}
            <strong>&quot;sem atualização&quot;</strong>.
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

        {/* 22/09/2026: duas fontes. O coletor 1.1.0 mede tick a tick (o número do Profit); antes dele, por fechamento */}
        <Secao id="mep-men" titulo="MEP e MEN do dia">
          <Indicador chave="mep" nome />
          <Indicador chave="men" nome />
          <p>
            <strong>Medido no MT5, tick a tick.</strong> Desde a versão 1.1.0 do coletor, o próprio MetaTrader 5 mede o MEP e
            o MEN: a cada movimento do preço, o coletor soma o que o robô já realizou no dia com o flutuante das posições
            abertas, por 1 contrato, e guarda o maior e o menor valor, com a hora e quantas operações já tinham fechado. É
            o mesmo número do Profit. O site mostra esse valor já com custos: do bruto medido, desconta o custo por
            contrato de cada operação fechada até o momento do extremo (a posição ainda aberta não pagou custo). No detalhe
            do dia, no calendário, e no painel &quot;Hoje ao vivo&quot; aparece <strong>&quot;medido no MT5, tick a tick&quot;</strong>;
            quando o coletor subiu com o dia já em andamento, ou reiniciou no meio dele, aparece também{" "}
            <strong>&quot;parcial&quot;</strong>, porque um extremo anterior pode ter ficado de fora. Desde a 1.1.1 o coletor
            recebe do site as regras que tiram operações da conta pública (hora mínima, duração mínima) e mede o saldo já
            sem elas; num dia medido sem essas regras (coletor 1.1.0) em que alguma operação ficou fora, o site volta ao
            cálculo por fechamento, para o número bater com a curva do dia. A partir do coletor 1.1.2 o caminho inteiro
            entre esses dois extremos aparece na{" "}
            <Link href="#curva-do-dia" className="underline underline-offset-4 hover:text-foreground">
              curva do dia
            </Link>
            .
          </p>
          <p>
            <strong>Por fechamento.</strong> Nos dias sem essa medição (antes do coletor 1.1.0, histórico importado, conta com
            o coletor antigo), o site calcula: a cada operação que fecha, soma o resultado do dia até ali, já com custos e
            por 1 contrato. O MEP é o maior valor positivo dessa soma e o MEN, o menor valor negativo. Se a soma nunca ficou
            positiva, o MEP é zero e não há operação do MEP; o mesmo vale para o MEN. Em empate, o site aponta a primeira
            operação em que o extremo aconteceu. Como só olha os fechamentos, sem a posição aberta, esse número fica
            sempre <strong>igual ou mais perto de zero</strong> que o do Profit, e o detalhe do dia diz{" "}
            <strong>&quot;por fechamento&quot;</strong>.
          </p>
          <Indicador chave="mfe" nome />
          <Indicador chave="mae" nome />
          <p>
            <strong>Como se calcula:</strong> enquanto a operação está aberta, o coletor confere a cada negócio do ativo a
            diferença entre o preço do momento e o preço de entrada, a favor da posição: na compra, preço menos entrada; na
            venda, entrada menos preço. O MFE é a maior dessas diferenças (nunca abaixo de zero) e o MAE a menor (nunca
            acima), em pontos por 1 contrato. Aparecem na lista de operações (coluna &quot;MFE / MAE&quot;) e no CSV; ficam
            vazios nas operações que o coletor 1.1.0 não acompanhou, e marcados como parciais quando ele subiu com a
            operação já aberta.
          </p>
        </Secao>

        {/* 23/09/2026: a curva real do dia (coletor 1.1.2, migration 0024). A conta é a de lib/stats/saldo-dia
            (liquidarSerie, dentesPorOperacao); como no MEP/MEN, a tela diz qual foi a fonte do dia mostrado */}
        <Secao id="curva-do-dia" titulo="A curva do dia">
          <Indicador chave="curvaDoDia" nome />
          <p>
            <strong>Medida no MT5.</strong> Desde a versão 1.1.2 do coletor, a cada 5 segundos o MetaTrader 5 fecha um
            intervalo com o menor, o maior e o último valor do saldo do dia com a posição aberta, por 1 contrato: é o
            mesmo saldo que alimenta o MEP e o MEN. O site desenha a linha pelo último valor de cada intervalo e a faixa
            clara entre o menor e o maior. O valor mostrado é líquido: do bruto medido, desconta o custo por contrato de
            cada operação fechada antes do fim daquele intervalo (a posição ainda aberta não pagou custo). Por isso o
            pico e o vale dessa curva podem diferir do MEP e do MEN da seção anterior em um custo por contrato, quando a
            saída cai no mesmo intervalo do extremo: a curva paga o custo no intervalo da saída, e o MEP e o MEN medidos
            descontam só as saídas anteriores ao extremo. Robô com mais de uma medição no mesmo intervalo mostra a soma
            delas, sem a faixa, com o aviso <strong>&quot;aproximado&quot;</strong>. Se o coletor subiu com o dia em
            andamento, a curva começa quando a medição começou (sem rampa desde a abertura), com a nota{" "}
            <strong>&quot;medido a partir de HH:MM&quot;</strong>, e as saídas anteriores já entram no realizado. No painel
            &quot;Hoje ao vivo&quot;, na tela Ao vivo e no detalhe do dia do calendário, o título diz{" "}
            <strong>&quot;medido no MT5&quot;</strong>.
          </p>
          <p>
            <strong>Por fechamento.</strong> Nos dias sem a série (antes do coletor 1.1.2, histórico importado, conta com o
            coletor antigo), o site soma o resultado operação por operação, na ordem em que fecharam, e rotula a curva{" "}
            <strong>&quot;por fechamento&quot;</strong>, como o MEP e o MEN da seção anterior. Essa curva só passa pelos
            fechamentos: o que a posição aberta chegou a ganhar ou perder no meio do caminho não aparece nela.
          </p>
          <Indicador chave="faixaSaldo" nome />
          <Indicador chave="dentesExcursao" nome />
          <p>
            <strong>Como se calcula o dente:</strong> nas curvas por operação (a aba &quot;Por operação&quot; da curva de
            capital, o detalhe do dia e a curva por fechamento), cada operação medida ganha um traço vertical que vai do
            saldo antes da operação mais o MAE até o saldo antes da operação mais o MFE, convertidos em reais pelo valor
            do ponto (ou deixados em pontos, quando a curva está em pontos) e multiplicados pelos contratos escolhidos. O
            custo não entra no traço, porque só é pago no fechamento. Quando a curva agrupa operações vizinhas, o traço
            cobre o pior MAE e o melhor MFE do grupo. A dica de cada ponto mostra &quot;MFE / MAE&quot; em pontos por
            contrato.
          </p>
        </Secao>

        <Secao id="drawdown" titulo="Drawdown e recuperação">
          <Indicador chave="drawdown">
            a curva de capital soma o resultado dia a dia. O drawdown de cada dia é a distância entre a curva e o maior
            valor que ela já tinha atingido. O drawdown máximo é a maior dessas distâncias no período, em reais por
            contrato e, quando há capital de referência, em porcentagem dele.
          </Indicador>
          <p>
            Na aba &quot;Por operação&quot; da curva, cada ponto é uma operação fechada, ligada à seguinte, uma a uma (até
            20 mil operações no período; acima disso o site agrupa operações vizinhas). Como essa curva passa pelo saldo no
            meio de cada pregão, o drawdown por operação pode ser maior que o drawdown por dia, que só olha o fechamento de
            cada dia.
          </p>
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
            1,5, e o drawdown é o de todo o histórico do robô, seja qual for o período escolhido na aba Risco. A margem é
            a exigida pela corretora para manter um contrato em day trade e é configurada por ativo. É uma referência de
            conforto, não uma garantia.
          </Indicador>
        </Secao>

        {/* 23/09/2026: a página /simulador (spec §8.6). A conta é a de lib/stats/simulador: soma ponderada das séries
            diárias públicas, drawdown em % sobre o capital inicial informado e capital mínimo pela regra logo acima */}
        <Secao id="simulador" titulo="Simulador com o meu capital">
          <Indicador chave="simulador">
            para cada dia de pregão,{" "}
            <strong>
              resultado = soma, sobre os robôs escolhidos, de contratos × resultado líquido por contrato do robô no dia
            </strong>{" "}
            (dia em que o robô não operou conta zero), sobre as mesmas séries diárias públicas do site. O patrimônio
            simulado é o capital informado mais esse resultado acumulado, dia a dia. O drawdown é medido nessa curva como
            na curva de capital; em porcentagem, é dividido pelo <strong>capital inicial informado</strong>, não pelo
            patrimônio do momento. O capital mínimo da carteira é a soma, por robô, de contratos × capital mínimo por
            contrato (a regra acima, com o drawdown máximo de todo o histórico do robô, e não só do período escolhido).
            Os períodos são 3 meses, 12 meses, ano e tudo, todos terminando hoje. Dia de pregão é o dia em que algum robô
            escolhido operou: dia sem operação de nenhum não entra na contagem nem interrompe a sequência negativa; dia em
            que a soma dá zero interrompe. O pior mês é a menor soma mensal dentro do período, e os meses das pontas podem
            estar incompletos (3 e 12 meses começam no dia do mês de hoje; o mês corrente está em andamento): a tela diz
            quantos pregões entraram.
          </Indicador>
          <Indicador chave="semaforoCapital" nome>
            <strong>não cabe</strong> se o capital é menor que o capital mínimo ou se o drawdown máximo simulado é maior
            ou igual ao capital (o patrimônio simulado teria zerado); <strong>apertado</strong> se cabe, mas o drawdown
            máximo simulado passa de 25% do capital inicial; <strong>cabe</strong> no resto (25% exatos cabem). O capital
            mínimo por contrato é o número inteiro publicado na aba Risco. Robô sem margem de referência configurada fica
            sem capital mínimo; a soma dos mínimos dos outros robôs escolhidos vale como piso, e acima dele só a regra do
            drawdown decide.
          </Indicador>
          <p>
            <strong>O que o simulador não é.</strong> Não é recomendação de investimento nem projeção de resultado: é
            aritmética sobre o que já aconteceu, e resultado passado não garante resultado futuro; quedas futuras podem
            ser maiores que as do histórico. O custo é o custo fixo por contrato de cada robô, e os custos e a diferença
            de preço na execução de uma conta real podem ser outros. Operar mais contratos que o padrão do robô tem
            liquidez e margem próprias: cada contrato a mais precisa ser preenchido no mercado e exige margem da
            corretora, e o simulador só multiplica o resultado por contrato. O capital mínimo é a referência de conforto
            publicada na aba Risco, não uma garantia.
          </p>
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
          {/* 19/09/2026: primeiro a frase para quem não quer a conta, depois o porquê em números */}
          <p>
            <strong>Por que aparece 0,0%.</strong> Quando o capital de referência cobre centenas de perdas médias, como
            costuma acontecer, a conta dá um número tão pequeno que arredonda para 0,0%. Isso é uma limitação do modelo, não
            uma garantia: ele trata cada perda como se não tivesse relação com as outras, e as perdas reais vêm agrupadas em
            dias ruins. O tamanho desse pior momento aparece no drawdown máximo.
          </p>
          <p>
            Em números: com expectativa positiva, a base da conta fica abaixo de 1, e um número abaixo de 1 elevado a
            centenas cai muito rápido. Com a base em 0,95, bastam 150 perdas médias para o resultado ficar abaixo de 0,05%,
            e o site mostra 0,0%. Só quando a expectativa é quase zero a base fica tão perto de 1 que o risco continua alto.
            O risco de ruína serve como ordem de grandeza, não como probabilidade exata.
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
            <dt className="font-medium text-foreground">Operações em aberto</dt>
            <dd>Quantas entradas o robô ainda não fechou agora, cada uma contando 1. Nunca é número de contratos.</dd>
            <dt className="font-medium text-foreground">MEP / MEN</dt>
            <dd>
              Máxima exposição positiva e negativa do dia: o ponto mais alto e o mais baixo do saldo do dia. Medidos no
              MetaTrader 5 tick a tick nos dias que o coletor 1.1.0 acompanhou; por fechamento de operação nos outros.
            </dd>
            <dt className="font-medium text-foreground">MFE / MAE</dt>
            <dd>
              Máxima excursão favorável e adversa de uma operação: o máximo que o preço andou a favor e contra enquanto ela
              esteve aberta, em pontos por contrato, medido no MetaTrader 5.
            </dd>
            <dt className="font-medium text-foreground">Série do saldo</dt>
            <dd>
              O saldo do dia com a posição aberta, guardado pelo coletor 1.1.2 a cada 5 segundos (menor, maior e último
              valor de cada intervalo). É o que desenha a curva do dia nos dias medidos.
            </dd>
          </dl>
          {/* 19/09/2026: os selos ao lado do nome do robô, com as condições de statusAoVivo (lib/stats/status-robo) */}
          <h3 id="status" className="pt-4 text-base font-semibold text-foreground">
            Selo de status
          </h3>
          <dl className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <dt className="font-medium text-foreground">Operando</dt>
            <dd>Pregão aberto, sinal do coletor em dia, sem posição aberta e dentro do horário de operação do robô.</dd>
            <dt className="font-medium text-foreground">Posicionado</dt>
            <dd>Pregão aberto, sinal do coletor em dia e o robô com posição aberta agora (1 ou mais operações em aberto).</dd>
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
