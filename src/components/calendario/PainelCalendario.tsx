"use client";

import { cn } from "cn";
import { useMemo, useRef, useState } from "react";
import { desempacotar, type OpsEmpacotadas } from "@/components/compartilhados/ops-codec";
import { Valor } from "@/components/compartilhados/Valor";
import { Heatmap } from "@/components/desempenho/Heatmap";
import { escalaDeForca } from "@/components/graficos/base";
import { Grade } from "@/components/sistema/Pagina";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { formatarBRL, formatarDataCurta, formatarNumero } from "@/lib/formato";
import { gradeMes, heatmapAnoMes, mesesComDados } from "@/lib/stats/calendario";
import type { ExposicaoDoDia } from "@/lib/stats/exposicao";
import { dia as diaOp } from "@/lib/stats/operacoes";
import { mesDe, somarMeses } from "@/lib/stats/periodos";
import type { HorarioPregao } from "@/lib/stats/pregao";
import { valorDia } from "@/lib/stats/serie";
import { resumirDias, type DiaResultado } from "@/lib/stats/serie-casa";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import { DiaEscolhido } from "./DiaEscolhido";
import { ListaDeDias } from "./ListaDeDias";
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
  /** o horário que dimensiona o eixo do tempo da série: o do robô, ou o do pregão do ativo */
  horario: HorarioPregao;
}

const fmtMesLongo = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** "Novembro de 2026", por extenso: é o título da tela. */
function nomeDoMes(mes: string): string {
  const texto = fmtMesLongo.format(new Date(`${mes}-01T12:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "+R$" e os algarismos separados, para o número grande levar o sinal e a moeda mais leves (como na página inicial). */
function partesDoValor(v: number): [string, string] {
  const texto = formatarBRL(v, { sinal: true, inteiro: true });
  const corte = texto.search(/\d/);
  return corte < 0 ? ["", texto] : [texto.slice(0, corte).trim(), texto.slice(corte)];
}

// Anterior, próximo, hoje: texto com fio embaixo, o mesmo desenho do "Ver os 10" das listas desta tela (toda
// ação em texto leva o fio; eram dois botões de seta e um "Hoje" com borda). Sem para onde ir, o fio some.
const NAVEGAR = cn(
  LINK_DO_PAINEL,
  "outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:border-transparent disabled:text-sutil/60",
);

/**
 * A aba "Dia a dia" do robô (ficha Mesa, 25/11/2026). A pergunta da tela: como foi cada dia, e quais foram
 * os dias bons e os ruins? A resposta, na ordem: o resultado do mês em vista em número grande, com os dias
 * com ganho, o melhor e o pior dia ao lado; o mês em casas, um dia por casa; do lado direito, o dia escolhido
 * por dentro. Depois, os melhores e os piores dias do histórico e o mapa de todos os meses.
 *
 * O que saiu, porque o Lucas mandou tirar o que não era necessário ("a estrutura da página está ok, mas a
 * página não está legal"):
 * - os cartões com borda e as fileiras de números centralizados, com o rótulo embaixo;
 * - a linha de fatos do histórico no alto (melhor e pior dia de sempre): são a primeira linha das listas;
 * - o "% do capital" debaixo do resultado do mês: pedia explicar capital de referência a quem veio ver os dias;
 * - o fundo colorido de cada dia e o "N op" dentro da casa (ver MesEmGrade);
 * - "Por hora de entrada", do dia, e "Por dia da semana", do histórico: a curva do dia já mostra as horas, e
 *   o resultado por dia da semana e por horário continua na aba Desempenho, para o período que se escolher;
 * - as barras debaixo de cada melhor e pior dia.
 * Os números são os mesmos, das mesmas funções; o resumo do mês passou a vir de resumirDias (serie-casa).
 *
 * O que continua valendo das passadas anteriores:
 * - 17/09/2026: o calendário abre com o último pregão do mês já escolhido, e do tablet para baixo, onde o dia
 *   fica embaixo do mês, escolher um dia rola a página até ele (tocar num dia não mostrava nada);
 * - 19/09/2026 (Artur: "muito esticada e tem um monte de espaço vazio"): as casas do mês têm altura fixa e
 *   baixa. A curva do dia deixou de esticar para fechar a coluna: sem cartão, não há borda para alinhar.
 */
export function PainelCalendario({ linhas, pacote, exposicao, feriados, hoje, valorPonto, custoPorContrato, slug, nomeRobo, contaDemo, temColetor, horario }: Props) {
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

  const grade = useMemo(() => gradeMes(linhas, mes, opcoes, feriados), [linhas, mes, opcoes, feriados]);
  // de segunda a sexta; a semana que só tem sábado ou domingo no mês (mês que começa num sábado, ou que
  // termina num domingo) virava uma fileira inteira vazia
  const semanasUteis = useMemo(
    () => grade.semanas.map((s) => s.slice(1, 6)).filter((s) => s.some((d) => !d.foraDoMes)),
    [grade],
  );

  // cada pregão do histórico: o resultado (1 contrato, já descontados os custos), as operações e as com ganho
  const dias = useMemo<DiaResultado[]>(
    () => linhas.map((l) => ({ dia: l.dia, valor: valorDia(l, opcoes), n: l.n_operacoes, g: l.n_gain })),
    [linhas, opcoes],
  );
  // o mês em vista em números: total, dias com ganho, melhor e pior dia
  const resumo = useMemo(() => resumirDias(dias.filter((d) => mesDe(d.dia) === mes)), [dias, mes]);
  // a régua da barra de cada dia é o histórico inteiro, para um mês poder ser comparado com outro
  const forca = useMemo(() => escalaDeForca(dias.map((d) => d.valor)), [dias]);
  const melhores = useMemo(() => [...dias].sort((a, b) => b.valor - a.valor).slice(0, 10), [dias]);
  const piores = useMemo(() => [...dias].sort((a, b) => a.valor - b.valor).slice(0, 10), [dias]);
  const heatmap = useMemo(() => heatmapAnoMes(linhas, opcoes), [linhas, opcoes]);

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

  if (linhas.length === 0) {
    return <p className="py-12 text-sm text-muted-foreground">Este robô ainda não tem operação fechada.</p>;
  }

  const titulo = nomeDoMes(mes);
  const [prefixo, algarismos] = partesDoValor(resumo.total);
  const abrirDaLista = (d: string) => {
    trocarMes(mesDe(d));
    escolherDia(d, true);
  };

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
            <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-8 gap-y-2">
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

            {resumo.pregoes > 0 ? (
              <div className="mt-3 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,auto)_minmax(0,20rem)] lg:items-end lg:justify-start">
                <div className="min-w-0">
                  <p className={cn("numero-grande", resumo.total < 0 && "text-negativo")}>
                    <span className={cn("mr-[0.18em] font-normal", resumo.total >= 0 && "text-muted-foreground")}>{prefixo}</span>
                    {algarismos}
                  </p>
                  <p className="mt-3 text-sm text-pretty text-muted-foreground">
                    com 1 contrato, já descontados os custos{mes === mesAtual ? " · mês em andamento" : ""}
                  </p>
                </div>

                <dl className="text-sm lg:pb-0.5">
                  <div className="flex items-baseline justify-between gap-4 leading-7">
                    <dt className="text-muted-foreground">Dias com ganho</dt>
                    <dd className="whitespace-nowrap">
                      <span className="font-medium">{formatarNumero(resumo.comGanho)}</span>
                      <span className="text-muted-foreground"> de {formatarNumero(resumo.pregoes)}</span>
                    </dd>
                  </div>
                  {resumo.melhor && resumo.melhor.valor > 0 ? (
                    <div className="flex items-baseline justify-between gap-4 leading-7">
                      <dt className="text-muted-foreground">Melhor dia</dt>
                      <dd className="whitespace-nowrap">
                        <span className="mr-3 text-sutil">{formatarDataCurta(resumo.melhor.dia)}</span>
                        <Valor valor={resumo.melhor.valor} inteiro={Math.abs(resumo.melhor.valor) >= 1000} className="font-medium" />
                      </dd>
                    </div>
                  ) : null}
                  {/* tela que mostra ganho mostra o pior caso: a linha fica mesmo sem dia de perda no mês */}
                  <div className="flex items-baseline justify-between gap-4 leading-7">
                    <dt className="text-muted-foreground">Pior dia</dt>
                    <dd className="whitespace-nowrap">
                      {resumo.pior && resumo.pior.valor < 0 ? (
                        <>
                          <span className="mr-3 text-sutil">{formatarDataCurta(resumo.pior.dia)}</span>
                          <Valor valor={resumo.pior.valor} inteiro={Math.abs(resumo.pior.valor) >= 1000} className="font-medium" />
                        </>
                      ) : (
                        <span className="text-sutil">nenhum com perda</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              // mês sem operação: uma frase, não uma fileira de zeros
              <p className="mt-3 text-sm text-muted-foreground">O robô não operou neste mês.</p>
            )}

            <div className="mt-8">
              <MesEmGrade semanas={semanasUteis} nomeDoMes={titulo} escolhido={diaSel} hoje={hoje} forca={forca} aoEscolher={escolherDia} />
            </div>
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

      {/* os dias bons e os ruins do histórico inteiro: escolher um leva o calendário até ele */}
      <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
        <ListaDeDias id="melhores-dias" titulo="Melhores dias" itens={melhores} aoEscolher={abrirDaLista} />
        <ListaDeDias id="piores-dias" titulo="Piores dias" itens={piores} aoEscolher={abrirDaLista} />
      </div>

      {/* o mapa de todos os meses mora nesta aba desde 19/09/2026, quando saiu do Desempenho */}
      <Painel id="mes-a-mes" titulo="Mês a mês">
        <Heatmap linhas={heatmap} unidade="brl" />
      </Painel>
    </>
  );
}
