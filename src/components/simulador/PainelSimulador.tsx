"use client";

import { cn } from "cn";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GLOSSARIO } from "@/components/compartilhados/glossario";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { Fato, Fatos, NumeroGrande } from "@/components/sistema/Numero";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { formatarBRL, formatarData, formatarDataLonga, formatarMesAno, formatarNumero, formatarPct } from "@/lib/formato";
import {
  MAX_CONTRATOS,
  OPCOES_PERIODO_SIMULADOR,
  capitalMinimoDaCarteira,
  paresQueAndamJuntos,
  simular,
  type PeriodoSimulador,
  type ResultadoSimulacao,
  type RoboSimulador,
} from "@/lib/stats/simulador";
import { CurvaSimulada } from "./CurvaSimulada";
import { GRADE_DO_SIMULADOR, LUGAR_DA_RESPOSTA, LUGAR_DE_MAIS_NUMEROS, LUGAR_DO_CAPITAL, LUGAR_DO_RESULTADO, LUGAR_DOS_ROBOS } from "./grade";
import { Semaforo } from "./Semaforo";
import {
  contratosEmPalavras,
  entradasEmPalavras,
  fraseAndamJuntos,
  historicoCurto,
  historicoEmPalavras,
  intervaloDeDatas,
  minimoEmPalavras,
  minimoSemCapital,
  pregoes,
  premissaDoResultado,
} from "./serie-simulada";
import { inteiroDe, lerCapital, lerUrlSimulador, normalizarContratos, urlSimulador, type EstadoSimulador } from "./simulador-url";

interface Props {
  /** os robôs simuláveis (sem arquivados, com série), na ordem da página */
  robos: RoboSimulador[];
  hoje: string;
  /** o fator da regra publicada do capital mínimo: só para o "o que é" */
  fatorSeguranca: number;
}

// os períodos são os da conta (lib/stats/simulador); só o nome de "tudo" muda, para o de todas as telas
const PERIODOS: ReadonlyArray<{ valor: PeriodoSimulador; rotulo: string }> = OPCOES_PERIODO_SIMULADOR.map((o) =>
  o.valor === "tudo" ? { ...o, rotulo: "Desde o início" } : o,
);

// rótulo de campo e campo, na ficha Mesa: 13 px em cinza, sem caixa alta; borda de fio forte, canto de 6 px
const ROTULO = "text-[0.8125rem] text-sutil";
const CAMPO = "rounded-md border border-(--painel-fio-forte) transition-colors";
// o campo de número sem as setas: no capital elas somam R$ 1 de cada vez
const SEM_SETAS = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const brl = (v: number) => formatarBRL(v, { inteiro: true });
const dias = (n: number) => (n === 1 ? "1 dia" : `${formatarNumero(n)} dias`);

/**
 * Campo de número inteiro que guarda o que está sendo digitado (revisão de 23/09/2026). Controlado só pelo
 * valor confirmado, apagar o "1" para digitar "2" virava 0 na hora, e o único robô saía da simulação no
 * meio da digitação. Aqui o texto bruto fica no campo até o blur ou o Enter; quem decide o que confirmar
 * a cada tecla é `aoDigitar` (só dígitos, a mesma regra da URL), e no blur o campo volta a mostrar o valor
 * confirmado ("02" vira "2", "5000" contratos viram o teto). step 1: capital e contratos são inteiros, e
 * um step de 100 no capital marcava R$ 30.050 como inválido e fazia as setas pular de 100 em 100.
 */
function CampoInteiro({
  valor,
  aoDigitar,
  ...resto
}: { valor: string; aoDigitar: (texto: string) => void } & Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "step">) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="numeric"
      step={1}
      value={rascunho ?? valor}
      onChange={(e) => {
        setRascunho(e.target.value);
        aoDigitar(e.target.value);
      }}
      onBlur={() => setRascunho(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      {...resto}
    />
  );
}

/**
 * O simulador "com o meu capital" (23/09/2026): capital, período e contratos por robô entram, e sai o que
 * o histórico teria feito com eles. Tudo mora na URL (simulador-url), para compartilhar e para os links
 * "Simular com meu capital" chegarem preenchidos. É tudo aritmética no navegador sobre as séries que a
 * página já trouxe: não há carga, não há estado de carregamento. O aviso legal não se repete aqui: o
 * rodapé, logo abaixo, traz o mesmo texto em toda página (decisão de 17/09/2026).
 *
 * A pergunta da tela (DESIGN.md, seção 9): com o meu capital, quanto eu teria ganho e caído? Desde a
 * revisão de 25/11/2026 a tela responde nesta ordem, que é a do código e a do celular:
 * 1. o capital, que a pessoa digita;
 * 2. a resposta: "Cabe", "Apertado" ou "Não cabe", com o capital mínimo dos robôs e contratos escolhidos e
 *    quanto falta. Sem capital digitado, a simulação usa o capital mínimo e a resposta é esse número. Com
 *    algum robô escolhido sem capital mínimo (sem garantia cadastrada ou sem a leitura das entradas abertas),
 *    o robô leva um traço e a resposta diz que não dá para avaliar, e por quê;
 * 3. os robôs e os contratos por entrada de cada um. Debaixo do nome, em texto pequeno, quantas entradas
 *    abertas ao mesmo tempo a conta do capital mínimo considera para ele ("1 contrato" é por entrada, e a
 *    garantia da corretora é por contrato), o capital mínimo dele e, quando o histórico tem menos de 12
 *    meses, o tamanho do histórico. Quando dois robôs escolhidos ganham e perdem nos mesmos dias, a nota
 *    "robôs que andam juntos" diz em quantos pregões;
 * 4. o resultado simulado em número grande, com a premissa (os contratos e os custos, que vêm de lib/premissa:
 *    o robô escolhido sem custo cadastrado é dito pelo nome) e o tamanho do histórico embaixo e, ao lado, a
 *    maior queda (em R$, em % do capital e se já voltou ao topo) e o pior dia; depois a curva, com a maior
 *    queda em vermelho. Passar o ponteiro na curva troca o número pelo acumulado até aquele pregão;
 * 5. "Mais números": meses com ganho, pior mês, dias com perda e quando foi a maior queda.
 *
 * No computador a grade (./grade.ts) tem duas colunas: à esquerda (4 de 12) o que a pessoa informa e os
 * números de apoio (1, 3 e 5); à direita (8) a resposta, o resultado e a curva (2 e 4). No celular é uma
 * coluna só, na ordem acima: o campo de capital e a resposta aparecem sem rolar. Entre o tablet e a tela
 * larga o capital e a resposta ficam à esquerda dos robôs.
 *
 * Saíram em 25/11/2026 (seção 9: percentual de retorno não entra em tela nenhuma): "capital no fim do
 * período" com o resultado em % do capital. O capital também saiu da premissa do resultado, que em R$ não
 * depende dele, e o capital mínimo saiu da lista de fatos: está na resposta. A maior queda em % do capital
 * fica: mede risco.
 */
export function PainelSimulador({ robos, hoje, fatorSeguranca }: Props) {
  const slugs = useMemo(() => robos.map((r) => r.slug), [robos]);
  const sp = useSearchParams();
  const [estado, setEstado] = useState<EstadoSimulador>(() => lerUrlSimulador(sp, slugs));

  // Do estado para a barra: toda mudança escreve a URL na hora, no próprio manipulador, com replaceState
  // nativo (o App Router sincroniza o useSearchParams com ele e não busca RSC a cada dígito do capital).
  // Na hora, e não num efeito, para a barra nunca ficar atrás do estado: é ela que a leitura abaixo confere.
  const atualizar = (mudanca: Partial<EstadoSimulador>) => {
    const novo = { ...estado, ...mudanca };
    setEstado(novo);
    window.history.replaceState(null, "", urlSimulador(novo, slugs));
  };

  // Da barra para o estado (revisão de 23/09/2026: antes o painel só escrevia, e clicar "Simulador" no
  // cabeçalho estando já em /simulador?capital=… era revertido na hora). Quando `sp` muda, confere-se a
  // BARRA, que é síncrona: o `sp` chega depois do replaceState e, com duas teclas seguidas, o antigo
  // chegaria com o estado já adiante e o reverteria. Se a barra diz outra coisa que o estado, foi uma
  // navegação por fora (link da barra lateral ou do rodapé, voltar/avançar) e o estado passa a ser o dela. É
  // o padrão de "guardar informação do render anterior" do React, não um efeito (setState síncrono em
  // efeito é proibido pelo lint), e não há laço: a URL que o próprio painel escreve é a forma canônica do
  // estado. Comparações entre formas canônicas (urlSimulador): sp.toString() codifica ":" e ",".
  const [spVisto, setSpVisto] = useState(sp);
  if (sp !== spVisto) {
    setSpVisto(sp);
    const daBarra = lerUrlSimulador(new URLSearchParams(window.location.search), slugs);
    if (urlSimulador(daBarra, slugs) !== urlSimulador(estado, slugs)) setEstado(daBarra);
  }

  // a URL com que se chegou (ou a que uma navegação trouxe) vira a canônica: percent-encoding, valor
  // inválido e parâmetro estranho saem; depois de `atualizar` a barra já é a canônica e nada acontece
  useEffect(() => {
    const alvo = urlSimulador(estado, slugs);
    if (`${window.location.pathname}${window.location.search}` !== alvo) window.history.replaceState(null, "", alvo);
  }, [estado, slugs]);

  const temSelecao = slugs.some((s) => (estado.contratos[s] ?? 0) > 0);
  const minimoDaSelecao = useMemo(() => capitalMinimoDaCarteira(robos, estado.contratos), [robos, estado.contratos]);
  // Sem capital digitado, a simulação usa o capital mínimo da escolha (25/11/2026): a tela abria vazia,
  // pedindo um número antes de mostrar qualquer coisa. A resposta diz que é o mínimo; digitar troca.
  const capitalDoMinimo = estado.capital === null && temSelecao ? lerCapital(minimoDaSelecao.total) : null;
  const capital = estado.capital ?? capitalDoMinimo;
  const resultado = useMemo(
    () => (capital !== null && temSelecao ? simular({ capital, robos, contratos: estado.contratos, periodo: estado.periodo, hoje }) : null),
    [capital, estado.contratos, estado.periodo, temSelecao, robos, hoje],
  );
  // o histórico inteiro de cada par escolhido: não muda com o capital nem com o período
  const pares = useMemo(() => paresQueAndamJuntos(robos, estado.contratos), [robos, estado.contratos]);
  const nomeDe = (slug: string) => robos.find((x) => x.slug === slug)?.nome ?? slug;

  // só dígitos, a regra do codec da URL (inteiroDe): apagou tudo = sem capital; texto que o campo de número
  // deixa passar mas não é inteiro ("30.5", "1e5") não muda nada até ser corrigido
  const digitarCapital = (texto: string) => {
    if (texto.trim() === "") atualizar({ capital: null });
    else if (inteiroDe(texto) !== null) atualizar({ capital: lerCapital(texto) });
  };
  const digitarContratos = (slug: string, texto: string) => {
    const n = inteiroDe(texto);
    if (n !== null) atualizar({ contratos: { ...estado.contratos, [slug]: normalizarContratos(n) } });
  };

  // o que a conta do capital mínimo considera para cada robô escolhido: contratos, entradas abertas e o mínimo dele
  const daSelecao = new Map(minimoDaSelecao.porRobo.map((p) => [p.slug, p]));
  // o custo de cada robô escolhido vem do servidor: decide se a premissa diz "já descontados os custos"
  const escolhidos = minimoDaSelecao.porRobo.map((p) => ({
    nome: nomeDe(p.slug),
    contratos: p.contratos,
    custoPorContrato: robos.find((x) => x.slug === p.slug)?.custoPorContrato ?? null,
  }));
  const semMinimo = minimoDaSelecao.semMinimo.map((slug) => ({
    nome: nomeDe(slug),
    porque: robos.find((x) => x.slug === slug)?.semMinimoPorque ?? "garantia",
  }));
  // "1 contrato por entrada em cada um dos 3 robôs", "2 contratos por entrada no Apollo e 1 no Orion"
  const escolha = contratosEmPalavras(escolhidos, robos.length, true);
  const nota = fraseAndamJuntos(pares.map((p) => ({ ...p, a: nomeDe(p.a), b: nomeDe(p.b) })));
  const comResultado = capital !== null && resultado !== null && resultado.nDias > 0;

  return (
    <div className={GRADE_DO_SIMULADOR}>
      {/* 1. o capital */}
      <label className={cn("block", LUGAR_DO_CAPITAL)}>
        <span className={ROTULO}>Seu capital</span>
        <span className={cn("mt-1.5 flex h-11 items-center gap-2 px-3 focus-within:border-foreground", CAMPO)}>
          <span aria-hidden className="text-muted-foreground">
            R$
          </span>
          <CampoInteiro
            min={0}
            aria-label="Capital em reais"
            placeholder={capitalDoMinimo !== null ? `${formatarNumero(capitalDoMinimo)} (o capital mínimo)` : "em reais, sem centavos"}
            valor={estado.capital === null ? "" : String(estado.capital)}
            aoDigitar={digitarCapital}
            className={cn(
              "h-full min-w-0 flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-sm placeholder:font-normal placeholder:text-sutil",
              SEM_SETAS,
            )}
          />
        </span>
      </label>

      {/* 2. a resposta, colada no capital */}
      <div className={LUGAR_DA_RESPOSTA}>
        {!temSelecao ? (
          <p className="max-w-xl text-pretty text-muted-foreground">Escolha ao menos um robô: ponha 1 contrato ou mais em algum deles.</p>
        ) : capital === null ? (
          <div className="max-w-xl text-pretty text-muted-foreground">
            <p>Informe o seu capital para ver quanto os robôs escolhidos teriam ganho e quanto teriam caído.</p>
            <p className="mt-3 text-sm">{minimoSemCapital(minimoDaSelecao.total, minimoDaSelecao.conhecido, semMinimo)}</p>
          </div>
        ) : !comResultado ? (
          <p className="max-w-xl text-pretty text-muted-foreground">Os robôs escolhidos não operaram neste período.</p>
        ) : (
          <Semaforo
            resultado={resultado}
            capital={capital}
            digitado={estado.capital !== null}
            escolha={escolha}
            robos={robos}
            fatorSeguranca={fatorSeguranca}
          />
        )}
      </div>

      {/* 3. os robôs e os contratos por entrada de cada um */}
      <Painel
        titulo="Robôs"
        acao={<span className="text-sutil">Contratos por entrada</span>}
        corpo=""
        className={LUGAR_DOS_ROBOS}
      >
        <ul>
          {robos.map((r) => {
            const n = estado.contratos[r.slug] ?? 0;
            const escolhido = daSelecao.get(r.slug);
            const curto = historicoCurto(r.dias);
            return (
              <li key={r.slug} className="flex items-center justify-between gap-4 border-b border-(--painel-fio) py-3">
                <div className="min-w-0">
                  <Link
                    href={`/robos/${r.slug}`}
                    className={cn("text-[0.9375rem] font-medium hover:underline", !escolhido && "text-muted-foreground")}
                  >
                    {r.nome}
                  </Link>
                  <p className="text-[0.8125rem] text-pretty text-sutil">
                    {r.ativoNome}
                    {r.contaTipo === "demo" ? (
                      <>
                        {" · "}
                        <span className="text-alerta" title="As estatísticas vêm de uma conta demo">
                          conta demo
                        </span>
                      </>
                    ) : null}
                    {" · "}
                    {escolhido
                      ? // o tamanho do histórico quando é curto, quantas entradas abertas ao mesmo tempo a conta
                        // considera para o robô e o capital mínimo dele com os contratos do campo
                        [
                          curto ? `histórico de ${curto}` : null,
                          entradasEmPalavras({
                            entradas: escolhido.entradas,
                            medidas: r.entradasMedidas,
                            contratos: escolhido.contratos,
                            contratosAbertos: escolhido.contratosAbertos,
                            semMinimoPorque: r.semMinimoPorque,
                          }),
                          // sem o número, um traço e o motivo, como na lista da Visão geral
                          minimoEmPalavras(escolhido.total, r.semMinimoPorque),
                        ]
                          .filter((parte) => parte !== null)
                          .join(" · ")
                      : "fora da simulação"}
                  </p>
                </div>
                <CampoInteiro
                  min={0}
                  max={MAX_CONTRATOS}
                  aria-label={`Contratos por entrada do ${r.nome}`}
                  valor={String(n)}
                  aoDigitar={(texto) => digitarContratos(r.slug, texto)}
                  className={cn(
                    "h-9 w-16 shrink-0 bg-transparent pr-1 pl-2.5 text-sm outline-none focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                    CAMPO,
                  )}
                />
              </li>
            );
          })}
        </ul>
        {/* só aparece com dois robôs escolhidos que ganham e perdem nos mesmos dias, e pregões em comum suficientes */}
        {nota ? (
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
            <span className="font-medium text-foreground">{`${GLOSSARIO.andamJuntos.nome}.`}</span> {nota}
          </p>
        ) : null}
      </Painel>

      {/* 4. o resultado, com a maior queda ao lado, e a curva */}
      {temSelecao && capital !== null ? (
        <section aria-labelledby="resultado-simulado" className={LUGAR_DO_RESULTADO}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 sm:pr-20">
            <h2 id="resultado-simulado" className="text-[0.9375rem] font-normal text-muted-foreground">
              Resultado simulado
            </h2>
            {/* o período fica alinhado à borda direita da curva, como em toda tela */}
            <Segmentado ariaLabel="Período" opcoes={PERIODOS} valor={estado.periodo} onChange={(periodo) => atualizar({ periodo })} />
          </div>
          {comResultado ? (
            <Resultado
              r={resultado}
              digitado={estado.capital !== null}
              premissa={premissaDoResultado(
                escolha,
                escolhidos,
                historicoEmPalavras(estado.periodo, resultado.serie[0].dia, resultado.serie[resultado.serie.length - 1].dia, resultado.nDias, hoje),
              )}
            />
          ) : null}
        </section>
      ) : null}

      {/* 5. mais números */}
      {comResultado ? <MaisNumeros r={resultado} className={LUGAR_DE_MAIS_NUMEROS} /> : null}
    </div>
  );
}

/** O número grande com a premissa, os fatos da maior queda colados nele e a curva. */
function Resultado({ r, digitado, premissa }: { r: ResultadoSimulacao; digitado: boolean; premissa: string }) {
  const [apontado, setApontado] = useState<number | null>(null);
  // o índice apontado pode ter ficado de uma série mais longa (troca de período ou de contratos)
  const lido = apontado !== null ? (r.serie[apontado] ?? null) : null;
  const dd = r.drawdown;

  return (
    <>
      {/* o número e, colados nele, os fatos; quando não cabem lado a lado, os fatos descem */}
      <div className="mt-3 flex flex-wrap items-end gap-x-12 gap-y-6">
        <div className="min-w-[min(18rem,100%)] max-sm:w-full">
          <NumeroGrande valor={lido ? lido.acumulado : r.resultado} />
          {/* A premissa e a leitura do pregão apontado ocupam o mesmo lugar, para a tela não pular ao passar o
              ponteiro. O w-0 com min-w-full faz o texto quebrar na largura do número em vez de alargar a
              coluna e empurrar os fatos para baixo. */}
          <div className="mt-3 grid w-0 min-w-full text-sm text-pretty text-muted-foreground">
            <p className={cn("col-start-1 row-start-1", lido && "invisible")}>{premissa}</p>
            {lido ? (
              <p className="col-start-1 row-start-1">
                até {formatarDataLonga(lido.dia)} · no dia <Valor valor={lido.valor} inteiro={Math.abs(lido.valor) >= 1000} className="font-medium" /> ·
                o capital estaria em {brl(lido.patrimonio)}
              </p>
            ) : null}
          </div>
        </div>

        {/* tela que mostra ganho mostra o risco: a maior queda vem colada no resultado */}
        <Fatos className="min-w-64 flex-1 sm:max-w-80 lg:pb-0.5">
          <Fato rotulo="Maior queda">
            {r.ddMax > 0 ? <Valor valor={-r.ddMax} inteiro={r.ddMax >= 1000} className="font-medium" /> : <span className="text-sutil">nenhuma</span>}
          </Fato>
          {r.ddMax > 0 ? (
            <Fato rotulo={digitado ? "Em % do seu capital" : "Em % do capital mínimo"}>
              <span className="font-medium">{formatarPct(r.ddMaxPct, 1)}</span>
            </Fato>
          ) : null}
          {r.ddMax > 0 && dd.fundo ? (
            <Fato rotulo="Voltou ao topo">
              <span className="font-medium">{dd.recuperacao ? `em ${dias(dd.diasAteRecuperar ?? 0)}` : "ainda não"}</span>
            </Fato>
          ) : null}
          {r.piorDia && r.piorDia.valor < 0 ? (
            <Fato rotulo="Pior dia">
              <span className="mr-3 text-sutil">{formatarData(r.piorDia.dia)}</span>
              <Valor valor={r.piorDia.valor} inteiro={Math.abs(r.piorDia.valor) >= 1000} className="font-medium" />
            </Fato>
          ) : null}
        </Fatos>
      </div>

      <CurvaSimulada serie={r.serie} drawdown={r.drawdown} ativo={apontado} aoApontar={setApontado} className="mt-7" />
    </>
  );
}

/** Uma linha de "Mais números": o nome e uma linha de apoio à esquerda, o valor à direita, com fio embaixo. */
function Linha({ rotulo, apoio, children }: { rotulo: string; apoio?: string; children: React.ReactNode }) {
  return (
    <div className="flex break-inside-avoid items-baseline justify-between gap-6 border-b border-(--painel-fio) py-2.5">
      <dt className="min-w-0 text-sm">
        {rotulo}
        {apoio ? <span className="block text-[0.8125rem] text-pretty text-sutil">{apoio}</span> : null}
      </dt>
      <dd className="shrink-0 text-sm font-medium whitespace-nowrap">{children}</dd>
    </div>
  );
}

/**
 * O resto dos números da simulação, uma linha cada. Fica debaixo dos robôs em tela larga (a coluna da
 * esquerda é mais curta que a da resposta) e no fim da tela no celular. É o desenho do ListaKpi numa coluna
 * só; o ListaKpi abre duas colunas, que não cabem em 4 das 12.
 */
function MaisNumeros({ r, className }: { r: ResultadoSimulacao; className?: string }) {
  const dd = r.drawdown;
  return (
    <Painel
      titulo="Mais números"
      acao={
        <Link href="/metodologia#simulador" className={LINK_DO_PAINEL}>
          Como é calculado
        </Link>
      }
      corpo=""
      className={className}
    >
      {/* em duas colunas enquanto a tela é uma coluna só e larga; uma só debaixo dos robôs e no celular */}
      <dl className="md:columns-2 md:gap-x-12 xl:columns-1">
        <Linha rotulo={GLOSSARIO.mesesComGanho.nome}>
          {formatarNumero(r.mesesComGanho)}
          <span className="font-normal text-muted-foreground"> de {formatarNumero(r.meses)}</span>
        </Linha>
        {/* os meses das pontas do período podem estar incompletos: a linha diz quantos pregões entraram */}
        {r.piorMes ? (
          <Linha rotulo={GLOSSARIO.piorMes.nome} apoio={`${formatarMesAno(`${r.piorMes.mes}-01`)} · ${pregoes(r.piorMes.nDias)}`}>
            <Valor valor={r.piorMes.valor} inteiro={Math.abs(r.piorMes.valor) >= 1000} />
          </Linha>
        ) : null}
        <Linha
          rotulo={GLOSSARIO.diasNegativos.nome}
          apoio={r.maiorSequenciaNegativa > 1 ? `a maior sequência foi de ${dias(r.maiorSequenciaNegativa)} seguidos` : undefined}
        >
          {r.diasNegativos === 0 ? "nenhum" : formatarNumero(r.diasNegativos)}
          <span className="font-normal text-muted-foreground"> de {formatarNumero(r.nDias)}</span>
        </Linha>
        {r.ddMax > 0 && dd.inicio && dd.fundo ? <Linha rotulo="Quando foi a maior queda">{intervaloDeDatas(dd.inicio, dd.fundo)}</Linha> : null}
      </dl>
    </Painel>
  );
}
