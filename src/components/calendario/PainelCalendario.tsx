"use client";

import { cn } from "cn";
import { useMemo, useRef, useState } from "react";
import { GLOSSARIO } from "@/components/compartilhados/glossario";
import { desempacotar, type OpsEmpacotadas } from "@/components/compartilhados/ops-codec";
import { Valor } from "@/components/compartilhados/Valor";
import { escalaDeForca } from "@/components/graficos/base";
import { Fato, Fatos, NumeroGrande } from "@/components/sistema/Numero";
import { Grade } from "@/components/sistema/Pagina";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { formatarData, formatarDataCurta, formatarNumero } from "@/lib/formato";
import { premissaDoRobo } from "@/lib/premissa";
import { anosDoHistorico, gradeMes, historicoCurto, janelaConhecida, mesesComDados, resumirPeriodo } from "@/lib/stats/calendario";
import type { ExposicaoDoDia } from "@/lib/stats/exposicao";
import { tempoEmPalavras } from "@/lib/stats/indicadores-robo";
import { dia as diaOp } from "@/lib/stats/operacoes";
import { mesDe, somarMeses } from "@/lib/stats/periodos";
import type { HorarioPregao } from "@/lib/stats/pregao";
import { valorDia } from "@/lib/stats/serie";
import type { DiaResultado } from "@/lib/stats/serie-casa";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import { mesComAno } from "./ArquivosDoMes";
import { DiaEscolhido } from "./DiaEscolhido";
import { ListaDeDias } from "./ListaDeDias";
import { MesAMes } from "./MesAMes";
import { MesEmGrade } from "./MesEmGrade";
import { useSaldoDoDia } from "./useSaldoDoDia";

interface Props {
  linhas: LinhaDiaria[];
  /** as operações empacotadas por ops-codec: 158 KB em vez de 699 KB no HTML (18/09/2026) */
  pacote: OpsEmpacotadas;
  /** MEP/MEN por dia medidos pelo EA 1.1.0 (exposicao_dia_publico), só os dias com medição (22/09/2026) */
  exposicao: ExposicaoDoDia[];
  feriados: string[];
  hoje: string;
  valorPonto: number;
  /** custo por contrato do robô: o líquido do MEP/MEN medido desconta o custo de cada saída até o extremo */
  custoPorContrato: number;
  /** o robô, para pedir a série do saldo do dia escolhido à rota /api/robos/[slug]/saldo/[dia] (23/09/2026) */
  slug: string;
  /** o nome do robô, para o botão Compartilhar do dia escolhido; 24/09/2026 */
  nomeRobo: string;
  /** robô em conta demo: a legenda do compartilhamento diz "Conta demo."; 24/09/2026 */
  contaDemo: boolean;
  /** false = só histórico importado: não há série do EA a pedir */
  temColetor: boolean;
  /**
   * O robô é acompanhado dia a dia (tem coletor e está ativo): aí um pregão sem operação até ontem é "não
   * operou". No robô que só tem histórico, o site não sabe o que houve depois do último dia importado.
   */
  acompanhado: boolean;
  /** o horário que dimensiona o eixo do tempo da série: o do robô, ou o do pregão do ativo */
  horario: HorarioPregao;
}

/** "Novembro de 2026", por extenso: é o título da tela. */
function tituloDoMes(mes: string): string {
  const texto = mesComAno(mes);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Anterior, próximo, hoje: texto com fio embaixo, o mesmo desenho do "Ver os 10" das listas desta tela (toda
// ação em texto leva o fio; eram dois botões de seta e um "Hoje" com borda). Sem para onde ir, o fio some.
// O ::after dá ao texto pequeno um alvo de toque de 40 px sem mexer no desenho.
const NAVEGAR = cn(
  LINK_DO_PAINEL,
  "relative outline-none after:absolute after:-inset-x-2 after:-inset-y-2.5 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:border-transparent disabled:text-sutil/60",
);

/**
 * A aba "Dia a dia" do robô. A pergunta da tela: como foi cada dia e cada mês? A resposta, na ordem: o
 * resultado do mês em vista em número grande, com os dias com ganho, o pior dia e a maior queda do mês ao
 * lado; o mês em casas, um dia por casa; do lado direito, o dia escolhido por dentro. Depois a lista
 * "Mês a mês", com os arquivos de cada mês, e por fim os melhores e os piores dias do histórico.
 *
 * Revisão de 25/11/2026 (DESIGN.md, seção 9; Lucas: "informações que não são importantes vamos tirar,
 * coloque indicadores que fazem sentido para o trader"):
 * - "Melhor dia" saiu dos fatos do mês: não é indicador de destaque e continua na lista "Melhores dias".
 *   No lugar entrou a maior queda de dentro do mês: número de ganho não aparece sem a queda ao lado;
 * - o pregão em que a bolsa abriu e o robô não fechou operação aparece escrito "não operou" na casa do dia
 *   (era uma casa vazia, igual à de um dia que ainda não chegou), e, quando houve algum no mês, os fatos
 *   dizem em quantos pregões ele operou. O motivo o sistema não sabe, e a tela não inventa;
 * - o mapa colorido de meses deu lugar à lista "Mês a mês", que traz os arquivos da antiga aba Relatórios
 *   e leva o calendário até o mês escolhido (ver MesAMes);
 * - as listas de melhores e piores dias dizem o tamanho do histórico quando ele é curto.
 *
 * Da ficha Mesa (25/11/2026) continua valendo: sem cartões, sem "% do capital", sem fundo colorido nas
 * casas, sem "por hora de entrada" e "por dia da semana" (isso mora na aba Melhores horários). Os números
 * vêm de lib/stats (gradeMes, resumirPeriodo, anosDoHistorico): aqui não se faz conta.
 *
 * O que continua valendo das passadas anteriores:
 * - 17/09/2026: o calendário abre com o último pregão do mês já escolhido, e do tablet para baixo, onde o dia
 *   fica embaixo do mês, escolher um dia rola a página até ele (tocar num dia não mostrava nada);
 * - 19/09/2026 (Artur: "muito esticada e tem um monte de espaço vazio"): as casas do mês têm altura fixa e
 *   baixa. A curva do dia deixou de esticar para fechar a coluna: sem cartão, não há borda para alinhar.
 */
export function PainelCalendario({
  linhas,
  pacote,
  exposicao,
  feriados,
  hoje,
  valorPonto,
  custoPorContrato,
  slug,
  nomeRobo,
  contaDemo,
  temColetor,
  acompanhado,
  horario,
}: Props) {
  const ops = useMemo(() => desempacotar(pacote), [pacote]);
  const exposicaoPorDia = useMemo(() => new Map(exposicao.map((e) => [e.dia, e])), [exposicao]);
  const opcoes = useMemo<OpcoesSerie>(() => ({ base: "liquido", unidade: "brl", valorPonto }), [valorPonto]);
  const meses = useMemo(() => mesesComDados(linhas), [linhas]);
  const primeiroMes = meses[0] ?? mesDe(hoje);
  const mesAtual = mesDe(hoje);

  /** o último pregão com operação dentro de um mês: é o dia que a tela abre mostrando */
  const ultimoDiaDe = (m: string): string | null => {
    const doMes = linhas.filter((l) => mesDe(l.dia) === m).map((l) => l.dia);
    return doMes.length > 0 ? doMes.reduce((a, b) => (a > b ? a : b)) : null;
  };

  const mesInicial = meses.includes(mesAtual) ? mesAtual : (meses[meses.length - 1] ?? mesAtual);
  const [mes, setMes] = useState(mesInicial);
  const [diaSel, setDiaSel] = useState<string | null>(() => ultimoDiaDe(mesInicial));
  const topoRef = useRef<HTMLDivElement>(null);
  const diaRef = useRef<HTMLElement>(null);

  const trocarMes = (m: string) => {
    setMes(m);
    setDiaSel(ultimoDiaDe(m));
  };

  /** leva a página até o número do mês (quem escolhe nas listas lá de baixo precisa subir) */
  const subirAoMes = () => {
    if (typeof window === "undefined") return;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => topoRef.current?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" }));
  };

  const escolherDia = (d: string, vindoDaLista = false) => {
    setDiaSel(d);
    if (typeof window === "undefined") return;
    // o mês e o dia ficam lado a lado a partir de 1280 px (a Grade abre no xl); era 1024 px até 25/11/2026
    const empilhado = window.matchMedia("(max-width: 1279px)").matches;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Empilhado, o dia fica embaixo do calendário, fora da tela: a página vai até ele.
    // Lado a lado, só quem vem das listas lá de baixo precisa subir, até o número do mês.
    if (!empilhado && !vindoDaLista) return;
    // o alvo é lido no quadro seguinte: vindo de um mês sem operação, o bloco do dia ainda não está na página
    requestAnimationFrame(() => {
      const alvo = empilhado ? diaRef.current : topoRef.current;
      alvo?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
    });
  };

  // de quando até quando o site sabe dizer se o robô operou: fora disso, dia sem operação não é "não operou"
  const janela = useMemo(
    () =>
      janelaConhecida(
        linhas.map((l) => l.dia),
        hoje,
        acompanhado,
      ),
    [linhas, hoje, acompanhado],
  );
  const grade = useMemo(() => gradeMes(linhas, mes, opcoes, feriados, janela), [linhas, mes, opcoes, feriados, janela]);
  // de segunda a sexta; a semana que só tem sábado ou domingo no mês (mês que começa num sábado, ou que
  // termina num domingo) virava uma fileira inteira vazia
  const semanasUteis = useMemo(
    () => grade.semanas.map((s) => s.slice(1, 6)).filter((s) => s.some((d) => !d.foraDoMes)),
    [grade],
  );

  // cada pregão do histórico: o resultado (1 contrato por entrada, já descontados os custos), as operações e as com ganho
  const dias = useMemo<DiaResultado[]>(
    () => linhas.map((l) => ({ dia: l.dia, valor: valorDia(l, opcoes), n: l.n_operacoes, g: l.n_gain })),
    [linhas, opcoes],
  );
  // o mês em vista em números: total, dias com ganho, pior dia e a maior queda de dentro dele
  const resumo = useMemo(() => resumirPeriodo(dias.filter((d) => mesDe(d.dia) === mes)), [dias, mes]);
  // a régua da barra de cada dia é o histórico inteiro, para um mês poder ser comparado com outro
  const forca = useMemo(() => escalaDeForca(dias.map((d) => d.valor)), [dias]);
  const melhores = useMemo(() => [...dias].sort((a, b) => b.valor - a.valor).slice(0, 10), [dias]);
  const piores = useMemo(() => [...dias].sort((a, b) => a.valor - b.valor).slice(0, 10), [dias]);
  const anos = useMemo(() => anosDoHistorico(dias), [dias]);

  const opsDia = useMemo(() => (diaSel ? ops.filter((op) => diaOp(op) === diaSel) : []), [ops, diaSel]);
  const { saldo, carregando, tentarDeNovo } = useSaldoDoDia(slug, diaSel, temColetor);

  const mesAnterior = mesDe(somarMeses(`${mes}-01`, -1));
  const mesSeguinte = mesDe(somarMeses(`${mes}-01`, 1));
  const podeVoltar = mesAnterior >= primeiroMes;
  const podeAvancar = mesSeguinte <= mesAtual;

  const irHoje = () => {
    setMes(mesAtual);
    setDiaSel(linhas.some((l) => l.dia === hoje) ? hoje : ultimoDiaDe(mesAtual));
  };

  if (linhas.length === 0 || !janela) {
    return <p className="py-12 text-sm text-muted-foreground">Este robô ainda não tem operação fechada.</p>;
  }

  const titulo = tituloDoMes(mes);
  // a regra única de lib/premissa: robô sem custo cadastrado mostra o valor antes dos custos
  const premissa = premissaDoRobo(custoPorContrato);
  // de quanto histórico saem as listas de melhores e piores dias: histórico curto diz o tamanho
  const ultimoDia = linhas.reduce((a, l) => (l.dia > a ? l.dia : a), janela.de);
  const deQuanto = historicoCurto(janela.de, ultimoDia)
    ? `em ${tempoEmPalavras(janela.de, ultimoDia)} de histórico, ${formatarNumero(dias.length)} ${dias.length === 1 ? "pregão" : "pregões"}`
    : "desde o início";

  const abrirDaLista = (d: string) => {
    trocarMes(mesDe(d));
    escolherDia(d, true);
  };
  const abrirMes = (m: string) => {
    trocarMes(m);
    subirAoMes();
  };

  // "Pregões em que operou" só aparece no mês em que houve pregão sem operação. No mês que ainda corre (ou
  // no último do histórico importado) a conta vai até o último dia de que o site tem registro, e o texto diz.
  const pregoesDoMes = grade.nDias + grade.nNaoOperou;
  const explicaPregoes =
    mesDe(janela.ate) === mes
      ? `Em quantos pregões deste mês o robô fechou ao menos uma operação, contra quantos pregões a bolsa teve até ${formatarData(janela.ate)}. O site não sabe o motivo de um pregão sem operação.`
      : `${GLOSSARIO.pregoesOperados.texto} O site não sabe o motivo de um pregão sem operação.`;

  const fatos =
    resumo.dias > 0 ? (
      <Fatos>
        <Fato rotulo="Dias com ganho">
          <span className="font-medium">{formatarNumero(resumo.comGanho)}</span>
          <span className="text-muted-foreground"> de {formatarNumero(resumo.dias)}</span>
        </Fato>
        {/* tela que mostra ganho mostra o pior caso: as duas linhas ficam mesmo sem dia de perda no mês */}
        <Fato rotulo="Pior dia">
          {resumo.pior ? (
            <>
              <span className="mr-3 text-sutil">{formatarDataCurta(resumo.pior.dia)}</span>
              <Valor valor={resumo.pior.valor} inteiro={Math.abs(resumo.pior.valor) >= 1000} className="font-medium" />
            </>
          ) : (
            <span className="text-sutil">nenhum com perda</span>
          )}
        </Fato>
        <Fato rotulo="Maior queda no mês">
          {resumo.maiorQueda > 0 ? (
            <Valor valor={-resumo.maiorQueda} inteiro={resumo.maiorQueda >= 1000} className="font-medium" />
          ) : (
            <span className="text-sutil">nenhuma</span>
          )}
        </Fato>
        {grade.nNaoOperou > 0 ? (
          <Fato rotulo={GLOSSARIO.pregoesOperados.nome} info="pregoesOperados" infoTexto={explicaPregoes}>
            <span className="font-medium">{formatarNumero(grade.nDias)}</span>
            <span className="text-muted-foreground"> de {formatarNumero(pregoesDoMes)}</span>
          </Fato>
        ) : null}
      </Fatos>
    ) : null;

  return (
    <>
      {/* Dois lados (25/11/2026): o mês, com o número grande e as casas, e o dia escolhido, que começa na
          mesma altura do título em vez de debaixo do número: é o que ocupa a metade direita da tela, que
          ficava vazia ao lado dos fatos, e deixa a curva do dia mais perto da primeira tela. Abaixo de 1280 px
          o dia vem embaixo do mês.
          A faixa de abas do robô agora fica presa debaixo da fita (40 px), e o scroll-padding do html só
          desconta a fita: o scroll-mt-12 daqui e do dia escolhido é o que falta para o alvo da rolagem não
          parar debaixo das abas (em 19/09/2026 não havia aba presa, e o scroll-mt somado ao scroll-padding
          deixava um vão de 92 px; por isso tinha saído) */}
      <div ref={topoRef} className="scroll-mt-12">
        <Grade>
          <div className={cn("min-w-0", diaSel ? "xl:col-span-7" : "xl:col-span-12")}>
            {/* o que é o número, e a troca de mês alinhada à borda direita do calendário */}
            <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-8 gap-y-3">
              <h2 className="text-[0.9375rem] font-normal text-muted-foreground" aria-live="polite">
                <span className="font-medium text-foreground">{titulo}</span> · resultado do mês
              </h2>
              <div role="group" aria-label="Trocar de mês" className="flex items-center gap-5 text-[0.8125rem]">
                <button type="button" aria-label="Mês anterior" className={NAVEGAR} disabled={!podeVoltar} onClick={() => trocarMes(mesAnterior)}>
                  Anterior
                </button>
                <button type="button" aria-label="Próximo mês" className={NAVEGAR} disabled={!podeAvancar} onClick={() => trocarMes(mesSeguinte)}>
                  Próximo
                </button>
                <button type="button" aria-label="Ir para o mês de hoje" className={NAVEGAR} onClick={irHoje}>
                  Hoje
                </button>
              </div>
            </div>

            {resumo.dias > 0 ? (
              <div className="mt-3 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,auto)_minmax(0,20rem)] lg:items-end lg:justify-start">
                <div className="min-w-0">
                  <NumeroGrande valor={resumo.total} />
                  <p className="mt-3 text-sm text-pretty text-muted-foreground">
                    {premissa}
                    {mes === mesAtual ? " · mês em andamento" : ""}
                  </p>
                </div>
                {/* no computador os fatos ficam colados no número; no celular descem para depois do mês em casas */}
                <div className="hidden lg:block lg:pb-0.5">{fatos}</div>
              </div>
            ) : (
              // mês sem operação: uma frase, não uma fileira de zeros
              <p className="mt-3 text-sm text-muted-foreground">
                {mes === mesAtual ? "Ainda sem operação fechada neste mês." : "Nenhuma operação fechada neste mês."}
              </p>
            )}

            <div className="mt-8">
              <MesEmGrade semanas={semanasUteis} nomeDoMes={titulo} escolhido={diaSel} hoje={hoje} forca={forca} aoEscolher={escolherDia} />
            </div>

            {fatos ? <div className="mt-6 lg:hidden">{fatos}</div> : null}
          </div>

          {diaSel ? (
            <DiaEscolhido
              ref={diaRef}
              dia={diaSel}
              ops={opsDia}
              opcoes={opcoes}
              exposicao={exposicaoPorDia.get(diaSel)}
              custoPorContrato={custoPorContrato}
              valorPonto={valorPonto}
              horario={horario}
              saldo={saldo}
              carregando={carregando}
              aoTentarDeNovo={tentarDeNovo}
              slug={slug}
              nomeRobo={nomeRobo}
              contaDemo={contaDemo}
              className="scroll-mt-12 xl:col-span-5"
            />
          ) : null}
        </Grade>
      </div>

      {/* cada mês, com os arquivos dele; escolher um leva o calendário até ele */}
      <MesAMes anos={anos} slug={slug} mesEmVista={mes} mesAtual={mesAtual} aoEscolher={abrirMes} className="scroll-mt-12" />

      {/* os dias bons e os ruins do histórico inteiro: escolher um leva o calendário até ele */}
      <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
        <ListaDeDias id="melhores-dias" titulo="Melhores dias" apoio={deQuanto} itens={melhores} aoEscolher={abrirDaLista} />
        <ListaDeDias id="piores-dias" titulo="Piores dias" apoio={deQuanto} itens={piores} aoEscolher={abrirDaLista} />
      </div>
    </>
  );
}
