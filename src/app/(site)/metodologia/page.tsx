import type { Metadata } from "next";
import { Faq } from "@/components/compartilhados/Faq";
import { ComoComecar } from "@/components/home/ComoComecar";
import { TextoDeHoje } from "@/components/home/TextoDeHoje";
import { NavSecoes } from "@/components/layout/NavSecoes";
import { CabecalhoPagina, CorpoPagina, Grade } from "@/components/sistema/Pagina";
import { carregarCasa } from "@/lib/consultas/casa";
import { formatarBRL, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import { HORAS, LOTE_POR_CLASSE, ROTULO_CLASSE } from "@/lib/stats/faixas";
import { LIMITE_SEM_HEARTBEAT_SEG } from "@/lib/stats/pregao";
import { calmar, capitalMinimoRecomendado, recoveryFactor, retornoAnualizado, riscoDeRuina } from "@/lib/stats/risco";
import { acumular, maiorQueda } from "@/lib/stats/serie-casa";
import { LIMITE_APERTADO } from "@/lib/stats/simulador";
import type { RoboPublico } from "@/lib/tipos";
import { AoLado, ComExemplo, Conta, CurvaDeExemplo, Linhas, Secao, Subtitulo, Texto, type Linha } from "./pecas";

// 25/11/2026: a página passou a ler o banco (o link de abertura de conta do "Como começar", o valor do ponto
// de cada ativo, o fator de segurança e as regras dos horários em uso), então revalida como as outras telas
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Como funciona",
  description: "De onde vêm os números da Quants Robôs, como cada um é calculado e como começar a usar um robô.",
};

// O índice ao lado do conteúdo. Os ids são os endereços que as outras telas usam (/metodologia#custos,
// #drawdown, #simulador, #como-comecar…): seção que foi juntada a outra em 25/11/2026 manteve o id num
// subtítulo, num parágrafo ou numa linha (custos, operacoes-em-aberto, periodos, fator-lucro, payoff,
// sequencias, curva-do-dia, risco-de-ruina).
const SECOES = [
  { id: "como-comecar", rotulo: "Como começar" },
  { id: "coleta", rotulo: "De onde vêm os números" },
  { id: "status", rotulo: "O que o site diz do robô agora" },
  { id: "normalizacao", rotulo: "1 contrato e custos" },
  { id: "operacao", rotulo: "O que é uma operação" },
  { id: "resultado", rotulo: "Resultado e períodos" },
  { id: "drawdown", rotulo: "Maior queda" },
  { id: "taxa-acerto", rotulo: "Acertos e operações" },
  { id: "mep-men", rotulo: "Melhor e pior momento do dia" },
  { id: "capital-minimo", rotulo: "Capital mínimo" },
  { id: "simulador", rotulo: "Simular meu capital" },
  { id: "indices-risco", rotulo: "Mais números de risco" },
  { id: "faixas", rotulo: "Melhores horários" },
  { id: "glossario", rotulo: "Palavras do mercado" },
  { id: "perguntas", rotulo: "Perguntas frequentes" },
];

// o mesmo limite que decide a frase "sem atualização no momento" (lib/stats/pregao), para o texto não descolar dele
const MINUTOS_SEM_SINAL = formatarNumero(LIMITE_SEM_HEARTBEAT_SEG / 60);

const reais = (v: number, sinal = false) => formatarBRL(v, { sinal, inteiro: true });
const centavos = (v: number, sinal = false) => formatarBRL(v, { sinal });
const vezes = (v: number) => `${formatarNumero(v, Number.isInteger(v) ? 0 : 1)}×`;

// ── Os exemplos ────────────────────────────────────────────────────────────────────────────────────
// Onde a conta de verdade mora em lib/stats, o exemplo é feito com a MESMA função (acumular, maiorQueda,
// capitalMinimoRecomendado, riscoDeRuina, calmar, recoveryFactor): se a regra mudar lá, o exemplo muda junto.

// a maior queda: seis pregões, com o ponto mais alto no segundo e o mais baixo no quarto
const CURVA_DA_QUEDA = acumular([300, 200, -150, -250, 180, 320].map((valor, i) => ({ dia: `dia ${i + 1}`, valor })));
const QUEDA = maiorQueda(CURVA_DA_QUEDA);

// as operações: 7 com ganho de R$ 100 e 3 com perda de R$ 150
const OPS = { comGanho: 7, ganho: 100, comPerda: 3, perda: 150 };
const OPS_TOTAL = OPS.comGanho + OPS.comPerda;
const OPS_GANHOS = OPS.comGanho * OPS.ganho;
const OPS_PERDAS = OPS.comPerda * OPS.perda;
const OPS_ACERTOS = OPS.comGanho / OPS_TOTAL;
const OPS_RELACAO = OPS.ganho / OPS.perda;

// o risco de ruína das mesmas operações, com um capital que cobre poucas perdas médias e outro que cobre cem
const RUINA = { capital: 3000, capitalFolgado: 15000 };
const RUINA_GANHO_ESPERADO = OPS_ACERTOS * OPS_RELACAO - (1 - OPS_ACERTOS);
const ruinaCom = (capital: number) => riscoDeRuina({ taxaAcerto: OPS_ACERTOS, payoff: OPS_RELACAO, capital, perdaMedia: OPS.perda });

// os números de risco: meio ano de pregões
const RISCO = { resultado: 2000, pregoes: 126, queda: 1000 };

// o capital mínimo: a margem e a maior queda de um robô qualquer
const MINIMO = { margem: 150, queda: 2000 };

// a nota de um horário
const NOTA = { posicao: 0.8, mesesComGanho: 8, meses: 10, operacoes: 50 };
const NOTA_PARTES = [50 * NOTA.posicao, 30 * (NOTA.mesesComGanho / NOTA.meses), 20 * Math.min(1, NOTA.operacoes / 100)];

// os atalhos de período das telas (lib/stats/periodos, components/robo/periodos-resumo e a página inicial)
const PERIODOS: ReadonlyArray<readonly [nome: string, texto: string]> = [
  ["Hoje", "o pregão de hoje"],
  ["Semana", "de segunda-feira até hoje"],
  ["Mês", "do dia 1º até hoje"],
  ["Ano", "de 1º de janeiro até hoje"],
  ["7 dias, 30 dias", "pelo calendário"],
  ["3 meses, 12 meses", "pelo calendário"],
  ["30 pregões", "os últimos 30 com operação"],
  ["Tudo, desde o início", "o histórico inteiro"],
  ["Personalizado", "entre duas datas"],
];

interface AtivoDoSite {
  codigo: string;
  nome: string;
  valorPonto: number;
}

/** Os ativos que os robôs do site operam, na ordem dos robôs: saem do cadastro, nunca do código. */
function ativosDosRobos(robos: readonly RoboPublico[]): AtivoDoSite[] {
  const vistos = new Map<string, AtivoDoSite>();
  for (const r of robos) {
    if (r.status === "arquivado" || vistos.has(r.ativo)) continue;
    vistos.set(r.ativo, { codigo: r.ativo, nome: r.ativo_nome, valorPonto: r.valor_ponto_brl });
  }
  return [...vistos.values()];
}

/** O exemplo da maior queda: a curva com o trecho em vermelho, como nas curvas do site, e a conta dia a dia. */
function ExemploDaQueda() {
  if (!QUEDA) return null;
  const topo = QUEDA.iInicio >= 0 ? CURVA_DA_QUEDA[QUEDA.iInicio] : null;
  const fundo = CURVA_DA_QUEDA[QUEDA.iFundo];
  const alto = topo?.acumulado ?? 0;
  const volta = CURVA_DA_QUEDA.find((p, i) => i > QUEDA.iFundo && p.acumulado >= alto);
  return (
    <AoLado titulo="Exemplo: seis pregões">
      <CurvaDeExemplo
        acumulados={CURVA_DA_QUEDA.map((p) => p.acumulado)}
        queda={QUEDA}
        descricao={`Curva de exemplo: sobe até ${reais(alto)}, cai até ${reais(fundo.acumulado)} e volta a subir. A queda está em vermelho.`}
        className="mt-3"
      />
      <table className="mt-4 w-full">
        <thead>
          <tr className="text-[0.8125rem] text-sutil">
            <th className="pb-1 text-left font-normal">Pregão</th>
            <th className="pb-1 text-right font-normal">No dia</th>
            <th className="pb-1 text-right font-normal">Soma</th>
          </tr>
        </thead>
        <tbody>
          {CURVA_DA_QUEDA.map((p, i) => (
            <tr key={p.dia} className="leading-7">
              <td className="text-muted-foreground">{i + 1}</td>
              <td className="text-right">{reais(p.valor, true)}</td>
              <td className={i > QUEDA.iInicio && i <= QUEDA.iFundo ? "text-right text-negativo" : "text-right"}>{reais(p.acumulado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 flex items-baseline justify-between gap-4 border-t border-(--painel-fio-forte) pt-1.5 leading-7">
        <span>Maior queda</span>
        <span className="font-medium whitespace-nowrap text-negativo">{reais(-QUEDA.valor, true)}</span>
      </p>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
        De {reais(alto)}
        {topo ? `, no ${topo.dia},` : ""} a {reais(fundo.acumulado)}, no {fundo.dia}.
        {volta ? ` No ${volta.dia} a soma volta ao ponto mais alto: a queda foi recuperada.` : ""}
      </p>
    </AoLado>
  );
}

/**
 * "Como funciona" (spec §8.7): de onde vêm os números, como cada um é calculado e como começar.
 *
 * Ficha Mesa, 25/11/2026 (Lucas: "para um leigo está muito difícil de entender"; "coisas que não são
 * necessárias pode tirar"). Era um documento técnico de vinte seções numa coluna estreita; virou um manual:
 * - "Como começar" abre a página (saiu da página inicial; a barra lateral aponta para /metodologia#como-comecar);
 * - o índice fica preso à direita, só em tela larga, e o conteúdo segue alinhado ao título, como nas outras telas;
 * - cada seção diz primeiro o que a coisa é, em palavras de todo dia, depois a conta em palavras e, ao lado,
 *   um exemplo com números. Os nomes são os da tela (maior queda, acertos, melhor e pior momento); o nome
 *   técnico aparece uma vez, pequeno, para quem o conhece de outro lugar;
 * - saíram o histórico de versões do coletor, as repetições entre seções e o que só um desenvolvedor leria.
 *   As regras de cálculo são as mesmas.
 *
 * O texto deixou de vir do GLOSSARIO (era a regra de 19/09/2026: o mesmo texto do "o que é" ao lado do
 * número): o glossário ainda usa os nomes antigos (drawdown, payoff, gain, loss), que a ficha tirou da tela.
 *
 * Nada de robô, ativo, link ou parâmetro fixo no código: o valor do ponto vem do cadastro dos robôs, e o
 * fator de segurança e as regras dos horários são os que o banco tem em uso (carregarCasa, o mesmo que a
 * casca do site já carrega neste render).
 */
export default async function PaginaMetodologia() {
  const casa = await carregarCasa();
  const { links, fatorSeguranca, faixas: regras } = casa.parametros;
  const ativos = ativosDosRobos(casa.robos);
  const ativoDoExemplo = ativos[0] ?? null;

  // 25/11/2026: o estado do robô deixou de ser um selo ("Operando", "Posicionado", "Histórico") e virou uma
  // frase (components/home/frase-de-hoje). Cada linha desenha a frase com o mesmo componente da barra
  // lateral, para o manual nunca descolar da tela; a explicação segue a ordem de statusAoVivo
  // (lib/stats/status-robo): cadastro > sem coletor > pregão fechado > coletor parado > em operação > horário.
  const frases: Linha[] = [
    {
      nome: <TextoDeHoje className="text-sm" robo={{ statusAoVivo: "operando", operouHoje: false, hoje: 0 }} />,
      texto:
        "O pregão está aberto, o coletor está mandando sinal e é horário do robô, mas nenhuma operação fechou hoje. Se o robô está ligado ou não, só a conta sabe.",
    },
    {
      nome: <TextoDeHoje className="text-sm" robo={{ statusAoVivo: "operando", operouHoje: true, hoje: 240, hojeOperacoes: 3 }} />,
      texto: "O resultado das operações que já fecharam hoje, com 1 contrato e já descontados os custos. Continua na tela depois que o pregão fecha.",
    },
    {
      nome: <TextoDeHoje className="text-sm" robo={{ statusAoVivo: "posicionado", operouHoje: false, hoje: 0 }} />,
      texto: "O robô tem pelo menos uma entrada aberta neste momento. Se alguma operação já fechou hoje, o resultado dela vem junto.",
    },
    {
      nome: <TextoDeHoje className="text-sm" robo={{ statusAoVivo: "fora_do_horario", operouHoje: false, hoje: 0 }} />,
      texto: "O pregão está fechado, ou está aberto mas fora do horário do robô, e nenhuma operação fechou hoje.",
    },
    {
      nome: <TextoDeHoje className="text-sm" robo={{ statusAoVivo: "historico", operouHoje: false, hoje: 0, dadosAte: casa.hoje }} />,
      texto: "O robô não tem coletor no MetaTrader 5: os números vêm do histórico importado, até a data indicada.",
    },
    {
      nome: <TextoDeHoje className="text-sm" robo={{ statusAoVivo: "desconhecido", operouHoje: false, hoje: 0 }} />,
      texto: `O pregão está aberto e o coletor não manda sinal há mais de ${MINUTOS_SEM_SINAL} minutos. O que aparece de hoje pode estar atrasado.`,
    },
    // os três estados do cadastro numa linha só: as palavras já dizem o que são.
    // 19/09/2026: o arquivado sai da página inicial, do menu e do Comparativo, mas robos_publico ainda o
    // devolve e /robos/[slug] continua abrindo
    {
      nome: (
        <>
          <TextoDeHoje className="text-sm" robo={{ statusAoVivo: "em_breve", operouHoje: false, hoje: 0 }} />
          <span className="text-muted-foreground">, </span>
          <TextoDeHoje className="text-sm" robo={{ statusAoVivo: "pausado", operouHoje: false, hoje: 0 }} />
          <span className="text-muted-foreground">, </span>
          <TextoDeHoje className="text-sm" robo={{ statusAoVivo: "arquivado", operouHoje: false, hoje: 0 }} />
        </>
      ),
      texto:
        "O robô ainda não começou a operar em conta real, parou de operar ou saiu da lista do site. O histórico que existe continua no endereço dele.",
    },
  ];

  const numerosDasOperacoes: Linha[] = [
    {
      nome: "Acertos",
      tecnico: "taxa de acerto",
      texto: "De cada 100 operações, quantas terminaram com ganho. Sozinho, não diz se o robô ganha dinheiro: depende também do tamanho dos ganhos e das perdas.",
      conta: "operações com ganho ÷ total de operações.",
      exemplo: `${formatarNumero(OPS.comGanho)} ÷ ${formatarNumero(OPS_TOTAL)} = ${formatarPct(OPS_ACERTOS, 0)}`,
    },
    {
      id: "fator-lucro",
      nome: "Fator de lucro",
      texto: "Quanto o robô ganhou para cada R$ 1 perdido. Acima de 1, ganhou mais do que perdeu.",
      conta: "soma dos ganhos ÷ soma das perdas. Sem nenhuma perda no período, fica sem valor.",
      exemplo: `${reais(OPS_GANHOS)} ÷ ${reais(OPS_PERDAS)} = ${formatarMultiplo(OPS_GANHOS / OPS_PERDAS)}`,
    },
    {
      id: "payoff",
      nome: "Ganho médio contra perda média",
      tecnico: "payoff",
      texto: "O tamanho do ganho médio comparado com o da perda média. Quanto menor, mais o robô precisa acertar para lucrar.",
      conta: "ganho médio ÷ perda média.",
      exemplo: `${reais(OPS.ganho)} ÷ ${reais(OPS.perda)} = ${formatarMultiplo(OPS_RELACAO)}`,
    },
    {
      id: "sequencias",
      nome: "Maior sequência",
      texto:
        "O maior número de operações com ganho seguidas e o de operações com perda seguidas, na ordem em que fecharam. Uma operação que fecha em zero interrompe a contagem.",
    },
    {
      nome: "Dias com ganho e com perda",
      texto:
        "Quantos pregões terminaram com ganho e quantos com perda. Dia que fecha em zero não entra em nenhum dos dois e interrompe a sequência de dias com perda.",
    },
  ];

  // 22/09/2026: duas fontes. O coletor 1.1.0 mede a cada movimento do preço, com a operação aberta (o
  // número do Profit); nos dias sem essa medição, a conta é por fechamento. A tela diz qual valeu no dia.
  const fontesDoDia: Linha[] = [
    {
      nome: "Medido no MetaTrader",
      texto:
        "A cada movimento do preço, o coletor soma o que o robô já realizou no dia com o resultado da operação ainda aberta e guarda o maior e o menor valor, já descontado o custo das operações fechadas até ali. Se o coletor começou com o dia em andamento, o número vem marcado como parcial.",
    },
    {
      nome: "Por fechamento",
      texto:
        "Nos dias sem essa medição, como os do histórico importado, o site refaz a soma do dia a cada operação que fecha. Como não enxerga a operação aberta, o número fica igual ou mais perto de zero.",
    },
    {
      nome: "Melhor e pior momento da operação",
      tecnico: "MFE e MAE",
      texto:
        "O máximo que o preço andou a favor e contra a operação enquanto ela esteve aberta, em pontos. Fica vazio nas operações que o coletor não acompanhou.",
    },
  ];

  const respostasDoSimulador: Linha[] = [
    {
      nome: "Cabe",
      texto: `O capital cobre o capital mínimo e a maior queda simulada não passa de ${formatarPct(LIMITE_APERTADO, 0)} do capital inicial.`,
    },
    {
      nome: "Apertado",
      texto: `Cabe, mas a maior queda simulada passa de ${formatarPct(LIMITE_APERTADO, 0)} do capital inicial.`,
    },
    {
      nome: "Não cabe",
      texto: "O capital é menor que o capital mínimo, ou a maior queda simulada é igual ou maior que o capital: o patrimônio simulado teria zerado.",
    },
  ];

  const numerosDeRisco: Linha[] = [
    {
      nome: "Tempo abaixo do topo",
      tecnico: "tempo em drawdown",
      texto: "A parte dos pregões em que a curva estava abaixo do maior valor que já tinha alcançado. Quanto menor, menos tempo o robô passa recuperando perdas.",
      conta: "dias abaixo do topo ÷ dias de pregão.",
    },
    {
      nome: "Fator de recuperação",
      texto: "Quantas vezes o resultado do período cobre a maior queda. Acima de 1, o robô já ganhou mais do que perdeu no pior momento.",
      conta: "resultado do período ÷ maior queda.",
      exemplo: `${reais(RISCO.resultado)} ÷ ${reais(RISCO.queda)} = ${formatarMultiplo(recoveryFactor(RISCO.resultado, RISCO.queda))}`,
    },
    {
      nome: "Calmar",
      texto: "Quanto o robô renderia em um ano, no ritmo do período, comparado com a maior queda.",
      conta: "resultado do período × 252 ÷ dias de pregão do período, dividido pela maior queda. 252 é o número usual de pregões num ano.",
      exemplo: `${reais(retornoAnualizado(RISCO.resultado, RISCO.pregoes))} ÷ ${reais(RISCO.queda)} = ${formatarMultiplo(calmar(RISCO.resultado, RISCO.pregoes, RISCO.queda))}`,
    },
    {
      nome: "Índice de úlcera",
      texto: "Mede ao mesmo tempo a profundidade e a duração das quedas. Quanto menor, mais estável foi a curva.",
      conta: "raiz quadrada da média dos quadrados da queda de cada dia. Fica em % do capital de referência, quando ele existe.",
    },
  ];

  // os acertos do horário são os mesmos da seção das operações, só que contando as operações do horário
  const numerosDoHorario: Linha[] = [
    {
      nome: "Recuperação",
      texto: "Quantas vezes o resultado do horário cobre a maior queda dele. Acima de 1, o resultado já pagou a pior queda.",
      conta: "resultado do horário ÷ maior queda do horário, somando uma operação depois da outra.",
    },
    {
      nome: "Queda relativa",
      tecnico: "drawdown relativo",
      texto: "Compara a maior queda do horário com a queda típica dos horários: 1 é igual à típica, 2 é o dobro.",
      conta: "maior queda do horário ÷ mediana das maiores quedas dos horários com operações suficientes.",
    },
  ];

  const palavras: { termo: string; texto: string }[] = [
    ...(ativos.length > 0
      ? [
          {
            termo: ativos.map((a) => `${a.nome} (${a.codigo})`).join(", "),
            texto: "Contratos futuros negociados na B3, a bolsa brasileira. Entre parênteses, o código de cada um.",
          },
        ]
      : []),
    { termo: "Contrato", texto: "A unidade mínima de negociação. Os valores do site são sempre para 1 contrato." },
    { termo: "Pregão", texto: "O dia de negociação da bolsa. Fins de semana e feriados não têm pregão." },
    { termo: "Capital de referência", texto: "O valor de conta usado como base para 1 contrato do robô. As porcentagens do site são calculadas sobre ele." },
    { termo: "Flutuante", texto: "O resultado da operação ainda aberta, se fosse encerrada agora. Só vira resultado quando a operação fecha." },
    { termo: "Magic number", texto: "Termo do MetaTrader 5: o número que cada robô grava nas próprias ordens. É como o site sabe qual robô fez cada operação." },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Como funciona"
        descricao="De onde vêm os números, como cada um é calculado e como começar. Tudo pode ser refeito a partir das operações listadas na aba Operações de cada robô."
      />

      <CorpoPagina>
        <ComoComecar links={links} />

        <Grade>
          {/* O índice só em tela larga, preso à direita enquanto a página rola; no celular a página se lê de
              cima a baixo (18/09/2026). Vem antes do conteúdo no HTML, para o teclado chegar nele primeiro.
              A altura máxima é a da janela menos a fita do topo: em janela baixa a lista rola no próprio lugar. */}
          <nav
            aria-label="Seções"
            className="hidden xl:sticky xl:top-[calc(var(--altura-cabecalho)_+_1.5rem)] xl:col-span-3 xl:col-start-10 xl:row-start-1 xl:block xl:max-h-[calc(100dvh_-_var(--altura-cabecalho)_-_3rem)] xl:self-start xl:overflow-y-auto"
          >
            <p className="mb-1.5 pl-4 text-[0.8125rem] text-sutil">Nesta página</p>
            <NavSecoes secoes={SECOES} />
          </nav>

          <div className="@container min-w-0 space-y-10 xl:col-span-9 xl:col-start-1 xl:row-start-1">
            <Secao id="coleta" titulo="De onde vêm os números">
              <ComExemplo
                exemplo={
                  <Conta
                    titulo="O que o coletor envia"
                    linhas={[
                      { rotulo: "Cada negócio executado", valor: "na hora" },
                      { rotulo: "Saldo, operações em aberto e cotação", valor: "a cada 3 segundos" },
                      { rotulo: "Saldo do dia, para a curva do dia", valor: "a cada 5 segundos" },
                      { rotulo: "Os últimos dias, para conferência", valor: "ao iniciar" },
                    ]}
                  />
                }
              >
                <Texto>
                  <p>
                    Em cada MetaTrader 5 da Quants Robôs roda um coletor: um programa que <strong>não opera</strong>, só lê a conta e envia ao
                    site cada operação assim que ela fecha. Nenhum número é digitado à mão.
                  </p>
                  <p>
                    Se o coletor ficar mais de {MINUTOS_SEM_SINAL} minutos sem mandar sinal com o pregão aberto, o site escreve{" "}
                    <strong>sem atualização no momento</strong> em vez de mostrar dado velho como se fosse ao vivo.
                  </p>
                  <p>
                    Cada robô tem uma <strong>conta principal</strong>, que alimenta os números públicos. Quando ela é uma conta demo, isso vem
                    escrito junto dos dados do robô.
                  </p>
                  <p>
                    Um robô pode ter um <strong>horário mínimo</strong> e uma <strong>duração mínima</strong> de operação. O que abre antes desse
                    horário, ou abre e fecha em menos tempo que a duração mínima, continua guardado, mas fica fora do site e de todas as
                    contas. A duração mínima existe porque a conta pode registrar, num preço defasado, um ganho de milissegundos que nenhuma
                    corretora daria de verdade.
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="status" titulo="O que o site diz do robô agora">
              <Texto>
                <p>Junto do nome de cada robô, o site escreve em uma frase o que ele fez hoje.</p>
                <p>
                  O site sabe três coisas: se o pregão está aberto, se é horário do robô e se o coletor está mandando sinal.{" "}
                  <strong>Não sabe se o robô está ligado</strong> na conta, e por isso nunca escreve “ligado” nem “operando”.
                </p>
              </Texto>
              <Linhas comoNaTela itens={frases} />
            </Secao>

            <Secao id="normalizacao" titulo="Com 1 contrato, já descontados os custos">
              <ComExemplo
                exemplo={
                  <Conta
                    linhas={[
                      { rotulo: "Ganho de uma operação com 2 contratos", valor: centavos(60, true) },
                      { rotulo: "Dividido por 2: com 1 contrato", valor: centavos(30, true) },
                      { rotulo: "Custo de 1 contrato", valor: centavos(-0.5, true) },
                    ]}
                    resultado={{ rotulo: "O que entra no site", valor: centavos(29.5, true) }}
                  />
                }
              >
                <Texto>
                  <p>Esta frase acompanha os números do site. Ela diz duas coisas.</p>
                  <p>
                    <strong>Com 1 contrato.</strong> Todo valor é dividido pela quantidade de contratos da operação. Assim, robôs que operam
                    tamanhos diferentes podem ser comparados, e você multiplica pelo número de contratos que pretende usar.
                  </p>
                  <p id="custos">
                    <strong>Já descontados os custos.</strong> De cada operação sai um custo fixo por contrato (corretagem e taxas da bolsa),
                    definido por robô e mostrado na página dele. O valor antes dos custos continua disponível nos relatórios mensais e na aba
                    Desempenho.
                  </p>
                  <p>
                    Ganho e perda são decididos depois dos custos: uma operação que ganhou R$&nbsp;0,10 e pagou R$&nbsp;0,25 de custo conta
                    como perda.
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="operacao" titulo="O que conta como uma operação">
              <ComExemplo
                exemplo={
                  ativoDoExemplo ? (
                    <div className="space-y-6">
                      <Conta
                        linhas={[
                          { rotulo: "Compra que saiu acima da entrada", valor: "150 pontos" },
                          { rotulo: `1 ponto de ${ativoDoExemplo.nome}`, valor: centavos(ativoDoExemplo.valorPonto) },
                        ]}
                        resultado={{ rotulo: "Com 1 contrato, antes dos custos", valor: centavos(150 * ativoDoExemplo.valorPonto, true) }}
                      />
                      {/* com um ativo só, a conta de cima já disse quanto vale o ponto */}
                      {ativos.length > 1 ? (
                        <Conta
                          titulo="Quanto vale 1 ponto, com 1 contrato"
                          linhas={ativos.map((a) => ({ rotulo: `${a.nome} (${a.codigo})`, valor: centavos(a.valorPonto) }))}
                        />
                      ) : null}
                    </div>
                  ) : null
                }
              >
                <Texto>
                  <p>Uma operação vai da entrada do robô no mercado até a posição zerar.</p>
                  <p>
                    Quando ele entra ou sai em partes, vale o preço médio das entradas e o das saídas, cada parte pesando pelo número de
                    contratos. Se o robô vira a mão, de comprado para vendido (ou o contrário) sem zerar, uma operação fecha ali e outra
                    começa.
                  </p>
                  <p>
                    Os <strong>pontos</strong> são a diferença entre a saída e a entrada, a favor da posição: na compra, saída menos entrada;
                    na venda, entrada menos saída. O resultado em reais é o que o MetaTrader informa, para bater no centavo com o relatório
                    da corretora. O código do contrato muda a cada vencimento, e o site junta tudo pelo ativo.
                  </p>
                </Texto>

                {/* 21/09/2026: o contador de operações em aberto. Conta entradas, nunca contratos (spec §6) */}
                <div className="space-y-2">
                  <Subtitulo id="operacoes-em-aberto">Operações em aberto</Subtitulo>
                  <Texto>
                    <p>
                      Cada entrada que o robô fez e ainda não fechou conta 1. É número de entradas, nunca de contratos: o site não mostra
                      quantos contratos há em cada entrada nem o tamanho da conta.
                    </p>
                    <p>
                      A contagem respeita o atraso configurado para cada robô e some fora do pregão ou quando o coletor fica sem sinal.
                    </p>
                  </Texto>
                </div>
              </ComExemplo>
            </Secao>

            <Secao id="resultado" titulo="Resultado e períodos">
              <ComExemplo
                exemplo={
                  <div id="periodos">
                    <AoLado titulo="Os períodos terminam hoje">
                      <dl>
                        {PERIODOS.map(([nome, texto]) => (
                          <div key={nome} className="flex items-baseline justify-between gap-4 leading-7">
                            <dt>{nome}</dt>
                            <dd className="text-right text-muted-foreground">{texto}</dd>
                          </div>
                        ))}
                      </dl>
                    </AoLado>
                  </div>
                }
              >
                <Texto>
                  <p>
                    O resultado de um período é a soma dos ganhos menos as perdas das operações fechadas nele, com 1 contrato e já descontados
                    os custos.
                  </p>
                  <p>
                    Cada operação conta no dia de pregão em que fechou, pelo horário de Brasília. Sábados, domingos e feriados da bolsa não são
                    dias de pregão.
                  </p>
                  <p>
                    A <strong>média por mês</strong> é o resultado do período dividido pelo número de meses em que o robô teve pregão.
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="drawdown" titulo="Maior queda" apoio="o nome técnico é drawdown">
              <ComExemplo exemplo={<ExemploDaQueda />}>
                <Texto>
                  <p>
                    É a distância entre o ponto mais alto que a soma do resultado alcançou e o ponto mais baixo que veio depois. Mostra o
                    tamanho do pior momento: quanto o robô chegou a devolver antes de voltar a subir. Nas curvas do site ela aparece em
                    vermelho, na própria linha.
                  </p>
                  <p>
                    A conta: em cada dia, mede-se quanto a soma está abaixo do maior valor que já teve. A maior queda é a maior dessas
                    distâncias no período. Aparece em reais, com 1 contrato, e em porcentagem do capital de referência, quando o robô tem um.
                  </p>
                  <p>
                    O <strong>tempo de recuperação</strong> são os dias corridos entre o último dia no ponto mais alto e o primeiro dia em que a
                    curva voltou a ele. Enquanto não volta, aparece “ainda não recuperou”.
                  </p>
                  <p>
                    Uma curva desenhada operação por operação passa pelo saldo no meio de cada pregão, e por isso pode mostrar uma queda maior
                    que a curva por dia, que só olha o fechamento de cada dia.
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="taxa-acerto" titulo="Acertos e os números das operações">
              <Texto>
                <p>Estes números saem das operações fechadas no período, sempre depois dos custos.</p>
                <p>
                  O exemplo: {formatarNumero(OPS_TOTAL)} operações, {formatarNumero(OPS.comGanho)} com ganho de {reais(OPS.ganho)} cada (
                  {reais(OPS_GANHOS)} ao todo) e {formatarNumero(OPS.comPerda)} com perda de {reais(OPS.perda)} cada ({reais(OPS_PERDAS)} ao todo).
                  O resultado é {reais(OPS_GANHOS - OPS_PERDAS, true)}.
                </p>
              </Texto>
              <Linhas itens={numerosDasOperacoes} />
            </Secao>

            <Secao id="mep-men" titulo="Melhor e pior momento do dia" apoio="os nomes técnicos são MEP e MEN">
              <ComExemplo
                exemplo={
                  <div>
                    <Conta
                      titulo="Exemplo: um dia com duas operações"
                      linhas={[
                        { rotulo: "A 1ª operação fecha com", valor: reais(80, true) },
                        { rotulo: "A 2ª chega a estar perdendo", valor: reais(-200, true) },
                        { rotulo: "Pior momento, medido", valor: <span className="text-negativo">{reais(80 - 200, true)}</span> },
                        { rotulo: "A 2ª fecha com", valor: reais(-50, true) },
                      ]}
                      resultado={{ rotulo: "O dia termina em", valor: reais(80 - 50, true) }}
                    />
                    <p className="mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
                      Por fechamento, esse dia não teria pior momento: a soma dos fechamentos ({reais(80, true)}, depois {reais(80 - 50, true)})
                      nunca ficou negativa.
                    </p>
                  </div>
                }
              >
                <Texto>
                  <p>
                    São o ponto mais alto e o mais baixo que o resultado do dia alcançou com o pregão em andamento. O pior momento mostra
                    quanto o dia chegou a ficar no prejuízo, mesmo quando terminou bem.
                  </p>
                  <p>Há dois jeitos de medir, e a tela diz qual valeu em cada dia.</p>
                </Texto>
                <Linhas itens={fontesDoDia} />

                {/* 23/09/2026: a curva real do dia (coletor 1.1.2, migration 0024). A conta é a de lib/stats/saldo-dia
                    (liquidarSerie); como no melhor e no pior momento, a tela diz qual foi a fonte do dia mostrado */}
                <div className="space-y-2">
                  <Subtitulo id="curva-do-dia">A curva do dia</Subtitulo>
                  <Texto>
                    <p>
                      Mostra o resultado ao longo do pregão, com as mesmas duas fontes: nos dias medidos, o saldo com a operação aberta,
                      guardado a cada 5 segundos; nos outros, uma linha que liga um fechamento ao seguinte.
                    </p>
                    <p>Se o coletor começou com o dia em andamento, a curva começa na hora em que a medição começou.</p>
                  </Texto>
                </div>
              </ComExemplo>
            </Secao>

            <Secao id="capital-minimo" titulo="Capital mínimo">
              <ComExemplo
                exemplo={
                  <Conta
                    linhas={[
                      { rotulo: "Margem de 1 contrato", valor: reais(MINIMO.margem) },
                      { rotulo: "Maior queda do histórico", valor: reais(MINIMO.queda) },
                      { rotulo: `Maior queda × ${formatarMultiplo(fatorSeguranca, 1)}`, valor: reais(MINIMO.queda * fatorSeguranca) },
                    ]}
                    resultado={{
                      rotulo: "Capital mínimo",
                      valor: reais(Math.round(capitalMinimoRecomendado(MINIMO.margem, MINIMO.queda, fatorSeguranca))),
                    }}
                  />
                }
              >
                <Texto>
                  <p>
                    É quanto ter na conta para operar 1 contrato com alguma folga: a margem que a corretora exige mais a maior queda que o
                    robô já teve, aumentada por um fator de segurança.
                  </p>
                  <p>
                    A conta: <strong>margem + maior queda × {formatarMultiplo(fatorSeguranca, 1)}</strong>. A margem é a que a corretora exige
                    para manter 1 contrato em day trade, e é configurada por ativo. A maior queda é a de todo o histórico do robô, seja qual
                    for o período escolhido na tela.
                  </p>
                  <p>É uma referência de conforto, não uma garantia: quedas futuras podem ser maiores que as do histórico.</p>
                </Texto>
              </ComExemplo>
            </Secao>

            {/* 23/09/2026: a página /simulador (spec §8.6). A conta é a de lib/stats/simulador: soma ponderada das séries
                diárias públicas, maior queda em % sobre o capital inicial informado e capital mínimo pela regra logo acima */}
            <Secao id="simulador" titulo="Simular meu capital">
              <ComExemplo
                exemplo={
                  <Conta
                    titulo="Exemplo: um dia da simulação"
                    linhas={[
                      { rotulo: "Capital informado", valor: reais(10000) },
                      { rotulo: `Um robô com 2 contratos, num dia de ${reais(50, true)}`, valor: reais(100, true) },
                      { rotulo: `Outro com 1 contrato, num dia de ${reais(-30, true)}`, valor: reais(-30, true) },
                    ]}
                    resultado={{ rotulo: "Patrimônio simulado no fim do dia", valor: reais(10070) }}
                  />
                }
              >
                <Texto>
                  <p>
                    O simulador aplica o histórico dos robôs ao capital e aos contratos que você informar. É aritmética sobre o que já
                    aconteceu: não é recomendação nem projeção de resultado.
                  </p>
                  <p>
                    Para cada dia de pregão, soma o resultado de cada robô escolhido vezes os contratos informados; dia em que o robô não
                    operou conta zero. O patrimônio simulado é o capital informado mais essa soma, dia a dia.
                  </p>
                  <p>
                    A maior queda é medida nessa curva. Em porcentagem, é sempre sobre o <strong>capital inicial informado</strong>, não sobre
                    o patrimônio do momento.
                  </p>
                  <p>
                    O capital mínimo da carteira é a soma, robô a robô, de contratos × capital mínimo de 1 contrato. Robô sem margem
                    configurada fica sem capital mínimo, e a soma dos outros vale como piso.
                  </p>
                </Texto>
              </ComExemplo>

              <div className="space-y-3">
                <Subtitulo>A resposta do simulador</Subtitulo>
                <Linhas itens={respostasDoSimulador} />
              </div>

              <Texto>
                <p>
                  O simulador só multiplica o resultado de 1 contrato. Numa conta real, os custos e a diferença de preço na execução podem
                  ser outros, e cada contrato a mais precisa de margem na corretora e de ser preenchido no mercado.
                </p>
              </Texto>
            </Secao>

            <Secao id="indices-risco" titulo="Mais números de risco">
              <Texto>
                <p>Ficam na aba Quedas e risco de cada robô, para quem quer ir além da maior queda.</p>
                <p>
                  O exemplo: resultado de {reais(RISCO.resultado)} em {formatarNumero(RISCO.pregoes)} pregões, meio ano, com maior queda de{" "}
                  {reais(RISCO.queda)}.
                </p>
              </Texto>
              <Linhas itens={numerosDeRisco} />

              <div className="space-y-3">
                <Subtitulo id="risco-de-ruina">Risco de ruína</Subtitulo>
                <ComExemplo
                  exemplo={
                    <div>
                      <Conta
                        titulo={`Exemplo: ${formatarPct(OPS_ACERTOS, 0)} de acertos, ganho médio de ${reais(OPS.ganho)}, perda média de ${reais(OPS.perda)} e capital de ${reais(RUINA.capital)}`}
                        linhas={[
                          {
                            rotulo: "Ganho esperado",
                            valor: `${formatarMultiplo(OPS_ACERTOS)} × ${formatarMultiplo(OPS_RELACAO)} − ${formatarMultiplo(1 - OPS_ACERTOS)} = ${formatarMultiplo(RUINA_GANHO_ESPERADO)}`,
                          },
                          {
                            rotulo: "Perdas que o capital aguenta",
                            valor: `${reais(RUINA.capital)} ÷ ${reais(OPS.perda)} = ${formatarNumero(RUINA.capital / OPS.perda)}`,
                          },
                        ]}
                        resultado={{
                          rotulo: `Risco: (1 − ${formatarMultiplo(RUINA_GANHO_ESPERADO)}) ÷ (1 + ${formatarMultiplo(RUINA_GANHO_ESPERADO)}), elevado a ${formatarNumero(RUINA.capital / OPS.perda)}`,
                          valor: formatarPct(ruinaCom(RUINA.capital), 1),
                        }}
                      />
                      <p className="mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
                        Com {reais(RUINA.capitalFolgado)} de capital são {formatarNumero(RUINA.capitalFolgado / OPS.perda)} perdas médias, e o
                        risco aparece como {formatarPct(ruinaCom(RUINA.capitalFolgado), 1)}.
                      </p>
                    </div>
                  }
                >
                  <Texto>
                    <p>
                      É uma estimativa da chance de perder todo o capital de referência, supondo que toda perda tem o tamanho da perda média
                      e que uma operação não tem relação com a anterior.
                    </p>
                    <p>
                      A conta: o ganho esperado por operação, medido em perdas médias, é acertos × (ganho médio ÷ perda média) − (1 −
                      acertos). O capital de referência ÷ perda média diz quantas perdas médias ele aguenta. Quanto maior o ganho esperado e
                      quanto mais perdas o capital aguenta, menor o risco; com ganho esperado zero ou negativo, é 100%.
                    </p>
                    {/* 19/09/2026 ("o risco de ruína está zero, por quê?"): primeiro a frase para quem não quer a conta */}
                    <p>
                      <strong>Por que aparece 0,0%.</strong> Quando o capital cobre centenas de perdas médias, a conta dá um número tão pequeno
                      que arredonda para zero. É um limite do modelo, não uma garantia: perdas reais costumam vir juntas, em dias ruins. O
                      tamanho do pior momento está na maior queda.
                    </p>
                  </Texto>
                </ComExemplo>
              </div>
            </Secao>

            <Secao id="faixas" titulo="Melhores horários">
              <Texto>
                <p>
                  Cada combinação de dia da semana e hora de entrada, como segunda às 10h, junta as operações que começaram ali. O site mede
                  cada horário e diz em quais o histórico foi melhor.
                </p>
                <p>
                  Os horários vão de segunda a sexta, das {HORAS[0]}h às {HORAS[HORAS.length - 1]}h. Três números decidem a classificação de
                  cada um: os acertos, a recuperação e a queda relativa.
                </p>
              </Texto>
              <Linhas itens={numerosDoHorario} />

              {/* 25/11/2026: os limites são os que o banco tem em uso (parametros.faixas, os mesmos da aba Melhores
                  horários), não mais os padrões do código; a ordem das linhas é a de classificarFaixa (lib/stats/faixas) */}
              <div className="space-y-3">
                <Subtitulo>A classificação</Subtitulo>
                <div className="tbl-moldura">
                  <table className="tbl min-w-[44rem]">
                    <thead>
                      <tr>
                        <th>Classificação</th>
                        <th>Acertos</th>
                        <th>Recuperação</th>
                        <th>Queda relativa</th>
                        <th className="num">Tamanho sugerido da posição</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="font-medium">Sem classificação</td>
                        <td colSpan={3} className="text-muted-foreground">
                          menos de {formatarNumero(regras.amostraMinima)} operações: com tão poucas, o resultado pode ser sorte ou azar
                        </td>
                        <td className="num text-sutil">–</td>
                      </tr>
                      <tr>
                        <td className="font-medium">{ROTULO_CLASSE.evitar}</td>
                        <td>abaixo de {formatarPct(regras.evitar.acertoMax, 0)}</td>
                        <td>ou abaixo de {formatarMultiplo(regras.evitar.recuperacaoMax)}</td>
                        <td>ou acima de {vezes(regras.evitar.ddRelativoMin)}</td>
                        <td className="num">{formatarPct(LOTE_POR_CLASSE.evitar, 0)}</td>
                      </tr>
                      <tr>
                        <td className="font-medium">{ROTULO_CLASSE.ligar}</td>
                        <td>{formatarPct(regras.ligar.acertoMin, 0)} ou mais</td>
                        <td>e {formatarMultiplo(regras.ligar.recuperacaoMin)} ou mais</td>
                        <td>e até {vezes(regras.ligar.ddRelativoMax)}</td>
                        <td className="num">{formatarPct(LOTE_POR_CLASSE.ligar, 0)}</td>
                      </tr>
                      <tr>
                        <td className="font-medium">{ROTULO_CLASSE.cautela}</td>
                        <td>{formatarPct(regras.cautela.acertoMin, 0)} ou mais</td>
                        <td>e {formatarMultiplo(regras.cautela.recuperacaoMin)} ou mais</td>
                        <td className="text-sutil">–</td>
                        <td className="num">{formatarPct(LOTE_POR_CLASSE.cautela, 0)}</td>
                      </tr>
                      <tr>
                        <td className="font-medium">{ROTULO_CLASSE.neutro}</td>
                        <td colSpan={3} className="text-muted-foreground">
                          o que não entrou em nenhuma das anteriores
                        </td>
                        <td className="num">{formatarPct(LOTE_POR_CLASSE.neutro, 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[0.8125rem] text-pretty text-muted-foreground">
                  As regras são conferidas de cima para baixo, e vale a primeira que servir. A última coluna é quanto do tamanho normal da
                  posição usar em cada classificação.
                </p>
              </div>

              <ComExemplo
                exemplo={
                  <Conta
                    titulo="Exemplo: a nota de um horário"
                    linhas={[
                      { rotulo: `Posição ${formatarMultiplo(NOTA.posicao, 1)} entre os horários, × 50`, valor: formatarNumero(NOTA_PARTES[0]) },
                      {
                        rotulo: `${formatarNumero(NOTA.mesesComGanho)} de ${formatarNumero(NOTA.meses)} meses com ganho, × 30`,
                        valor: formatarNumero(NOTA_PARTES[1]),
                      },
                      { rotulo: `${formatarNumero(NOTA.operacoes)} operações ÷ 100, × 20`, valor: formatarNumero(NOTA_PARTES[2]) },
                    ]}
                    resultado={{ rotulo: "Nota", valor: formatarNumero(Math.round(NOTA_PARTES.reduce((s, v) => s + v, 0))) }}
                  />
                }
              >
                <Texto>
                  <p>
                    A <strong>nota</strong>, de 0 a 100, só serve para ordenar os horários. Até 50 pontos vêm de quanto o horário ganha por
                    operação em comparação com os outros: o pior recebe 0, o melhor 50. Até 30 vêm da regularidade: meses com ganho ÷ meses
                    com operação. Até 20 vêm da quantidade: operações ÷ 100, no máximo 1. Horário que perde em média fica com no máximo 40.
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="glossario" titulo="Palavras do mercado" corpo="">
              <dl className="grid gap-x-12 @3xl:grid-cols-2">
                {palavras.map((p) => (
                  <div key={p.termo} className="border-b border-(--painel-fio) py-3 text-sm">
                    <dt className="font-medium">{p.termo}</dt>
                    <dd className="mt-0.5 leading-relaxed text-pretty text-muted-foreground">{p.texto}</dd>
                  </div>
                ))}
              </dl>
            </Secao>

            <Secao id="perguntas" titulo="Perguntas frequentes" corpo="">
              <Faq />
            </Secao>
          </div>
        </Grade>
      </CorpoPagina>
    </>
  );
}
