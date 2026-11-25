import { cn } from "cn";
import Link from "next/link";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Valor } from "@/components/compartilhados/Valor";
import { ListaKpi, type ItemKpi } from "@/components/desempenho/CardsKpi";
import { linkSimulador } from "@/components/simulador/simulador-url";
import { Fato, Fatos } from "@/components/sistema/Numero";
import { Grade } from "@/components/sistema/Pagina";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import type { CapitalDoRobo } from "@/lib/consultas/capital";
import { formatarBRL, formatarData, formatarDataCurta, formatarNumero, formatarPct } from "@/lib/formato";
import { tempoEmPalavras } from "@/lib/stats/indicadores-robo";
import type { ContaDoCapital, EpisodioDrawdown, PiorMomento, ResultadoPorOperacao, RiscoDoRobo } from "@/lib/stats/risco";
import { CurvaDaQueda } from "./CurvaDaQueda";

interface Props {
  /** o robô, para o link "Simular meu capital" chegar ao simulador já com ele marcado */
  slug: string;
  /** os pregões do histórico em ordem de data, [dia, resultado]: desenham a curva no navegador */
  dias: ReadonlyArray<readonly [dia: string, valor: number]>;
  /** a leitura do histórico inteiro (riscoDoRobo) */
  risco: RiscoDoRobo;
  /** o capital mínimo e as parcelas dele (capitalDoRobo): o mesmo número das outras telas */
  capital: CapitalDoRobo | null;
  /** as parcelas já fechadas em R$ inteiros (contaDoCapital); nulo sem garantia cadastrada */
  conta: ContaDoCapital | null;
  /** a parte da conta que a maior queda pode levar sem o capital ficar apertado (a mesma régua do simulador) */
  limite: number;
  /** o pior momento dentro de um pregão, só quando o coletor mediu */
  momento: PiorMomento | null;
  porOperacao: ResultadoPorOperacao | null;
}

// quantas quedas a tabela lista, depois da maior: as pequenas não mudam a resposta da tela
const OUTRAS_QUEDAS = 5;

const fmtMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
/** "julho de 2026", a partir de "2026-07" */
const mesPorExtenso = (mes: string) => fmtMes.format(new Date(`${mes}-01T12:00:00Z`));

const quantos = (n: number, um: string, varios: string) => `${formatarNumero(n)} ${n === 1 ? um : varios}`;
const emDias = (n: number) => quantos(n, "dia", "dias");

/** Até uns três meses, em dias; daí em diante, em meses e anos, que é como se fala. */
const duracao = (de: string, ate: string, dias: number) => (dias < 100 ? emDias(dias) : tempoEmPalavras(de, ate));

/** "08/07 a 02/09/2026"; com a virada do ano no meio, as duas datas inteiras. */
const intervaloDeDatas = (de: string, ate: string) =>
  de.slice(0, 4) === ate.slice(0, 4) ? `${formatarDataCurta(de)} a ${formatarData(ate)}` : `${formatarData(de)} a ${formatarData(ate)}`;

const brl = (v: number) => formatarBRL(v, { inteiro: true });
/** perda em R$ sem centavos, com o sinal e a cor: os dias ruins da lista alinham entre si */
const emReais = (v: number) => <Valor valor={v} inteiro />;
/** "1,5", "2", "1,25": o fator como se escreve numa conta */
const fator = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
/** "61%"; abaixo de 10%, com uma casa */
const parte = (fracao: number) => formatarPct(fracao, fracao < 0.1 ? 1 : 0);

/**
 * Aba "Quedas e risco" (ficha Mesa; revisão de 25/11/2026, DESIGN.md seção 9). Responde a uma pergunta:
 * quanto posso perder e quanto capital preciso?
 *
 * - No alto, a maior queda do histórico em número grande, com os fatos dela ao lado (quanto tempo caiu,
 *   quanto levou para recuperar, quanto está abaixo do topo hoje e em quantos pregões esteve abaixo dele) e a
 *   curva com a queda em vermelho (CurvaDaQueda, a única parte que roda no navegador).
 * - "Quanto capital é preciso": a conta do capital mínimo por extenso, uma parcela por linha, com os números
 *   que capitalDoRobo publica para todas as telas; quanto a maior queda levaria desse capital e quanto seria
 *   preciso para ela ficar no limite que o simulador chama de apertado. Ao lado, o que não está no número.
 * - As outras quedas em tabela e "Mais números": os dias ruins (o típico, o pior, o pior mês, a maior
 *   sequência, o pior momento dentro de um dia quando há medição), o ganho para cada R$ 1 da maior queda e o
 *   resultado médio por operação com o custo considerado.
 *
 * Risco é do histórico inteiro: a aba não tem mais período (com "Mês" a tela mostrava uma maior queda menor
 * que a da conta do capital, logo embaixo). Saíram Calmar, índice de úlcera, risco de ruína, variação de um
 * dia para o outro, tempo médio para recuperar, o capital de referência e a queda em % dele.
 *
 * Aqui só se desenha: as contas vêm prontas de lib/stats/risco (riscoDoRobo, contaDoCapital,
 * piorMomentoMedido, resultadoPorOperacao) e de consultas/capital.
 */
export function PainelRisco({ slug, dias, risco, capital, conta, limite, momento, porOperacao }: Props) {
  if (risco.pregoes === 0 || risco.primeiroDia === null || risco.ultimoDia === null) {
    return <p className="text-sm text-muted-foreground">Sem operações fechadas ainda.</p>;
  }

  const { maior, outras, atual } = risco;
  const comCustos = (porOperacao?.custo ?? 0) > 0;
  const premissa = `com 1 contrato por entrada, ${comCustos ? "já descontados os custos" : "antes dos custos"} · histórico de ${tempoEmPalavras(risco.primeiroDia, risco.ultimoDia)}`;

  const fatos = maior ? (
    <Fatos className="max-w-[28rem] xl:pb-0.5">
      <Fato rotulo="Tempo caindo">
        <span className="mr-3 text-sutil">{intervaloDeDatas(maior.inicio, maior.fundo)}</span>
        <span className="font-medium whitespace-nowrap">{duracao(maior.inicio, maior.fundo, maior.diasAteFundo)}</span>
      </Fato>
      <Fato rotulo="Tempo até recuperar">
        {maior.recuperacao && maior.diasAteRecuperar !== null ? (
          <>
            <span className="mr-3 text-sutil">em {formatarData(maior.recuperacao)}</span>
            <span className="font-medium whitespace-nowrap">{duracao(maior.inicio, maior.recuperacao, maior.diasAteRecuperar)}</span>
          </>
        ) : (
          <span className="font-medium text-alerta">ainda não recuperou</span>
        )}
      </Fato>
      <Fato rotulo="Abaixo do topo hoje" info="quedaAtual">
        {atual.valor > 0 ? (
          <>
            {/* quando a queda de agora é a própria maior queda, a data do topo já está em "Tempo caindo" */}
            {atual.desde && atual.desde !== maior.inicio ? <span className="mr-3 text-sutil">desde {formatarData(atual.desde)}</span> : null}
            <Valor valor={-atual.valor} inteiro className="font-medium" />
          </>
        ) : (
          <span className="text-muted-foreground">está no topo</span>
        )}
      </Fato>
      <Fato rotulo="Dias abaixo do topo">
        <span className="font-medium">{formatarNumero(risco.diasAbaixoDoTopo)}</span>
        <span className="text-muted-foreground"> de {formatarNumero(risco.pregoes)}</span>
      </Fato>
    </Fatos>
  ) : null;

  const mais = maisNumeros(risco, momento, porOperacao);
  const ladoALado = outras.length > 0 && mais.length > 0;

  return (
    <div className="space-y-10">
      <CurvaDaQueda dias={dias} maiorQueda={risco.maiorQueda} premissa={premissa} fatos={fatos} />

      {/* as seções de baixo terminam na borda direita da curva, como na página inicial */}
      <Grade className="lg:pr-20">
        <QuantoCapital slug={slug} capital={capital} conta={conta} limite={limite} className="xl:col-span-7" />
        <NaSuaConta comCustos={comCustos} className="xl:col-span-5" />
      </Grade>

      {/* a tabela das quedas só divide a linha com a lista em tela bem larga (2xl): com menos que isso as
          cinco colunas não cabem em sete doze avos, e as duas seções empilham na largura toda */}
      {outras.length > 0 || mais.length > 0 ? (
        <div className="grid gap-x-12 gap-y-10 lg:pr-20 2xl:grid-cols-12">
          {outras.length > 0 ? <OutrasQuedas quedas={outras} className={ladoALado ? "2xl:col-span-7" : "2xl:col-span-12"} /> : null}
          {mais.length > 0 ? (
            <Painel id="mais-numeros" titulo="Mais números" corpo="" className={ladoALado ? "2xl:col-span-5" : "2xl:col-span-12"}>
              <ListaKpi itens={mais} className={ladoALado ? "2xl:grid-cols-1" : undefined} />
            </Painel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Uma linha da conta: o que é à esquerda, com uma linha de apoio, e o valor à direita. */
function LinhaDaConta({
  rotulo,
  apoio,
  children,
  total = false,
}: {
  rotulo: React.ReactNode;
  apoio?: React.ReactNode;
  children: React.ReactNode;
  /** a linha do resultado da soma: fio mais forte em cima e o valor maior */
  total?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-6 border-b border-(--painel-fio) py-3", total && "-mt-px border-t border-t-(--painel-fio-forte)")}>
      <dt className="min-w-0">
        <span className={cn("block text-sm text-pretty", total && "font-medium")}>{rotulo}</span>
        {apoio ? <span className="block text-[0.8125rem] text-pretty text-sutil">{apoio}</span> : null}
      </dt>
      <dd className={cn("shrink-0 font-medium whitespace-nowrap", total ? "text-xl leading-none tracking-tight sm:text-[1.375rem]" : "text-sm")}>{children}</dd>
    </div>
  );
}

/**
 * "Quanto capital é preciso": a conta por extenso, uma parcela por linha, como numa soma de papel. A
 * garantia (a margem) é por contrato e o robô chega a ter várias entradas abertas ao mesmo tempo; a maior
 * queda entra com a folga do fator de segurança. Os números são os de capitalDoRobo, os mesmos do Resumo,
 * da lista da Visão geral e do simulador.
 */
function QuantoCapital({
  slug,
  capital,
  conta,
  limite,
  className,
}: Pick<Props, "slug" | "capital" | "conta" | "limite"> & { className?: string }) {
  // sem horário de entrada no histórico (robô só com operações importadas) não há como contar as entradas abertas
  const medidoEm = capital?.entradasEm ?? null;
  return (
    <Painel
      id="capital"
      titulo="Quanto capital é preciso"
      apoio="com 1 contrato por entrada"
      acao={
        <Link href={linkSimulador(slug)} className={LINK_DO_PAINEL}>
          Simular meu capital
        </Link>
      }
      corpo=""
      className={className}
    >
      {capital && conta && capital.margem !== null ? (
        <dl>
          <LinhaDaConta
            rotulo={
              <>
                {brl(capital.margem)} de garantia por contrato ×{" "}
                <RotuloComInfo chave="entradasAbertas">
                  {capital.entradas === 1 ? "1 entrada aberta" : `${formatarNumero(capital.entradas)} entradas abertas ao mesmo tempo`}
                </RotuloComInfo>
              </>
            }
            apoio={
              medidoEm === null
                ? "a conta considera 1 entrada porque o histórico deste robô não traz o horário de entrada"
                : `a garantia (a margem) é o que a corretora exige por contrato aberto; o máximo de entradas abertas foi em ${formatarData(medidoEm)}`
            }
          >
            {brl(conta.garantia)}
          </LinhaDaConta>
          <LinhaDaConta rotulo={`mais a maior queda de ${brl(capital.maiorQueda)} × ${fator(capital.fator)}`} apoio="a maior queda já vista, com folga de segurança">
            {brl(conta.folga)}
          </LinhaDaConta>
          <LinhaDaConta total rotulo={<RotuloComInfo chave="capitalMinimo">Capital mínimo</RotuloComInfo>}>
            {brl(conta.total)}
          </LinhaDaConta>
          {conta.quedaNoCapital !== null ? (
            <LinhaDaConta rotulo="A maior queda nesse capital" apoio="a parte do capital mínimo que uma queda igual à maior já vista levaria">
              {parte(conta.quedaNoCapital)}
            </LinhaDaConta>
          ) : null}
          {/* só aparece quando o mínimo deixa a queda acima do limite: senão o mínimo já responde */}
          {conta.capitalNoLimite !== null ? (
            <LinhaDaConta
              rotulo={`Para a maior queda ficar em ${parte(limite)} da conta`}
              apoio="para uma queda igual à maior já vista pesar menos, é preciso mais capital"
            >
              {brl(conta.capitalNoLimite)}
            </LinhaDaConta>
          ) : null}
        </dl>
      ) : (
        <p className="max-w-3xl pt-3 text-sm text-pretty text-muted-foreground">
          A garantia (a margem) por contrato deste ativo ainda não está cadastrada, e sem ela a conta do capital mínimo não fecha.
        </p>
      )}
    </Painel>
  );
}

/**
 * "Na sua conta pode ser diferente": o que o histórico não tem como saber da conta de quem vai usar o robô,
 * em quatro linhas, e o aviso sobre o futuro. Sem valor nenhum: o site não conhece o preço da licença nem o
 * imposto de cada um.
 */
function NaSuaConta({ comCustos, className }: { comCustos: boolean; className?: string }) {
  const foraDoNumero: ReadonlyArray<readonly [nome: string, texto: string]> = [
    ["O preço em que a ordem sai", "na sua conta a ordem pode sair a um preço pior que o do histórico"],
    ["Os custos da sua corretora", comCustos ? "podem ser diferentes do custo considerado aqui" : "este histórico não tem custo nenhum descontado"],
    ["O imposto de renda", "não está descontado"],
    ["A licença do robô", "não entra em nenhum número do site"],
  ];
  return (
    <Painel id="na-sua-conta" titulo="Na sua conta pode ser diferente" apoio="o que não está nos números" corpo="" className={className}>
      <ul>
        {foraDoNumero.map(([nome, texto]) => (
          <li key={nome} className="border-b border-(--painel-fio) py-2.5">
            <span className="block text-sm">{nome}</span>
            <span className="block text-[0.8125rem] text-pretty text-sutil">{texto}</span>
          </li>
        ))}
      </ul>
      <p className="max-w-3xl pt-3 text-sm text-pretty text-muted-foreground">
        O histórico mostra o que já aconteceu, não o limite: quedas futuras podem ser maiores que a maior já vista.
      </p>
    </Painel>
  );
}

/**
 * As outras quedas, da maior para a menor (a maior está no alto da tela, em número grande). No celular ficam
 * só quando começou, o tamanho e o tempo até recuperar, para a tabela caber sem rolar de lado; as datas do
 * fundo e da volta ao topo entram a partir de sm. Recuperada não é resultado, então não leva verde.
 */
function OutrasQuedas({ quedas, className }: { quedas: EpisodioDrawdown[]; className?: string }) {
  return (
    <Painel
      id="quedas"
      titulo="Outras quedas"
      apoio={quedas.length > OUTRAS_QUEDAS ? `${formatarNumero(quedas.length)} no histórico, as ${OUTRAS_QUEDAS} maiores` : `${formatarNumero(quedas.length)} no histórico`}
      fio={false}
      corpo="pt-1"
      className={className}
    >
      <div className="tbl-moldura">
        <table className="tbl">
          <thead>
            <tr>
              <th>Começou em</th>
              <th className="num">Queda</th>
              <th className="num max-sm:hidden">Fundo em</th>
              <th className="num max-sm:hidden">Voltou ao topo em</th>
              <th className="num">Tempo até recuperar</th>
            </tr>
          </thead>
          <tbody>
            {quedas.slice(0, OUTRAS_QUEDAS).map((e) => (
              <tr key={`${e.inicio}-${e.fundo}`}>
                <td className="whitespace-nowrap">{formatarData(e.inicio)}</td>
                <td className="num">
                  {/* sem centavos em toda a coluna, para os valores alinharem */}
                  <Valor valor={-e.valor} inteiro className="font-medium" />
                </td>
                <td className="num max-sm:hidden">{formatarData(e.fundo)}</td>
                <td className="num max-sm:hidden">{e.recuperacao ? formatarData(e.recuperacao) : <span className="text-alerta">ainda não</span>}</td>
                <td className="num">
                  {e.recuperacao && e.diasAteRecuperar !== null ? (
                    duracao(e.inicio, e.recuperacao, e.diasAteRecuperar)
                  ) : (
                    <>
                      {/* a queda que ainda não voltou conta os dias até o fundo: dali para cima é "mais de". No
                          celular a coluna da volta ao topo não aparece, e é aqui que se lê que ainda não voltou */}
                      <span className="text-alerta sm:hidden">ainda não recuperou</span>
                      <span className="max-sm:hidden">mais de {emDias(e.diasAteFundo)}</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Painel>
  );
}

/**
 * "Mais números": os dias ruins e a folga do robô, cada um com a linha de apoio em português simples. Só
 * entra o que a conta conseguiu fechar: número sem valor não vira traço na tela.
 */
function maisNumeros(risco: RiscoDoRobo, momento: PiorMomento | null, porOperacao: ResultadoPorOperacao | null): ItemKpi[] {
  const itens: ItemKpi[] = [];

  if (risco.diaRuim !== null) {
    itens.push({ rotulo: "Um dia ruim típico", info: "diaRuimTipico", valor: emReais(risco.diaRuim), detalhe: "em 1 de cada 20 pregões perdeu isso ou mais" });
  }
  if (risco.piorDia) {
    itens.push({ rotulo: "Pior dia", valor: emReais(risco.piorDia.valor), detalhe: `em ${formatarData(risco.piorDia.dia)}` });
  }
  const piorMes = risco.meses.pior;
  if (piorMes && risco.meses.meses > 1) {
    itens.push({
      rotulo: "Pior mês",
      valor: emReais(piorMes.valor),
      detalhe: piorMes.valor < 0 ? mesPorExtenso(piorMes.mes) : `${mesPorExtenso(piorMes.mes)}; nenhum mês terminou com perda`,
    });
  }
  if (risco.sequencia) {
    const s = risco.sequencia;
    itens.push({
      rotulo: "Maior sequência de dias com perda",
      valor: quantos(s.dias, "dia", "dias seguidos"),
      detalhe: s.dias > 1 ? `${intervaloDeDatas(s.de, s.ate)}, somando ${brl(s.soma)}` : "nunca perdeu dois pregões seguidos",
    });
  }
  if (momento) {
    // a medição só existe nos pregões que o coletor acompanhou: dizer quantos explica por que este número pode
    // ser menor que o pior dia, que olha o histórico inteiro
    const medidos =
      momento.pregoesMedidos < risco.pregoes
        ? `medido em ${formatarNumero(momento.pregoesMedidos)} dos ${formatarNumero(risco.pregoes)} pregões`
        : "medido em todos os pregões";
    itens.push({
      rotulo: "Pior momento dentro de um dia",
      valor: emReais(momento.valor),
      detalhe: `em ${formatarData(momento.dia)}, com operação aberta; o dia fechou em ${formatarBRL(momento.fechamento, { sinal: true, inteiro: true })} · ${medidos}${
        momento.parcial ? ", e nesse dia a medição não pegou o pregão inteiro" : ""
      }`,
    });
  }
  if (risco.ganhoPorQueda !== null) {
    itens.push({
      rotulo: "Ganho para cada R$ 1 da maior queda",
      info: "ganhoPorQueda",
      valor: formatarBRL(risco.ganhoPorQueda),
      detalhe: `o resultado desde o início, ${formatarBRL(risco.resultado, { sinal: true, inteiro: true })}, dividido pela maior queda`,
    });
  }
  if (porOperacao) {
    itens.push({
      rotulo: "Resultado médio por operação",
      info: "resultadoPorOperacao",
      // com centavos, sinal e cor, como no Resumo: é o mesmo número
      valor: <Valor valor={porOperacao.resultado} />,
      detalhe:
        porOperacao.custo > 0
          ? `em ${quantos(porOperacao.operacoes, "operação", "operações")}; o custo considerado é ${formatarBRL(porOperacao.custo)} por operação`
          : `em ${quantos(porOperacao.operacoes, "operação", "operações")}; o histórico não tem custo descontado`,
    });
  }
  return itens;
}
