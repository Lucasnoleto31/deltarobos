import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/compartilhados/Faq";
import { GLOSSARIO } from "@/components/compartilhados/glossario";
import { ComoComecar } from "@/components/home/ComoComecar";
import { TextoDeHoje } from "@/components/home/TextoDeHoje";
import { NavSecoes } from "@/components/layout/NavSecoes";
import { CabecalhoPagina, CorpoPagina, Grade } from "@/components/sistema/Pagina";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { capitaisDaCasa, type CapitalDoRobo } from "@/lib/consultas/capital";
import { carregarCasa } from "@/lib/consultas/casa";
import { formatarBRL, formatarData, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import { custosDaSoma, custosDoRobo, premissaDoRobo, temCusto } from "@/lib/premissa";
import { HORAS, LOTE_POR_CLASSE, ROTULO_CLASSE } from "@/lib/stats/faixas";
import {
  acertoParaEmpatar,
  diaRuimTipico,
  LIMITE_ANDAM_JUNTOS,
  MINIMO_DE_DIAS_EM_COMUM,
  MINIMO_PARA_DIA_RUIM,
  picoDeEntradasAbertas,
  resumirMeses,
  tempoEmPalavras,
  type MesDoRobo,
} from "@/lib/stats/indicadores-robo";
import { LIMITE_SEM_HEARTBEAT_SEG } from "@/lib/stats/pregao";
import { contaDoCapital } from "@/lib/stats/risco";
import { acumular, ganhoPorQueda, maiorQueda } from "@/lib/stats/serie-casa";
import { LIMITE_APERTADO } from "@/lib/stats/simulador";
import type { EstatisticaPublica, RoboPublico } from "@/lib/tipos";
import { AoLado, ComExemplo, Conta, CurvaDeExemplo, EntradasDeExemplo, Linhas, Nota, Secao, Subtitulo, Texto, type Linha } from "./pecas";

// 25/11/2026: a página lê o banco (o link de abertura de conta do "Como começar", o valor do ponto e a
// garantia de cada ativo, o custo e o capital mínimo de um robô, o fator de segurança e as regras dos
// horários em uso), então revalida como as outras telas
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Como funciona",
  description: "De onde vêm os números da Quants Robôs, o que cada um quer dizer e como começar a usar um robô.",
};

// O índice ao lado do conteúdo. Os ids são os endereços que as outras telas usam (/metodologia#como-comecar,
// #coleta, #custos, #normalizacao, #drawdown, #simulador, #faixas): quem trocar um id aqui troca o link de lá.
// A ordem do meio (de "resultado" a "meses-e-dias") é a ordem em que o trader decide (DESIGN.md, seção 9).
const SECOES = [
  { id: "como-comecar", rotulo: "Como começar" },
  { id: "coleta", rotulo: "De onde vêm os números" },
  { id: "status", rotulo: "O que o site diz do robô agora" },
  { id: "normalizacao", rotulo: "1 contrato por entrada e os custos" },
  { id: "operacao", rotulo: "O que é uma operação" },
  { id: "resultado", rotulo: "Resultado" },
  { id: "drawdown", rotulo: GLOSSARIO.drawdown.nome },
  { id: "ganho-por-queda", rotulo: GLOSSARIO.ganhoPorQueda.nome },
  { id: "capital-minimo", rotulo: GLOSSARIO.capitalMinimo.nome },
  { id: "entradas-abertas", rotulo: GLOSSARIO.entradasAbertas.nome },
  { id: "taxa-acerto", rotulo: "Acertos e o necessário para empatar" },
  { id: "meses-e-dias", rotulo: "Meses com ganho e um dia ruim típico" },
  { id: "sua-conta", rotulo: "O que pode ser diferente na sua conta" },
  { id: "simulador", rotulo: "Simular meu capital" },
  { id: "mep-men", rotulo: "Melhor e pior momento do dia" },
  { id: "faixas", rotulo: "Melhores horários" },
  { id: "glossario", rotulo: "Palavras do mercado" },
  { id: "perguntas", rotulo: "Perguntas frequentes" },
];

// o mesmo limite que decide a frase "sem atualização no momento" (lib/stats/pregao), para o texto não descolar dele
const MINUTOS_SEM_SINAL = formatarNumero(LIMITE_SEM_HEARTBEAT_SEG / 60);

const reais = (v: number, sinal = false) => formatarBRL(v, { sinal, inteiro: true });
const centavos = (v: number, sinal = false) => formatarBRL(v, { sinal });
const vezes = (v: number) => `${formatarNumero(v, Number.isInteger(v) ? 0 : 1)}×`;
/** "a, b e c" */
const emLista = (itens: readonly string[]) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`);
/** "antes dos custos" -> "Antes dos custos": a premissa de src/lib/premissa no começo de uma frase */
const comMaiuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1);

// ── Os exemplos de papel ───────────────────────────────────────────────────────────────────────────
// Números redondos, inventados só para a conta caber na cabeça, e sempre com a legenda "Exemplo". Nenhum
// deles é resultado de robô: o que é de robô (o capital mínimo, as entradas abertas, o custo, o valor do
// ponto, a garantia) é lido do banco dentro da página. Onde a conta de verdade mora em lib/stats, o exemplo
// é feito com a MESMA função (acumular, maiorQueda, ganhoPorQueda, acertoParaEmpatar, resumirMeses,
// diaRuimTipico, picoDeEntradasAbertas): se a regra mudar lá, o exemplo muda junto.

// a maior queda: seis pregões, com o ponto mais alto no segundo e o mais baixo no quarto
const CURVA_DA_QUEDA = acumular([300, 200, -150, -250, 180, 320].map((valor, i) => ({ dia: `dia ${i + 1}`, valor })));
const QUEDA = maiorQueda(CURVA_DA_QUEDA);
const RESULTADO_DA_CURVA = CURVA_DA_QUEDA[CURVA_DA_QUEDA.length - 1].acumulado;
// o ganho para cada R$ 1 da maior queda, pela mesma função que põe os robôs em ordem na Visão geral
const GANHO_POR_QUEDA = QUEDA ? ganhoPorQueda(RESULTADO_DA_CURVA, QUEDA.valor).valor : null;

// a operação do exemplo de "com 1 contrato": uma compra de dois contratos que saiu 150 pontos acima da entrada
const COMPRA = { pontos: 150, contratos: 2 };

// as operações: 8 com ganho de R$ 30 e 2 com perda de R$ 100
const OPS = { comGanho: 8, ganho: 30, comPerda: 2, perda: 100 };
const OPS_TOTAL = OPS.comGanho + OPS.comPerda;
const OPS_GANHOS = OPS.comGanho * OPS.ganho;
const OPS_PERDAS = OPS.comPerda * OPS.perda;
const OPS_RESULTADO = OPS_GANHOS - OPS_PERDAS;
const OPS_ACERTOS = OPS.comGanho / OPS_TOTAL;
const OPS_PARA_EMPATAR = acertoParaEmpatar(OPS.ganho, OPS.perda);

// os meses: quatro, um deles com perda
const MESES_DO_EXEMPLO: MesDoRobo[] = [900, -300, 500, 200].map((valor, i) => ({ mes: `${i + 1}º mês`, valor, nDias: 20 }));
const MESES = resumirMeses(MESES_DO_EXEMPLO);

// um dia ruim típico: 40 pregões em que os dois piores dias foram de −R$ 900 e −R$ 400
const PIORES_DIAS = [-900, -400];
const PREGOES_DO_DIA_RUIM = 40;
const DIA_RUIM = diaRuimTipico([...PIORES_DIAS, ...Array.from({ length: PREGOES_DO_DIA_RUIM - PIORES_DIAS.length }, () => 100)]);

// as entradas abertas ao mesmo tempo: quatro entradas num pregão, em minutos desde a primeira
const ENTRADAS_DO_EXEMPLO: ReadonlyArray<readonly [number, number]> = [
  [0, 50],
  [15, 70],
  [30, 45],
  [80, 100],
];
const PICO_DO_EXEMPLO = picoDeEntradasAbertas(ENTRADAS_DO_EXEMPLO);

// a nota de um horário
const NOTA = { posicao: 0.8, mesesComGanho: 8, meses: 10, operacoes: 50 };
const NOTA_PARTES = [50 * NOTA.posicao, 30 * (NOTA.mesesComGanho / NOTA.meses), 20 * Math.min(1, NOTA.operacoes / 100)];

// os atalhos de período que as telas oferecem desde a revisão de 25/11/2026: a Visão geral (12 meses, desde o
// início, 30 pregões), o Resumo do robô (desde o início, ano, mês, semana) e Simular meu capital (3 meses, 12
// meses, ano, desde o início). "Hoje" deixou de ser período: é a aba Ao vivo
const PERIODOS: ReadonlyArray<readonly [nome: string, texto: string]> = [
  ["Desde o início", "o histórico inteiro"],
  ["12 meses, 3 meses", "pelo calendário"],
  ["Ano", "de 1º de janeiro até hoje"],
  ["Mês", "do dia 1º até hoje"],
  ["Semana", "de segunda-feira até hoje"],
  ["30 pregões", "os últimos 30 com operação"],
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

interface RoboDoExemplo {
  robo: RoboPublico;
  capital: CapitalDoRobo & { capitalMinimo: number; margem: number };
}

/**
 * O robô que serve de exemplo na conta do capital mínimo: entre os que têm capital mínimo publicado e
 * histórico (alguma queda), o que já teve mais entradas abertas ao mesmo tempo, porque é nele que a regra
 * aparece inteira. No empate, vale a ordem do site. Nada de nome no código: quem decide são os números do
 * banco, e a página diz qual foi.
 */
function roboDoExemplo(robos: readonly RoboPublico[], capitais: Readonly<Record<string, CapitalDoRobo>>): RoboDoExemplo | null {
  let escolhido: RoboDoExemplo | null = null;
  for (const robo of robos) {
    const c = capitais[robo.slug];
    if (!c || c.capitalMinimo === null || c.margem === null || !(c.maiorQueda > 0)) continue;
    if (escolhido === null || c.entradas > escolhido.capital.entradas) {
      escolhido = { robo, capital: { ...c, capitalMinimo: c.capitalMinimo, margem: c.margem } };
    }
  }
  return escolhido;
}

/** O primeiro pregão com operação de um robô: é de onde se conta o tamanho do histórico dele. */
function primeiroPregao(estatisticas: readonly EstatisticaPublica[], slug: string, hoje: string): string | null {
  let dia: string | null = null;
  for (const e of estatisticas) {
    if (e.slug === slug && e.dia <= hoje && e.n_operacoes > 0 && (dia === null || e.dia < dia)) dia = e.dia;
  }
  return dia;
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
        <span>{GLOSSARIO.drawdown.nome}</span>
        <span className="font-medium whitespace-nowrap text-negativo">{reais(-QUEDA.valor, true)}</span>
      </p>
      <Nota className="mt-1">
        De {reais(alto)}
        {topo ? `, no ${topo.dia},` : ""} a {reais(fundo.acumulado)}, no {fundo.dia}.
        {volta ? ` No ${volta.dia} a soma volta ao ponto mais alto: a queda foi recuperada.` : ""}
      </Nota>
    </AoLado>
  );
}

/**
 * "Como funciona" (spec §8.7): de onde vêm os números e como começar.
 *
 * Ficha Mesa, 25/11/2026 (Lucas: "para um leigo está muito difícil de entender"; "coisas que não são
 * necessárias pode tirar"): um manual, não um documento técnico. "Como começar" abre a página, o índice fica
 * preso à direita em tela larga, e cada seção diz primeiro o que a coisa é, depois a conta em palavras e, ao
 * lado, um exemplo com números.
 *
 * Revisão dos indicadores, 25/11/2026 (DESIGN.md, seção 9; Lucas: "informações que não são importantes vamos
 * tirar, coloque indicadores que fazem sentido para o trader quando o assunto é robô"):
 * - saiu a explicação do que saiu do site: Calmar, índice de úlcera, risco de ruína, variação de um dia para
 *   o outro, tempo médio para recuperar, média por mês, retorno e queda em % do capital de referência, ganho
 *   médio contra perda média como razão, sequências de operações, e as opções "antes dos custos" e contratos;
 * - os indicadores vêm na ordem em que o trader decide: resultado, maior queda, ganho para cada R$ 1 da maior
 *   queda, capital mínimo, entradas abertas ao mesmo tempo, acertos e o necessário para empatar, resultado
 *   médio por operação e o custo, meses com ganho e pior mês, um dia ruim típico;
 * - o capital mínimo segue a regra nova (garantia por contrato × o máximo de entradas abertas ao mesmo tempo
 *   + maior queda × fator), com a conta de um robô de verdade, lida do banco por capitaisDaCasa(): é o mesmo
 *   número da Visão geral, do Resumo, de Quedas e risco e do simulador;
 * - entrou "O que pode ser diferente na sua conta": preço em que a ordem sai, custos da corretora, imposto de
 *   renda e licença não estão no número. Sem preço de licença nem alíquota: o site não sabe;
 * - as telas têm os nomes de hoje (Visão geral, Simular meu capital, Como funciona; no robô: Resumo, Ao vivo,
 *   Dia a dia, Quedas e risco, Melhores horários, Operações).
 *
 * Os custos (revisão de 25/11/2026): a página não promete "já descontados os custos" para todos os robôs. A
 * premissa de cada um vem de src/lib/premissa, a mesma das telas, e quem não tem custo no histórico é dito
 * pelo nome, lido do banco. As respostas do simulador são as quatro de semaforoDe, com a de "Não dá para
 * avaliar se cabe" para o robô escolhido sem capital mínimo.
 *
 * Os nomes dos indicadores saem do GLOSSARIO (o mesmo nome que a tela põe no rótulo). Nada de robô, ativo,
 * link ou parâmetro fixo no código: tudo o que é do site vem do banco (carregarCasa, o mesmo que a casca já
 * carrega neste render, e capitaisDaCasa).
 */
export default async function PaginaMetodologia() {
  const [casa, capitais] = await Promise.all([carregarCasa(), capitaisDaCasa()]);
  const { links, fatorSeguranca, faixas: regras } = casa.parametros;
  const visiveis = casa.robos.filter((r) => r.status !== "arquivado");
  const ativos = ativosDosRobos(visiveis);
  const ativoDoExemplo = ativos[0] ?? null;
  const fator = formatarMultiplo(fatorSeguranca, 1);

  // o custo que entra no exemplo da premissa é o de um robô do site, no ativo do exemplo
  const roboDoCusto = ativoDoExemplo ? (visiveis.find((r) => r.ativo === ativoDoExemplo.codigo && temCusto(r.custo_por_contrato)) ?? null) : null;
  const ganhoDaCompra = ativoDoExemplo ? COMPRA.pontos * ativoDoExemplo.valorPonto * COMPRA.contratos : 0;

  // A premissa dos custos de cada robô com histórico, pela regra das telas (src/lib/premissa): quem tem custo
  // cadastrado e quem está antes dos custos. O robô em breve, ainda sem operação, não entra em nenhum dos dois.
  const comOperacao = new Set(casa.estatisticas.filter((e) => e.n_operacoes > 0).map((e) => e.slug));
  const comHistorico = visiveis.filter((r) => comOperacao.has(r.slug));
  const comCusto = comHistorico.filter((r) => temCusto(r.custo_por_contrato));
  const semCusto = comHistorico.filter((r) => !temCusto(r.custo_por_contrato));
  const nomesSemCusto = emLista(semCusto.map((r) => r.nome));
  const temOuTem = semCusto.length === 1 ? "tem" : "têm";
  // a frase que vai junto do número, como a tela a escreve: a de um robô com custo, se houver
  const premissaDeExemplo = premissaDoRobo((comCusto[0] ?? comHistorico[0])?.custo_por_contrato);
  // a soma dos robôs (a da Visão geral), quando parte deles não tem custo no histórico
  const custosDaSomaDosRobos = custosDaSoma(comHistorico.map((r) => ({ nome: r.nome, custoPorContrato: r.custo_por_contrato })));

  // a garantia (a margem) que cada ativo tem cadastrada hoje
  const garantias = ativos.flatMap((a) => {
    const margem = casa.mercado.find((m) => m.prefixo_simbolo === a.codigo)?.margem_referencia ?? null;
    return margem === null ? [] : [{ nome: a.nome, margem }];
  });

  // a conta do capital mínimo de um robô de verdade. As parcelas são as de contaDoCapital (lib/stats/risco), a
  // mesma função que escreve a conta por extenso em Quedas e risco: garantia + folga fecham no total publicado
  const exemplo = roboDoExemplo(visiveis, capitais);
  const contaDoExemplo = exemplo ? contaDoCapital(exemplo.capital, LIMITE_APERTADO) : null;
  const inicioDoExemplo = exemplo ? primeiroPregao(casa.estatisticas, exemplo.robo.slug, casa.hoje) : null;
  const historicoDoExemplo = inicioDoExemplo ? tempoEmPalavras(inicioDoExemplo, casa.hoje) : null;

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
      texto: "O resultado das operações que já fecharam hoje, com 1 contrato por entrada. Continua na tela depois que o pregão fecha.",
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
    // 19/09/2026: o arquivado sai da lista e do menu, mas robos_publico ainda o devolve e /robos/[slug]
    // continua abrindo
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

  // Acertos nunca aparecem sem o necessário para empatar (DESIGN.md, seção 9): os dois vêm juntos, e depois
  // deles o tamanho de um ganho e de uma perda, o fator de lucro e o resultado médio por operação, que é a
  // folga do robô contra o custo e contra o preço em que a ordem sai
  const numerosDasOperacoes: Linha[] = [
    {
      nome: GLOSSARIO.taxaAcerto.nome,
      tecnico: "taxa de acerto",
      texto: "De cada 100 operações, quantas terminaram com ganho. Uma operação que ganha menos do que o custo dela conta como perda.",
      conta: "operações com ganho ÷ total de operações.",
      exemplo: `${formatarNumero(OPS.comGanho)} ÷ ${formatarNumero(OPS_TOTAL)} = ${formatarNumero(OPS_ACERTOS * 100)} de cada 100`,
    },
    {
      id: "acertos-para-empatar",
      nome: GLOSSARIO.acertoParaEmpatar.nome,
      texto:
        "De cada 100 operações, quantas precisam terminar com ganho só para o robô não perder. Quando o ganho típico é pequeno e a perda típica é grande, é preciso acertar quase sempre. Acertos acima deste número: o robô ganhou no período, e a distância entre os dois é a folga.",
      conta: "perda típica ÷ (ganho típico + perda típica).",
      exemplo:
        OPS_PARA_EMPATAR === null
          ? undefined
          : `${reais(OPS.perda)} ÷ (${reais(OPS.ganho)} + ${reais(OPS.perda)}) = ${formatarNumero(OPS_PARA_EMPATAR * 100)} de cada 100`,
    },
    {
      nome: `${GLOSSARIO.ganhoMedio.nome} e ${GLOSSARIO.perdaMedia.nome.toLocaleLowerCase("pt-BR")}`,
      texto:
        "O tamanho de um ganho e o de uma perda, em reais: quanto o robô ganha, em média, numa operação que termina com ganho, e quanto perde numa que termina com perda. Junto vem a maior perda que ele já teve numa operação só.",
      exemplo: `${reais(OPS.ganho, true)} e ${reais(-OPS.perda, true)}`,
    },
    {
      id: "fator-lucro",
      nome: GLOSSARIO.fatorLucro.nome,
      texto: "Quanto o robô ganhou para cada R$ 1 perdido, somando todas as operações. Acima de R$ 1, ganhou mais do que perdeu.",
      conta: "soma dos ganhos ÷ soma das perdas. Sem nenhuma perda no período, fica sem valor.",
      exemplo: `${reais(OPS_GANHOS)} ÷ ${reais(OPS_PERDAS)} = ${centavos(OPS_GANHOS / OPS_PERDAS)}`,
    },
    {
      id: "resultado-por-operacao",
      nome: GLOSSARIO.resultadoPorOperacao.nome,
      texto:
        "O que sobra, em média, de cada operação. Ao lado, a tela mostra o custo considerado por operação, ou avisa que o histórico não tem custo descontado: é a folga do robô. Se na sua conta cada operação custar mais ou sair a um preço pior, é daqui que sai.",
      conta: "resultado do período ÷ número de operações.",
      exemplo: `${reais(OPS_RESULTADO, true)} ÷ ${formatarNumero(OPS_TOTAL)} = ${centavos(OPS_RESULTADO / OPS_TOTAL, true)}`,
    },
  ];

  const numerosDosMesesEDias: Linha[] = [
    {
      nome: GLOSSARIO.mesesComGanho.nome,
      texto: `${GLOSSARIO.mesesComGanho.texto} Fica no Resumo, junto das barras de cada mês.`,
      exemplo: `${formatarNumero(MESES.comGanho)} de ${formatarNumero(MESES.meses)} meses`,
    },
    {
      nome: GLOSSARIO.piorMes.nome,
      texto: GLOSSARIO.piorMes.texto,
      exemplo: MESES.pior ? `o ${MESES.pior.mes}, ${reais(MESES.pior.valor, true)}` : undefined,
    },
    {
      nome: `${GLOSSARIO.diasPositivos.nome} e ${GLOSSARIO.piorDia.nome.toLocaleLowerCase("pt-BR")}`,
      texto:
        "Em quantos pregões, do total de pregões com operação, o robô terminou com ganho, e o dia de menor resultado, com a data. Dia que fecha em zero não entra nos dias com ganho nem nos com perda.",
      exemplo: `pior dia: ${reais(Math.min(...PIORES_DIAS), true)}`,
    },
    {
      id: "dia-ruim-tipico",
      nome: GLOSSARIO.diaRuimTipico.nome,
      texto:
        "A perda que 1 em cada 20 pregões alcançou ou passou. O pior dia é um caso só; este número diz o tamanho de um dia ruim que acontece de tempos em tempos. Fica em Quedas e risco.",
      conta: `com os pregões em ordem, do pior para o melhor, é o resultado que deixa 1 em cada 20 para trás. Com menos de ${formatarNumero(MINIMO_PARA_DIA_RUIM)} pregões, ou quando nem 1 em 20 foi de perda, fica sem valor.`,
      exemplo: DIA_RUIM === null ? undefined : reais(DIA_RUIM, true),
    },
    {
      nome: GLOSSARIO.sequenciaDiasNegativos.nome,
      texto: `${GLOSSARIO.sequenciaDiasNegativos.texto} Dia que fecha em zero interrompe a contagem.`,
    },
    {
      nome: GLOSSARIO.pregoesOperados.nome,
      texto: `${GLOSSARIO.pregoesOperados.texto} O site não sabe por que o robô não operou num dia, e não inventa o motivo.`,
    },
  ];

  // O que não está no número (DESIGN.md, seção 9: o que o sistema não sabe não é inventado). Sem preço de
  // licença e sem alíquota de imposto: o site não tem esses dados
  const diferencasNaSuaConta: Linha[] = [
    {
      nome: "O preço em que a ordem sai",
      texto:
        "A sua ordem pode não sair no mesmo preço da conta acompanhada pelo site, principalmente com o mercado rápido ou com mais contratos. Em robô que ganha pouco por operação essa diferença pesa: compare com o resultado médio por operação dele. Quando a conta acompanhada é uma conta demo, a página do robô avisa.",
    },
    {
      nome: "Os custos da sua corretora",
      texto: [
        comCusto.length > 0
          ? "O site desconta de cada operação um custo de referência por contrato, mostrado na página de cada robô. Se a sua corretora cobrar outro valor de corretagem ou de taxas, o seu resultado muda na mesma medida, em todas as operações."
          : "",
        semCusto.length > 0
          ? `No ${nomesSemCusto}, que não ${temOuTem} custo no histórico, os números estão ${custosDoRobo(semCusto[0].custo_por_contrato)}: o custo inteiro da sua corretora sai do resultado.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
    {
      nome: "O imposto de renda",
      texto: "Os números do site são antes do imposto de renda. Apurar e pagar o imposto sobre os ganhos é responsabilidade de quem opera.",
    },
    {
      nome: "A licença do robô",
      texto: "Usar o robô depende de uma licença, e o valor dela não entra em nenhum número do site. As condições são informadas pela equipe.",
    },
  ];

  // 22/09/2026: duas fontes. O coletor mede a cada movimento do preço, com a operação aberta; nos dias sem
  // essa medição, a conta é por fechamento. A tela diz qual valeu no dia.
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
  ];

  // as quatro respostas de semaforoDe (lib/stats/simulador), com o mesmo título que a tela escreve
  const respostasDoSimulador: Linha[] = [
    {
      nome: "Cabe",
      texto: `O capital cobre o capital mínimo e a maior queda simulada não passa de ${formatarPct(LIMITE_APERTADO, 0)} do capital informado.`,
    },
    {
      nome: "Apertado",
      texto: `Cabe, mas a maior queda simulada passa de ${formatarPct(LIMITE_APERTADO, 0)} do capital informado.`,
    },
    {
      nome: "Não cabe",
      texto: "O capital é menor que o capital mínimo, ou a maior queda simulada é igual ou maior que o capital: ela teria levado o capital inteiro.",
    },
    {
      nome: "Não dá para avaliar se cabe",
      texto:
        "Algum robô escolhido está sem capital mínimo, porque a garantia do ativo dele não está cadastrada ou porque as entradas abertas dele não puderam ser lidas. Ele aparece com um traço no lugar do mínimo, e a frase diz por que falta e quanto os outros robôs escolhidos já pedem. Sem o mínimo inteiro, o simulador não dá veredito.",
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
      texto: "Compara a maior queda do horário com a queda típica dos horários: 1 é igual à típica, 2 é o dobro.",
      conta: "maior queda do horário ÷ a maior queda que fica no meio, pondo em ordem as dos horários com operações suficientes.",
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
    { termo: "Contrato", texto: "A unidade mínima de negociação. Os valores do site são sempre para 1 contrato por entrada." },
    { termo: "Entrada", texto: "Cada vez que o robô entra no mercado. Um robô pode ter mais de uma entrada aberta ao mesmo tempo." },
    { termo: "Pregão", texto: "O dia de negociação da bolsa. Fins de semana e feriados não têm pregão." },
    { termo: "Day trade", texto: "Operação que abre e fecha no mesmo pregão." },
    {
      termo: "Garantia (a margem)",
      texto: "O valor que a corretora exige na conta para cada contrato aberto. Não é um custo: é dinheiro que precisa estar lá enquanto o contrato estiver aberto.",
    },
    {
      termo: GLOSSARIO.flutuante.nome,
      texto: "Quanto a operação ainda aberta daria se fosse encerrada agora. Só vira resultado quando a operação fecha.",
    },
    {
      termo: "Magic number",
      texto: "Termo do MetaTrader 5: o número que cada robô grava nas próprias ordens. É como o site sabe qual robô fez cada operação.",
    },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Como funciona"
        descricao="De onde vêm os números, o que cada um quer dizer e como começar. Tudo pode ser refeito a partir das operações listadas na aba Operações de cada robô."
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

            <Secao id="normalizacao" titulo="1 contrato por entrada e os custos">
              <ComExemplo
                exemplo={
                  ativoDoExemplo ? (
                    <div className="space-y-6">
                      <Conta
                        titulo={`Exemplo: uma compra de ${formatarNumero(COMPRA.contratos)} contratos de ${ativoDoExemplo.nome}`}
                        linhas={[
                          { rotulo: "A saída foi acima da entrada", valor: `${formatarNumero(COMPRA.pontos)} pontos` },
                          { rotulo: `1 ponto de ${ativoDoExemplo.nome}, com 1 contrato`, valor: centavos(ativoDoExemplo.valorPonto) },
                          { rotulo: `Ganho com os ${formatarNumero(COMPRA.contratos)} contratos`, valor: centavos(ganhoDaCompra, true) },
                          {
                            rotulo: `Dividido por ${formatarNumero(COMPRA.contratos)}: com 1 contrato`,
                            valor: centavos(ganhoDaCompra / COMPRA.contratos, true),
                          },
                          ...(roboDoCusto
                            ? [{ rotulo: `Custo de 1 contrato, o do ${roboDoCusto.nome}`, valor: centavos(-roboDoCusto.custo_por_contrato, true) }]
                            : []),
                        ]}
                        resultado={{
                          rotulo: "O que entra no site",
                          valor: centavos(ganhoDaCompra / COMPRA.contratos - (roboDoCusto?.custo_por_contrato ?? 0), true),
                        }}
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
                  <p>Junto do número principal de cada tela vem uma frase como “{premissaDeExemplo}”. Ela diz duas coisas.</p>
                  <p>
                    <strong>Com 1 contrato por entrada.</strong> Contrato é a unidade de negociação da bolsa. Todo valor é dividido pela
                    quantidade de contratos da operação, para mostrar quanto daria com 1. Assim os robôs ficam na mesma régua, e você
                    multiplica pelo número de contratos que pretende usar em cada entrada.
                  </p>
                  <p>
                    O “por entrada” importa: um robô pode abrir uma entrada nova antes de fechar a anterior, e aí a conta carrega vários
                    contratos ao mesmo tempo, mesmo com 1 em cada entrada. Quantas cada robô já chegou a ter está em{" "}
                    <a href="#entradas-abertas" className={LINK_DO_PAINEL}>
                      {GLOSSARIO.entradasAbertas.nome.toLocaleLowerCase("pt-BR")}
                    </a>
                    .
                  </p>
                  {/* a premissa dos custos de cada robô vem de src/lib/premissa: "já descontados os custos" só para quem
                      tem custo cadastrado; quem não tem é dito pelo nome, lido do banco */}
                  {comCusto.length > 0 ? (
                    <p id="custos">
                      <strong>{comMaiuscula(custosDoRobo(comCusto[0].custo_por_contrato))}.</strong> De cada operação sai um custo fixo por
                      contrato (corretagem e taxas da bolsa), definido por robô e mostrado na página dele. Ganho e perda são decididos depois
                      dos custos: uma operação que ganha menos do que o custo conta como perda.
                    </p>
                  ) : null}
                  {semCusto.length > 0 ? (
                    <p id={comCusto.length > 0 ? undefined : "custos"}>
                      <strong>{comMaiuscula(custosDoRobo(semCusto[0].custo_por_contrato))}.</strong>{" "}
                      {semCusto.length === 1 ? `O histórico de ${nomesSemCusto}` : `Os históricos de ${nomesSemCusto}`} não {temOuTem} custo
                      cadastrado: os números são os da plataforma, sem desconto nenhum, e a frase junto do número diz “
                      {premissaDoRobo(semCusto[0].custo_por_contrato)}”.
                      {comCusto.length > 0 ? ` Na soma dos robôs, como a da Visão geral, a frase diz “${custosDaSomaDosRobos}”.` : ""}
                    </p>
                  ) : null}
                  <p>
                    {comCusto.length > 0 ? "Esse custo é uma referência. O da sua corretora pode ser outro" : "O custo da sua corretora não está nesses números"}
                    : veja{" "}
                    <a href="#sua-conta" className={LINK_DO_PAINEL}>
                      o que pode ser diferente na sua conta
                    </a>
                    .
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="operacao" titulo="O que conta como uma operação">
              <ComExemplo
                exemplo={
                  // 21/09/2026: o contador de operações em aberto. Conta entradas, nunca contratos (spec §6)
                  <div id="operacoes-em-aberto">
                    <AoLado titulo={GLOSSARIO.operacoesEmAberto.nome}>
                      <p className="leading-relaxed text-pretty">
                        Cada entrada que o robô fez e ainda não fechou conta 1. É número de entradas, nunca de contratos: o site não mostra
                        quantos contratos há em cada entrada nem o tamanho da conta.
                      </p>
                      <p className="mt-2 leading-relaxed text-pretty text-muted-foreground">
                        A contagem respeita o atraso configurado para cada robô e some fora do pregão ou quando o coletor fica sem sinal.
                      </p>
                    </AoLado>
                  </div>
                }
              >
                <Texto>
                  <p>
                    Uma operação vai de uma entrada do robô no mercado até a saída completa dela. O robô pode ter mais de uma aberta ao
                    mesmo tempo: cada entrada é uma operação.
                  </p>
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
                  <p>
                    Na aba Operações, o <strong>pior momento</strong> de cada operação é o máximo que o preço andou contra ela enquanto esteve
                    aberta, em pontos: quanto ela chegou a perder antes de fechar. Fica vazio nas operações que o coletor não acompanhou.
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="resultado" titulo="Resultado">
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
                    É a soma dos ganhos menos as perdas das operações fechadas no período, com 1 contrato por entrada. Positivo quer dizer
                    que o robô terminou o período com ganho. A frase escrita junto do número diz se os custos já foram descontados (
                    <a href="#custos" className={LINK_DO_PAINEL}>
                      veja acima
                    </a>
                    ).
                  </p>
                  <p>
                    Cada operação conta no dia de pregão em que fechou, pelo horário de Brasília. Sábados, domingos e feriados da bolsa não são
                    dias de pregão.
                  </p>
                  <p>
                    Junto do número vem o <strong>tamanho do histórico</strong>, em meses e em pregões: um resultado de poucos meses diz menos
                    que um de vários anos. E ao lado de todo resultado vem a maior queda, porque o ganho só faz sentido junto do que foi
                    preciso aguentar para chegar a ele.
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="drawdown" titulo={GLOSSARIO.drawdown.nome} apoio="o nome técnico é drawdown">
              <ComExemplo exemplo={<ExemploDaQueda />}>
                <Texto>
                  <p>
                    É a distância entre o ponto mais alto que a soma do resultado alcançou e o ponto mais baixo que veio depois. Mostra o
                    tamanho do pior momento: quanto o robô chegou a devolver antes de voltar a subir. Nas curvas do site ela aparece em
                    vermelho, na própria linha.
                  </p>
                  <p>
                    A conta: em cada dia, mede-se quanto a soma está abaixo do maior valor que já teve. A maior queda é a maior dessas
                    distâncias no período, em reais, com 1 contrato por entrada.
                  </p>
                  <p>
                    Junto dela o site diz se a queda <strong>já foi recuperada</strong>: quantos dias corridos passaram entre o último dia no
                    ponto mais alto e o primeiro dia em que a curva voltou a ele. Enquanto não volta, aparece “ainda não recuperou”.
                  </p>
                  <p>
                    <strong>{GLOSSARIO.quedaAtual.nome}</strong> é a mesma medida olhando para agora: quanto o resultado está, hoje, abaixo do
                    ponto mais alto que já alcançou. Zero quer dizer que o robô está no topo.
                  </p>
                  <p>
                    A aba Quedas e risco de cada robô mostra a maior queda por dentro: quanto tempo levou caindo e até recuperar, os dias
                    abaixo do topo e as outras quedas do histórico.
                  </p>
                  <p>
                    Uma curva desenhada operação por operação passa pelo saldo no meio de cada pregão, e por isso pode mostrar uma queda maior
                    que a curva por dia, que só olha o fechamento de cada dia.
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="ganho-por-queda" titulo={GLOSSARIO.ganhoPorQueda.nome}>
              <ComExemplo
                exemplo={
                  QUEDA && GANHO_POR_QUEDA !== null ? (
                    <Conta
                      titulo="Exemplo: os seis pregões da maior queda"
                      linhas={[
                        { rotulo: "Resultado dos seis pregões", valor: reais(RESULTADO_DA_CURVA, true) },
                        { rotulo: GLOSSARIO.drawdown.nome, valor: <span className="text-negativo">{reais(-QUEDA.valor, true)}</span> },
                      ]}
                      resultado={{ rotulo: "Ganho para cada R$ 1 da maior queda", valor: centavos(GANHO_POR_QUEDA) }}
                    />
                  ) : null
                }
              >
                <Texto>
                  <p>
                    É o resultado do período dividido pela maior queda do mesmo período. Responde se o ganho compensou o que foi preciso
                    aguentar para chegar a ele.
                  </p>
                  {GANHO_POR_QUEDA !== null ? (
                    <p>
                      No exemplo, o robô ganhou {centavos(GANHO_POR_QUEDA)} para cada R$&nbsp;1 que já chegou a cair. Abaixo de R$&nbsp;1, o
                      resultado ainda não pagou a maior queda. Só há número quando o período terminou com ganho e teve alguma queda.
                    </p>
                  ) : null}
                  <p>
                    É este número que põe os robôs em ordem na lista da{" "}
                    <Link href="/" className={LINK_DO_PAINEL}>
                      Visão geral
                    </Link>
                    : quanto maior, menos o resultado dependeu de aguentar uma queda grande.
                  </p>
                  <p>
                    Num histórico curto ele pode enganar para cima: quanto mais tempo de histórico, maior a chance de uma queda grande já ter
                    aparecido. Por isso o tamanho do histórico vem escrito junto.
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="capital-minimo" titulo={GLOSSARIO.capitalMinimo.nome}>
              <ComExemplo
                exemplo={
                  exemplo && contaDoExemplo ? (
                    <div>
                      <Conta
                        titulo={`A conta do ${exemplo.robo.nome}, com os números de hoje`}
                        linhas={[
                          { rotulo: `Garantia por contrato de ${exemplo.robo.ativo_nome}`, valor: reais(exemplo.capital.margem) },
                          { rotulo: "Máximo de entradas abertas ao mesmo tempo", valor: formatarNumero(exemplo.capital.entradas) },
                          {
                            rotulo: `Garantia: ${reais(exemplo.capital.margem)} × ${formatarNumero(exemplo.capital.entradas)}`,
                            valor: reais(contaDoExemplo.garantia),
                          },
                          {
                            rotulo: `Maior queda do histórico${historicoDoExemplo ? ` (${historicoDoExemplo})` : ""}`,
                            valor: <span className="text-negativo">{reais(-exemplo.capital.maiorQueda, true)}</span>,
                          },
                          { rotulo: `Mais a maior queda × ${formatarMultiplo(exemplo.capital.fator, 1)}`, valor: reais(contaDoExemplo.folga) },
                        ]}
                        resultado={{ rotulo: GLOSSARIO.capitalMinimo.nome, valor: reais(contaDoExemplo.total) }}
                      />
                      <Nota>
                        {comMaiuscula(premissaDoRobo(exemplo.robo.custo_por_contrato))}.
                        {exemplo.capital.entradas > 1 ? " É o robô do site que já teve mais entradas abertas ao mesmo tempo." : ""} A mesma conta
                        está em{" "}
                        <Link href={`/robos/${exemplo.robo.slug}/risco`} className={LINK_DO_PAINEL}>
                          Quedas e risco do {exemplo.robo.nome}
                        </Link>
                        .
                      </Nota>
                    </div>
                  ) : null
                }
              >
                <Texto>
                  <p>
                    É quanto ter na conta para usar o robô com 1 contrato por entrada e alguma folga. Tem duas partes: a garantia que a
                    corretora exige para manter os contratos abertos (a margem) e uma reserva para aguentar uma queda como a pior que o robô
                    já teve.
                  </p>
                  <p>
                    A conta:{" "}
                    <strong>
                      garantia por contrato × o máximo de entradas que o robô já teve abertas ao mesmo tempo + maior queda × {fator}
                    </strong>
                    .
                  </p>
                  <p>
                    A <strong>garantia</strong> é a que a corretora exige por contrato em day trade, cadastrada por ativo
                    {garantias.length > 0 ? ` (hoje, ${emLista(garantias.map((g) => `${reais(g.margem)} por contrato de ${g.nome}`))})` : ""}.
                    Ela é multiplicada pelas entradas porque, com várias abertas, a corretora exige a garantia de cada contrato.
                  </p>
                  <p>
                    A <strong>maior queda</strong> é a de todo o histórico do robô, seja qual for o período escolhido na tela. Entra
                    multiplicada por {fator}, o fator de segurança, porque quedas futuras podem ser maiores que as do passado.
                  </p>
                  <p>
                    É o mesmo número na lista da Visão geral, no Resumo e em Quedas e risco de cada robô e em Simular meu capital. Sem a
                    garantia do ativo cadastrada, sem a leitura das entradas abertas ou sem nenhuma operação no histórico, o robô fica sem
                    capital mínimo: no lugar do número aparece um traço, e o site não inventa a conta.
                  </p>
                  <p>
                    É uma referência, não uma promessa: a próxima queda pode ser maior que a do histórico, e a corretora pode mudar a
                    garantia que exige.
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="entradas-abertas" titulo={GLOSSARIO.entradasAbertas.nome}>
              <ComExemplo
                exemplo={
                  <div>
                    <Conta
                      titulo={`Exemplo: ${formatarNumero(ENTRADAS_DO_EXEMPLO.length)} entradas num pregão`}
                      desenho={
                        <EntradasDeExemplo
                          intervalos={ENTRADAS_DO_EXEMPLO}
                          quando={PICO_DO_EXEMPLO.quando}
                          descricao={`Desenho de exemplo: ${formatarNumero(ENTRADAS_DO_EXEMPLO.length)} entradas ao longo de um pregão, cada uma num traço. No instante marcado, ${formatarNumero(PICO_DO_EXEMPLO.maximo)} estão abertas ao mesmo tempo.`}
                        />
                      }
                      linhas={[
                        { rotulo: "Entradas no pregão", valor: formatarNumero(ENTRADAS_DO_EXEMPLO.length) },
                        { rotulo: "Abertas ao mesmo tempo, no máximo", valor: formatarNumero(PICO_DO_EXEMPLO.maximo) },
                      ]}
                      resultado={{ rotulo: "Contratos na conta nesse instante, com 1 por entrada", valor: formatarNumero(PICO_DO_EXEMPLO.maximo) }}
                    />
                    <Nota>Cada traço é uma entrada, de quando abre até fechar. O fio marca o instante com mais entradas abertas.</Nota>
                  </div>
                }
              >
                <Texto>
                  <p>
                    É o máximo de operações que o robô já teve abertas no mesmo instante. Importa porque os valores do site são para{" "}
                    <strong>1 contrato por entrada</strong>, e não para 1 contrato na conta.
                  </p>
                  <p>
                    Alguns robôs abrem uma entrada nova antes de fechar a anterior. Com várias abertas, a conta carrega vários contratos ao
                    mesmo tempo, e a corretora exige a garantia de cada um.
                  </p>
                  {exemplo && contaDoExemplo && exemplo.capital.entradas > 1 ? (
                    <p>
                      O {exemplo.robo.nome} já teve até <strong>{formatarNumero(exemplo.capital.entradas)} entradas abertas ao mesmo tempo</strong>
                      {exemplo.capital.entradasEm ? `, em ${formatarData(exemplo.capital.entradasEm)}` : ""}. Naquele instante, quem usava 1
                      contrato por entrada estava com {formatarNumero(exemplo.capital.entradas)} contratos de {exemplo.robo.ativo_nome} e
                      precisava de {reais(contaDoExemplo.garantia)} só de garantia.
                    </p>
                  ) : null}
                  <p>
                    Quem usa 2 contratos por entrada dobra tudo junto: o resultado, a maior queda, os contratos abertos e o capital mínimo.
                  </p>
                  <p>
                    A medição usa as operações acompanhadas ao vivo pelo coletor, que têm a hora da entrada e a da saída. As do histórico
                    importado não têm hora de entrada e ficam fora dela; robô sem nenhuma operação ao vivo entra na conta do capital mínimo
                    com 1 entrada.
                  </p>
                </Texto>
              </ComExemplo>
            </Secao>

            <Secao id="taxa-acerto" titulo="Acertos e o necessário para empatar">
              <Texto>
                <p>
                  Acertos são quantas, de cada 100 operações, terminaram com ganho. Sozinho, o número engana: um robô pode acertar quase
                  sempre e perder dinheiro, se cada perda for muito maior que cada ganho. Por isso o site nunca mostra os acertos sem o
                  necessário para empatar ao lado.
                </p>
                <p>
                  O exemplo: {formatarNumero(OPS_TOTAL)} operações, {formatarNumero(OPS.comGanho)} com ganho de {reais(OPS.ganho)} cada (
                  {reais(OPS_GANHOS)} ao todo) e {formatarNumero(OPS.comPerda)} com perda de {reais(OPS.perda)} cada ({reais(OPS_PERDAS)} ao todo).
                  O resultado é {reais(OPS_RESULTADO, true)}.
                </p>
                <p>Estes números ficam no Resumo de cada robô, em “Como ele opera”.</p>
              </Texto>
              <Linhas itens={numerosDasOperacoes} />
            </Secao>

            <Secao id="meses-e-dias" titulo="Meses com ganho, pior mês e um dia ruim típico">
              <Texto>
                <p>
                  Dois robôs com o mesmo resultado podem ter chegado a ele de jeitos diferentes: um pouco a cada mês, ou tudo em dois meses
                  bons. Estes números mostram a regularidade e o tamanho de um período ruim.
                </p>
                <p>
                  O exemplo: {formatarNumero(MESES.meses)} meses que terminaram em {emLista(MESES_DO_EXEMPLO.map((m) => reais(m.valor, true)))}; e{" "}
                  {formatarNumero(PREGOES_DO_DIA_RUIM)} pregões em que os dois piores dias foram de {emLista(PIORES_DIAS.map((v) => reais(v, true)))}.
                </p>
              </Texto>
              <Linhas itens={numerosDosMesesEDias} />
            </Secao>

            <Secao id="sua-conta" titulo="O que pode ser diferente na sua conta">
              <Texto>
                <p>
                  Os números do site são os da conta da Quants Robôs, com 1 contrato por entrada e o custo de referência de cada robô,
                  quando ele tem custo cadastrado. Quatro coisas que mudam o resultado de quem usa o robô não estão neles.
                </p>
              </Texto>
              <Linhas itens={diferencasNaSuaConta} />
              <Texto>
                <p>
                  <strong>Resultado passado não garante resultado futuro.</strong> O histórico mostra o que o robô já fez: a próxima queda
                  pode ser maior que a maior queda de até hoje, e um robô que ganhou pode passar a perder.
                </p>
                {links.whatsapp ? (
                  <p>
                    Para saber as condições da licença,{" "}
                    <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className={LINK_DO_PAINEL}>
                      fale com a equipe
                    </a>
                    .
                  </p>
                ) : null}
              </Texto>
            </Secao>

            {/* 23/09/2026: a página /simulador (spec §8.6). A conta é a de lib/stats/simulador: soma ponderada das séries
                diárias públicas, maior queda comparada com o capital informado e capital mínimo pela regra de cima */}
            <Secao id="simulador" titulo="Simular meu capital">
              <ComExemplo
                exemplo={
                  <Conta
                    titulo="Exemplo: um dia da simulação"
                    linhas={[
                      { rotulo: "Capital informado", valor: reais(10000) },
                      { rotulo: `Um robô com 2 contratos por entrada, num dia de ${reais(50, true)}`, valor: reais(100, true) },
                      { rotulo: `Outro com 1 contrato por entrada, num dia de ${reais(-30, true)}`, valor: reais(-30, true) },
                    ]}
                    resultado={{ rotulo: "O capital no fim do dia", valor: reais(10070) }}
                  />
                }
              >
                <Texto>
                  <p>
                    <Link href="/simulador" className={LINK_DO_PAINEL}>
                      Simular meu capital
                    </Link>{" "}
                    aplica o histórico dos robôs ao capital e aos contratos por entrada que você informar. É aritmética sobre o que já
                    aconteceu: não é recomendação nem projeção de resultado.
                  </p>
                  <p>
                    Para cada dia de pregão, soma o resultado de cada robô escolhido vezes os contratos informados; dia em que o robô não
                    operou conta zero. O resultado simulado é essa soma, só em reais: percentual de retorno não entra em tela nenhuma. O
                    capital de cada dia é o capital informado mais a soma até ali, e a maior queda é medida nessa curva, em reais e em
                    porcentagem do capital informado, porque mede o risco.
                  </p>
                  <p>
                    O capital mínimo da escolha é a soma, robô a robô, de contratos × capital mínimo do robô. Sem capital digitado, a
                    simulação usa esse valor e diz isso. Robô escolhido sem capital mínimo (sem a garantia do ativo cadastrada, ou sem a
                    leitura das entradas abertas) aparece com um traço no lugar do mínimo, e a resposta passa a ser “Não dá para avaliar se
                    cabe”.
                  </p>
                </Texto>
              </ComExemplo>

              <div className="space-y-3">
                <Subtitulo>{GLOSSARIO.semaforoCapital.nome}</Subtitulo>
                <Linhas itens={respostasDoSimulador} />
              </div>

              <div className="space-y-2">
                <Subtitulo id="andam-juntos">{GLOSSARIO.andamJuntos.nome}</Subtitulo>
                <Texto>
                  <p>
                    Quando dois robôs escolhidos ganharam ou perderam no mesmo dia em pelo menos {formatarPct(LIMITE_ANDAM_JUNTOS, 0)} dos
                    pregões em que os dois operaram, o simulador avisa. Usar os dois ao mesmo tempo, nesse caso, soma o risco em vez de
                    dividir: os dias ruins de um costumam ser os dias ruins do outro.
                  </p>
                  <p>O aviso só aparece quando os dois têm pelo menos {formatarNumero(MINIMO_DE_DIAS_EM_COMUM)} pregões em comum.</p>
                </Texto>
              </div>
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
                    <Nota>
                      Por fechamento, esse dia não teria pior momento: a soma dos fechamentos ({reais(80, true)}, depois {reais(80 - 50, true)})
                      nunca ficou negativa.
                    </Nota>
                  </div>
                }
              >
                <Texto>
                  <p>
                    São o ponto mais alto e o mais baixo que o resultado do dia alcançou com o pregão em andamento. O pior momento mostra
                    quanto o dia chegou a ficar no prejuízo, mesmo quando terminou bem. Aparecem na aba Ao vivo e no dia escolhido em Dia a
                    dia.
                  </p>
                  <p>Há dois jeitos de medir, e a tela diz qual valeu em cada dia.</p>
                </Texto>
                <Linhas itens={fontesDoDia} />

                {/* 23/09/2026: a curva real do dia. A conta é a de lib/stats/saldo-dia (liquidarSerie); como no melhor
                    e no pior momento, a tela diz qual foi a fonte do dia mostrado */}
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

            <Secao id="faixas" titulo="Melhores horários">
              <Texto>
                <p>
                  Cada combinação de dia da semana e hora de entrada, como segunda às 10h, junta as operações que começaram ali. A aba
                  Melhores horários de cada robô mede cada horário e diz em quais o histórico foi melhor.
                </p>
                <p>
                  Os horários vão de segunda a sexta, das {HORAS[0]}h às {HORAS[HORAS.length - 1]}h. Três números decidem a classificação de
                  cada um: os acertos, a recuperação e a queda relativa.
                </p>
                <p>
                  Como no resto do site, os acertos de cada horário aparecem ao lado do necessário para empatar, calculado com o ganho
                  típico e a perda típica das operações daquele horário.
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
                  <p>
                    É uma leitura do histórico de cada horário, não uma previsão: horário com poucas operações muda de classificação com
                    facilidade.
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
