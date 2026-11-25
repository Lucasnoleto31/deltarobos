"use client";

import { cn } from "cn";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { ListaKpi, type ItemKpi } from "@/components/desempenho/CardsKpi";
import type { PeriodoPainel } from "@/components/robo/ops-por-periodo";
import { VAZIO_DO_PERIODO } from "@/components/robo/periodos-resumo";
import { Fato, Fatos } from "@/components/sistema/Numero";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { formatarBRL, formatarNumero, formatarPct } from "@/lib/formato";
import { DIAS_UTEIS, HORAS, LOTE_POR_CLASSE, ROTULO_CLASSE, type ClasseFaixa, type Faixa, type ResultadoFaixas } from "@/lib/stats/faixas";

interface Props {
  /** validarFaixas de cada período, calculado na página (18/09/2026: as operações não vêm mais) */
  resultados: Record<PeriodoPainel, ResultadoFaixas>;
}

type Filtro = "todos" | ClasseFaixa;

const OPCOES_PERIODO: ReadonlyArray<{ valor: PeriodoPainel; rotulo: string }> = [
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "tudo", rotulo: "Tudo" },
];
const QUANDO: Record<PeriodoPainel, string> = { mes: "neste mês", ano: "neste ano", tudo: "desde o início" };

const CLASSES: ClasseFaixa[] = ["ligar", "cautela", "neutro", "evitar"];
const ORDEM: Record<ClasseFaixa, number> = { ligar: 0, cautela: 1, neutro: 2, evitar: 3 };

// O quadro do mapa é chapado na cor da classe, a 30%, e o texto é a cor do texto da página: sem borda e sem
// texto tingido (ficha Mesa, 25/11/2026). A classe vai escrita em todo quadro, então a cor não é a única
// pista. Sobre os quatro fundos o texto fica acima de 8:1 nos dois temas (calculado com os tokens, o pior é
// o Ligar no escuro, 8,7:1); até 19/09/2026 o vermelho puro sobre o fundo de Evitar media 4,4:1.
const FUNDO: Record<ClasseFaixa, string> = {
  ligar: "bg-positivo/30",
  cautela: "bg-alerta/30",
  neutro: "bg-foreground/10",
  evitar: "bg-negativo/30",
};

// o que a classe quer dizer, em uma linha curta (cabe numa linha no celular); os números da regra ficam no
// fim da tela, em "Como a classificação é feita"
const SIGNIFICADO: Record<ClasseFaixa, string> = {
  ligar: "passou em todos os critérios",
  cautela: "passou em parte dos critérios",
  neutro: "abaixo do mínimo de Cautela",
  evitar: "caiu em um dos limites para não operar",
};

const DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// quantas linhas a tabela abre; o resto fica a um toque
const LINHAS_DA_TABELA = 10;

// A altura de cada linha do mapa acompanha a janela, para o número, os fatos e o mapa inteiro caberem na
// primeira tela em 1440 × 900 e em 1920 × 1080; nunca menos que 36 px, que ainda é um alvo de toque.
const ALTURA_DO_QUADRO = "h-[clamp(2.25rem,calc((100dvh_-_35rem)/10),3rem)]";

const chaveFaixa = (f: Pick<Faixa, "diaSemana" | "hora">) => `${f.diaSemana}-${f.hora}`;
const nomeDoHorario = (f: Pick<Faixa, "diaSemana" | "hora">) => `${DIA[f.diaSemana]} às ${f.hora}h`;
const pct = (v: number) => formatarPct(v, 0);
/** "4 vezes", "1,5 vez" */
const vezes = (v: number) => `${formatarNumero(v, Number.isInteger(v) ? 0 : 1)} ${v < 2 ? "vez" : "vezes"}`;

/**
 * Aba "Melhores horários" (ficha Mesa, 25/11/2026). Responde a uma pergunta: em que dia da semana e em que
 * horário o robô vai melhor, e quando é melhor não operar.
 *
 * - A resposta vem em palavras, no lugar do número grande: "Quinta às 9h", o dia e horário de entrada com a
 *   maior nota entre os classificados como Ligar. Embaixo, a classe dele e a premissa; ao lado, os fatos
 *   (operações e acertos, resultado, maior queda e o tamanho sugerido da posição).
 * - O mapa de dia da semana por hora de entrada é o gráfico da tela, na largura toda: um quadro por dia e
 *   horário, chapado na cor da classe, com a classe escrita. O mapa é o controle: passar o ponteiro, focar
 *   ou tocar num quadro troca as palavras e os fatos de cima pelos dele; tocar de novo volta ao melhor.
 * - Depois, a tabela de todos os dias e horários classificados, do melhor para o pior, com o filtro por
 *   classe (que também apaga as outras classes no mapa); e, no fim, como a classificação é feita, com os
 *   limites que vêm do banco escritos em palavras.
 *
 * O que saiu: o bloco "Regras" no alto (os limites foram para o fim, em palavras), a barra empilhada da
 * distribuição (a contagem está na lista do fim e o filtro, na tabela), o ranking das cinco melhores com a
 * barra de nota (a tabela já vem em ordem), a caixa de detalhe debaixo do mapa (o detalhe é o topo da tela)
 * e as frases de "O que as regras apontam". Saiu também o "o que é" do glossário em cada rótulo e a frase do
 * motivo, que chega de lib/stats/faixas com símbolos e siglas. O vocabulário mudou junto: "faixa" é "dia e
 * horário", "score" é "nota", "lote sugerido" é "tamanho sugerido da posição" e "drawdown" é "maior queda".
 *
 * Os números continuam vindo de validarFaixas, calculados na página para os três períodos.
 */
export function PainelFaixas({ resultados }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoPainel>("tudo");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  // 19/09/2026: o quadro escolhido fica guardado pelo dia e hora, não pelo objeto: ao trocar o período o
  // detalhe mostrava os números do período anterior. Tocar de novo no mesmo quadro desmarca.
  const [fixada, setFixada] = useState<string | null>(null);
  // o quadro sob o ponteiro ou com o foco do teclado
  const [apontada, setApontada] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  const r = resultados[periodo];

  const porCelula = useMemo(() => {
    const m = new Map<string, Faixa>();
    for (const f of r.faixas) m.set(chaveFaixa(f), f);
    return m;
  }, [r]);

  // as horas do mapa: só as que já tiveram alguma operação. Sai de todo o histórico, para o mapa não mudar
  // de tamanho quando o período muda; hora em que o robô nunca operou não vira uma fileira vazia.
  const horas = useMemo(() => {
    const comOperacao = new Set(resultados.tudo.faixas.filter((f) => f.n > 0).map((f) => f.hora));
    return HORAS.filter((h) => comOperacao.has(h));
  }, [resultados]);

  // a tabela: primeiro a classe (Ligar, Cautela, Neutro, Evitar) e, dentro dela, a nota, com os mesmos
  // desempates do ranking de validarFaixas; assim a primeira linha é o dia e horário do alto da tela
  const ordenadas = useMemo(
    () =>
      [...r.comDados].sort(
        (a, b) =>
          (a.classe ? ORDEM[a.classe] : 9) - (b.classe ? ORDEM[b.classe] : 9) ||
          b.score - a.score ||
          (b.recuperacao ?? Infinity) - (a.recuperacao ?? Infinity) ||
          b.expectativa - a.expectativa,
      ),
    [r],
  );

  if (resultados.tudo.nOperacoes === 0) {
    return <p className="text-sm text-muted-foreground">{VAZIO_DO_PERIODO.tudo}</p>;
  }

  const p = r.parametros;
  const totalComDados = r.comDados.length;
  const brl = (v: number) => formatarBRL(v, { inteiro: Math.abs(v) >= 1000 });

  // quadro sem operação no período não tem o que mostrar: vale o próximo da fila
  const comOperacao = (chave: string | null) => {
    const f = chave ? porCelula.get(chave) : undefined;
    return f && f.n > 0 ? f : null;
  };
  const melhor = r.melhores[0] ?? null;
  const mostrada = comOperacao(apontada) ?? comOperacao(fixada) ?? melhor;
  const chaveMostrada = mostrada ? chaveFaixa(mostrada) : null;
  const ehOMelhor = melhor !== null && chaveMostrada === chaveFaixa(melhor);
  // 19/09/2026: sem nenhum Ligar, validarFaixas devolve os de maior nota entre todos; o título não pode
  // dizer "melhor" nos dois casos
  const titulo = !ehOMelhor ? "Dia e horário" : r.contagem.ligar > 0 ? "Melhor dia e horário" : "Dia e horário com a maior nota";
  const alternar = (chave: string) => setFixada((atual) => (atual === chave ? null : chave));

  // o filtro guardado pode ser de uma classe que o período novo não tem
  const filtroEfetivo: Filtro = filtro !== "todos" && r.contagem[filtro] > 0 ? filtro : "todos";
  const classesPresentes = CLASSES.filter((c) => r.contagem[c] > 0);
  const opcoesDeClasse: { valor: Filtro; rotulo: string }[] = [
    { valor: "todos", rotulo: "Todos" },
    ...classesPresentes.map((c) => ({ valor: c, rotulo: ROTULO_CLASSE[c] })),
  ];
  const linhas = filtroEfetivo === "todos" ? ordenadas : ordenadas.filter((f) => f.classe === filtroEfetivo);
  const visiveis = verTodos ? linhas : linhas.slice(0, LINHAS_DA_TABELA);
  const temTraco = r.faixas.some((f) => f.classe === null && f.n > 0);

  // os limites vêm dos parâmetros do banco; aqui só viram frase. A "recuperação" da regra é o resultado
  // dividido pela maior queda (0,85 é "cobre 85% da queda"); o "DD relativo", a maior queda dividida pela típica.
  const posicao = (c: ClasseFaixa) => pct(LOTE_POR_CLASSE[c]);
  const quantos = (c: ClasseFaixa) => (r.contagem[c] === 0 ? "nenhum" : `${formatarNumero(r.contagem[c])} de ${formatarNumero(totalComDados)}`);
  const criterios: ItemKpi[] = [
    {
      rotulo: ROTULO_CLASSE.ligar,
      valor: quantos("ligar"),
      detalhe: `posição de ${posicao("ligar")}: pelo menos ${pct(p.ligar.acertoMin)} das operações com ganho, o resultado cobre pelo menos ${pct(p.ligar.recuperacaoMin)} da maior queda e ela é de até ${vezes(p.ligar.ddRelativoMax)} a típica`,
    },
    {
      rotulo: ROTULO_CLASSE.cautela,
      valor: quantos("cautela"),
      detalhe: `posição de ${posicao("cautela")}: pelo menos ${pct(p.cautela.acertoMin)} com ganho e o resultado cobre pelo menos ${pct(p.cautela.recuperacaoMin)} da maior queda`,
    },
    {
      rotulo: ROTULO_CLASSE.neutro,
      valor: quantos("neutro"),
      detalhe: `posição de ${posicao("neutro")}: tem operações suficientes, mas fica abaixo do mínimo de Cautela`,
    },
    {
      rotulo: ROTULO_CLASSE.evitar,
      valor: quantos("evitar"),
      detalhe: `posição de ${posicao("evitar")}: menos de ${pct(p.evitar.acertoMax)} com ganho, ou o resultado cobre menos de ${pct(p.evitar.recuperacaoMax)} da maior queda, ou ela passa de ${vezes(p.evitar.ddRelativoMin)} a típica`,
    },
    {
      rotulo: "Maior queda típica",
      valor: brl(r.medianaDd),
      detalhe: "a do meio, pondo em ordem a maior queda de cada dia e horário",
    },
    {
      rotulo: "Nota",
      valor: "0 a 100",
      detalhe: "só põe em ordem: metade pelo ganho por operação comparado aos outros, 30 pontos pela regularidade mês a mês e 20 pela quantidade de operações",
    },
  ];

  return (
    <div className="space-y-10">
      <section aria-labelledby="horarios-titulo">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <h2 id="horarios-titulo" className="text-[0.9375rem] font-normal text-muted-foreground">
            {r.nOperacoes > 0 && totalComDados > 0 ? titulo : "Melhor dia e horário"}
          </h2>
          <Segmentado ariaLabel="Período" opcoes={OPCOES_PERIODO} valor={periodo} onChange={setPeriodo} />
        </div>

        {r.nOperacoes === 0 ? (
          <p className="py-12 text-sm text-muted-foreground">{VAZIO_DO_PERIODO[periodo]}</p>
        ) : totalComDados === 0 || !mostrada ? (
          // nenhum quadro com amostra: a tela diz isso uma vez, em palavras, em vez de um mapa de traços
          <p className="max-w-3xl py-12 text-sm text-pretty text-muted-foreground">
            Ainda é pouco para dizer qual é o melhor dia e horário: {r.nOperacoes === 1 ? "há 1 operação" : `são ${formatarNumero(r.nOperacoes)} operações`}{" "}
            {QUANDO[periodo]}, e nenhum dia e horário chegou a {formatarNumero(p.amostraMinima)}.
          </p>
        ) : (
          <>
            {/* lado a lado só a partir de xl: entre 1024 e 1280 px a coluna das palavras ficaria espremida */}
            <div className="mt-3 grid gap-x-16 gap-y-6 xl:grid-cols-[minmax(0,auto)_minmax(0,24rem)] xl:items-end xl:justify-start">
              <div className="min-w-0">
                {/* o "às" mais leve, como o "+R$" do número grande das outras telas */}
                <p className="numero-grande">
                  {DIA[mostrada.diaSemana]} <span className="font-normal text-muted-foreground">às</span> {mostrada.hora}h
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {mostrada.classe ? (
                    <>
                      <span className="font-medium text-foreground">{ROTULO_CLASSE[mostrada.classe]}</span> · {SIGNIFICADO[mostrada.classe]}
                    </>
                  ) : (
                    `poucas operações para avaliar: ${formatarNumero(mostrada.n)}, e o mínimo é ${formatarNumero(p.amostraMinima)}`
                  )}
                </p>
                <p className="text-sm text-pretty text-sutil">
                  pelo horário em que cada operação começou · {formatarNumero(r.nOperacoes)} operações {QUANDO[periodo]}, com 1 contrato, já
                  descontados os custos
                </p>
              </div>

              {/* a altura de quatro fatos fica reservada: quadro sem classe tem três, e o mapa não pula */}
              <Fatos className="max-w-[24rem] xl:min-h-28 xl:pb-0.5">
                <Fato rotulo="Operações">
                  <span className="font-medium">{formatarNumero(mostrada.n)}</span>
                  <span className="text-muted-foreground"> · {pct(mostrada.acerto)} com ganho</span>
                </Fato>
                <Fato rotulo="Resultado">
                  <Valor valor={mostrada.total} inteiro={Math.abs(mostrada.total) >= 1000} className="font-medium" />
                </Fato>
                <Fato rotulo="Maior queda">
                  {mostrada.dd > 0 ? (
                    <Valor valor={-mostrada.dd} inteiro={mostrada.dd >= 1000} className="font-medium" />
                  ) : (
                    <span className="text-sutil">nenhuma</span>
                  )}
                </Fato>
                {mostrada.classe ? (
                  <Fato rotulo="Tamanho sugerido da posição">
                    <span className="font-medium">{pct(mostrada.lote)}</span>
                  </Fato>
                ) : null}
              </Fatos>
            </div>

            {/* O mapa. Cabe em 375 px sem rolar de lado (o de antes tinha largura mínima de 640 px e rolava):
                cinco colunas iguais e o dia abreviado no celular. A margem negativa desfaz o vão de fora da
                tabela, para os quadros alinharem com o resto da tela. */}
            <div className="mt-8" onPointerLeave={() => setApontada(null)}>
              <div className="-mx-[2px]">
                <table className="w-full table-fixed border-separate border-spacing-[2px]">
                  <caption className="sr-only">Mapa dos dias e horários, pela hora de entrada das operações</caption>
                  <thead>
                    <tr>
                      <th className="w-9 sm:w-12" />
                      {DIAS_UTEIS.map((d) => (
                        <th key={d} scope="col" className="h-7 px-1.5 text-left text-[0.8125rem] font-normal text-sutil sm:px-3">
                          <span className="sm:hidden">{DIA_CURTO[d]}</span>
                          <span className="max-sm:hidden">{DIA[d]}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {horas.map((h) => (
                      <tr key={h}>
                        <th scope="row" className="text-left text-[0.8125rem] font-normal whitespace-nowrap text-sutil">
                          {h}h
                        </th>
                        {DIAS_UTEIS.map((d) => {
                          const f = porCelula.get(`${d}-${h}`);
                          // sem operação nenhuma no período: o lugar fica vazio, sem botão
                          if (!f || f.n === 0) return <td key={d} />;
                          const chave = chaveFaixa(f);
                          const apagada = filtroEfetivo !== "todos" && f.classe !== filtroEfetivo;
                          return (
                            <td key={d} className="p-0">
                              <button
                                type="button"
                                onPointerEnter={(e) => {
                                  // no toque não há "passar por cima": o toque fixa o quadro
                                  if (e.pointerType === "mouse") setApontada(chave);
                                }}
                                onFocus={() => setApontada(chave)}
                                onBlur={() => setApontada(null)}
                                onClick={() => alternar(chave)}
                                aria-pressed={fixada === chave}
                                aria-label={`${nomeDoHorario(f)}: ${f.classe ? ROTULO_CLASSE[f.classe] : "poucas operações para avaliar"}`}
                                className={cn(
                                  "flex w-full items-center overflow-hidden rounded-[3px] px-1.5 text-left text-xs font-medium whitespace-nowrap transition-opacity sm:px-3 sm:text-sm",
                                  "outline-foreground -outline-offset-2 focus-visible:outline-2",
                                  ALTURA_DO_QUADRO,
                                  f.classe ? FUNDO[f.classe] : "text-sutil",
                                  apagada && "opacity-30",
                                  // o quadro que está no alto da tela leva o contorno na cor do texto
                                  chaveMostrada === chave ? "outline-2" : "outline-0",
                                )}
                              >
                                {f.classe ? ROTULO_CLASSE[f.classe] : "–"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-3 text-[0.8125rem] text-pretty text-sutil">
              Cada quadro é um dia da semana e uma hora de entrada, pelo histórico das operações que começaram ali.
              {temTraco ? ` O traço é onde há menos de ${formatarNumero(p.amostraMinima)} operações: pouco para avaliar.` : ""}
            </p>
          </>
        )}
      </section>

      {r.nOperacoes > 0 && totalComDados > 0 ? (
        <>
          <Painel
            id="lista"
            titulo="Todos os dias e horários"
            apoio="do melhor para o pior: pela classe e, dentro dela, pela nota"
            acao={
              classesPresentes.length > 1 ? (
                <Segmentado ariaLabel="Classe" opcoes={opcoesDeClasse} valor={filtroEfetivo} onChange={setFiltro} />
              ) : undefined
            }
            fio={false}
            corpo="pt-1"
          >
            <div className="tbl-moldura">
              <table className="tbl [&_td]:h-10">
                <thead>
                  <tr>
                    <th>Dia e horário</th>
                    <th>Classe</th>
                    <th className="num">Operações</th>
                    <th className="num">Acertos</th>
                    <th className="num">Resultado</th>
                    <th className="num">Maior queda</th>
                    <th className="num">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((f) => (
                    <tr key={chaveFaixa(f)}>
                      <td className="font-medium whitespace-nowrap">{nomeDoHorario(f)}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{f.classe ? ROTULO_CLASSE[f.classe] : "–"}</td>
                      <td className="num">{formatarNumero(f.n)}</td>
                      <td className="num">{pct(f.acerto)}</td>
                      {/* sem centavos nas duas colunas de dinheiro, para os valores alinharem */}
                      <td className="num">
                        <Valor valor={f.total} inteiro />
                      </td>
                      <td className="num text-muted-foreground">{f.dd > 0 ? formatarBRL(-f.dd, { sinal: true, inteiro: true }) : "nenhuma"}</td>
                      <td className="num font-medium">{formatarNumero(f.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {linhas.length > LINHAS_DA_TABELA ? (
              <button type="button" onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos} className={cn("mt-4 text-[0.8125rem]", LINK_DO_PAINEL)}>
                {verTodos ? `Ver só os ${LINHAS_DA_TABELA} primeiros` : `Ver os ${formatarNumero(linhas.length)} dias e horários`}
              </button>
            ) : null}
          </Painel>

          <Painel
            id="classificacao"
            titulo="Como a classificação é feita"
            apoio={`só entra dia e horário com ${formatarNumero(p.amostraMinima)} operações ou mais`}
            acao={
              <Link href="/metodologia#faixas" className={LINK_DO_PAINEL}>
                Como a conta é feita
              </Link>
            }
            corpo=""
          >
            <ListaKpi itens={criterios} />
          </Painel>
        </>
      ) : null}
    </div>
  );
}
