"use client";

import { cn } from "cn";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { CardsKpi, ListaKpi, type ItemKpi } from "@/components/desempenho/CardsKpi";
import { Badge } from "@/components/ui/badge";
import { formatarBRL, formatarData, formatarMesAno, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import {
  MAX_CONTRATOS,
  OPCOES_PERIODO_SIMULADOR,
  capitalMinimoDaCarteira,
  simular,
  type ResultadoSimulacao,
  type RoboSimulador,
} from "@/lib/stats/simulador";
import { CurvaSimulada } from "./CurvaSimulada";
import { Semaforo } from "./Semaforo";
import { inteiroDe, lerCapital, lerUrlSimulador, normalizarContratos, urlSimulador, type EstadoSimulador } from "./simulador-url";

interface Props {
  /** os robôs simuláveis (sem arquivados, com série), na ordem da página */
  robos: RoboSimulador[];
  hoje: string;
  /** o fator da regra publicada do capital mínimo: só para o texto de apoio */
  fatorSeguranca: number;
}

// os rótulos e os campos são os da barra de filtros do Desempenho (Filtros.tsx)
const ROTULO = "text-[11px] font-medium tracking-wide text-muted-foreground uppercase";
const CAMPO = "rounded-lg border bg-background tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const brl = (v: number) => formatarBRL(v, { inteiro: true });
const dias = (n: number) => (n === 1 ? "1 dia" : `${formatarNumero(n)} dias`);
const pregoes = (n: number) => (n === 1 ? "1 pregão" : `${formatarNumero(n)} pregões`);

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="painel px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

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

/** O capital mínimo da seleção antes de o capital ser digitado: a referência para digitar. */
function fraseDoMinimo(minimo: ReturnType<typeof capitalMinimoDaCarteira>, nomeDe: (slug: string) => string): string {
  const nomes = minimo.semMinimo.map(nomeDe).join(", ");
  if (minimo.total !== null) return minimo.total > 0 ? ` Capital mínimo publicado para esses robôs e contratos: ${brl(minimo.total)}.` : "";
  if (minimo.conhecido > 0) {
    return ` Capital mínimo publicado para esses robôs e contratos: ao menos ${brl(minimo.conhecido)} (sem capital mínimo configurado: ${nomes}).`;
  }
  return ` Capital mínimo não configurado para ${nomes}.`;
}

/**
 * O simulador "com o meu capital" (23/09/2026): capital, período e contratos por robô entram, e sai o que
 * o histórico teria feito com eles: resultado, drawdown, pior mês, pior dia, sequência negativa, capital
 * mínimo publicado e o semáforo. Tudo mora na URL (simulador-url), para compartilhar e para os links
 * "Simular com meu capital" chegarem preenchidos. É tudo aritmética no navegador sobre as séries que a
 * página já trouxe: não há carga, não há estado de carregamento. O aviso legal não se repete aqui: o
 * rodapé, logo abaixo, traz o mesmo texto em toda página (decisão de 17/09/2026, robo/Disclaimer.tsx).
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
  // navegação por fora (link do cabeçalho ou do rodapé, voltar/avançar) e o estado passa a ser o dela. É
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
  const resultado = useMemo(
    () =>
      estado.capital !== null && temSelecao
        ? simular({ capital: estado.capital, robos, contratos: estado.contratos, periodo: estado.periodo, hoje })
        : null,
    [estado.capital, estado.contratos, estado.periodo, temSelecao, robos, hoje],
  );
  // o capital mínimo da seleção aparece antes de o capital ser digitado: é a referência para digitar
  const minimoDaSelecao = useMemo(() => capitalMinimoDaCarteira(robos, estado.contratos), [robos, estado.contratos]);
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

  const capital = estado.capital;

  return (
    <div className="space-y-6">
      <section aria-label="Entradas da simulação" className="painel space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="space-y-1.5">
            <p className={ROTULO}>Capital</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">R$</span>
              <CampoInteiro
                min={0}
                aria-label="Capital em reais"
                valor={capital === null ? "" : String(capital)}
                aoDigitar={digitarCapital}
                className={cn("h-9 w-40 px-3 text-sm", CAMPO)}
              />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {capital !== null ? `${brl(capital)} de capital inicial` : "em reais, sem centavos"}
            </p>
          </div>
          <div className="max-w-full min-w-0 space-y-1.5">
            <p className={ROTULO}>Período</p>
            <Segmentado
              ariaLabel="Período"
              opcoes={OPCOES_PERIODO_SIMULADOR}
              valor={estado.periodo}
              onChange={(periodo) => atualizar({ periodo })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className={ROTULO}>Robôs e contratos</p>
          <ul className="divide-y">
            {robos.map((r) => {
              const n = estado.contratos[r.slug] ?? 0;
              const fora = n === 0;
              return (
                <li key={r.slug} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5", fora && "opacity-70")}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                      <Link href={`/robos/${r.slug}`} className="hover:underline">
                        {r.nome}
                      </Link>
                      <span className="text-xs font-normal text-muted-foreground">
                        {r.ativoNome} · {r.ativo}
                      </span>
                      {r.contaTipo === "demo" ? (
                        <Badge variant="outline" className="border-alerta/50 text-alerta" title="As estatísticas vêm de uma conta demo">
                          Conta demo
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {r.capitalMinimoPorContrato !== null
                        ? `${brl(r.capitalMinimoPorContrato)} mín. por contrato (todo o histórico)`
                        : "capital mínimo não configurado"}
                      {fora ? " · fora da simulação" : ""}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    contratos
                    <CampoInteiro
                      min={0}
                      max={MAX_CONTRATOS}
                      aria-label={`Contratos do ${r.nome}`}
                      valor={String(n)}
                      aoDigitar={(texto) => digitarContratos(r.slug, texto)}
                      className={cn("h-8 w-20 px-2 text-xs text-foreground", CAMPO)}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">0 tira o robô da simulação. Tudo por contrato, líquido de custos.</p>
        </div>
      </section>

      {capital === null ? (
        <Vazio>
          Informe o capital para simular.
          {temSelecao ? fraseDoMinimo(minimoDaSelecao, nomeDe) : ""}
        </Vazio>
      ) : !temSelecao ? (
        <Vazio>Escolha ao menos um robô (contratos acima de 0).</Vazio>
      ) : resultado === null || resultado.nDias === 0 ? (
        <Vazio>Sem pregões no período.</Vazio>
      ) : (
        <Resultados resultado={resultado} capital={capital} robos={robos} fatorSeguranca={fatorSeguranca} />
      )}
    </div>
  );
}

function Resultados({
  resultado: r,
  capital,
  robos,
  fatorSeguranca,
}: {
  resultado: ResultadoSimulacao;
  capital: number;
  robos: RoboSimulador[];
  fatorSeguranca: number;
}) {
  const nomeDe = (slug: string) => robos.find((x) => x.slug === slug)?.nome ?? slug;
  const dd = r.drawdown;

  // os "o que é" do glossário falam de um robô; aqui os números são da carteira simulada (infoTexto)
  const cards: ItemKpi[] = [
    {
      rotulo: "Resultado do período",
      info: "resultadoPeriodo",
      infoTexto: "Soma do resultado diário dos robôs escolhidos, cada um vezes os seus contratos, no período simulado, já com custos.",
      valor: <Valor valor={r.resultado} inteiro={Math.abs(r.resultado) >= 1000} />,
      detalhe: `${formatarPct(r.resultadoPct, 1)} do capital inicial`,
    },
    {
      // as datas e a recuperação ficam aqui, no mesmo cartão do número (23/09/2026: a lista repetia o valor)
      rotulo: "Drawdown máximo",
      info: "drawdownPct",
      infoTexto:
        "A maior queda do patrimônio simulado, de um topo até o fundo seguinte, em reais e em porcentagem do capital inicial informado, com o início, o fundo e o tempo até recuperar.",
      valor: <Valor valor={-r.ddMax} inteiro />,
      detalhe: (
        <>
          <span className="block">{formatarPct(r.ddMaxPct, 1)} do capital inicial</span>
          {r.ddMax > 0 && dd.inicio && dd.fundo ? (
            <span className="block">
              de {formatarData(dd.inicio)} a {formatarData(dd.fundo)}
              {dd.recuperacao ? `, recuperado em ${dias(dd.diasAteRecuperar ?? 0)}` : ", em recuperação"}
            </span>
          ) : null}
        </>
      ),
    },
    {
      rotulo: "Pior mês",
      info: "resultadoMensal",
      infoTexto:
        "O mês de menor resultado da carteira simulada no período, já com custos. Os meses das pontas do período podem estar incompletos: o apoio diz quantos pregões entraram.",
      valor: r.piorMes ? <Valor valor={r.piorMes.valor} inteiro={Math.abs(r.piorMes.valor) >= 1000} /> : "–",
      detalhe: r.piorMes ? `${formatarMesAno(`${r.piorMes.mes}-01`)} · ${pregoes(r.piorMes.nDias)}` : undefined,
    },
    {
      rotulo: "Maior sequência negativa",
      info: "sequenciaDiasNegativos",
      infoTexto: "Maior número de pregões seguidos em que a carteira simulada fechou no negativo; um dia zerado ou positivo interrompe a contagem.",
      valor: dias(r.maiorSequenciaNegativa),
      detalhe: `${formatarNumero(r.diasNegativos)} de ${formatarNumero(r.nDias)} pregões negativos`,
    },
  ];

  const lista: ItemKpi[] = [
    {
      rotulo: "Capital mínimo",
      info: "capitalMinimo",
      infoTexto:
        "Soma, por robô, de contratos vezes o capital mínimo por contrato publicado na aba Risco: margem de referência mais o drawdown máximo de todo o histórico com a folga de segurança. Robô sem margem configurada fica fora da soma, que vira um piso.",
      // sem o total (algum robô sem margem), a parte conhecida ainda é um piso: "≥ R$ X", nunca um traço
      valor: r.capitalMinimo !== null ? brl(r.capitalMinimo) : r.capitalMinimoConhecido > 0 ? `≥ ${brl(r.capitalMinimoConhecido)}` : "–",
      detalhe: (
        <>
          {r.capitalMinimoPorRobo.map((c) => (
            <span key={c.slug} className="block">
              {nomeDe(c.slug)} · {formatarNumero(c.contratos)} × {c.porContrato !== null ? brl(c.porContrato) : "não configurado"}
            </span>
          ))}
        </>
      ),
    },
    {
      rotulo: "Patrimônio final",
      valor: brl(capital + r.resultado),
      detalhe: `capital inicial ${brl(capital)}`,
    },
    {
      rotulo: "Pior dia",
      info: "pioresDias",
      infoTexto: "O pregão de menor resultado da carteira simulada no período, já com custos.",
      valor: r.piorDia ? <Valor valor={r.piorDia.valor} inteiro={Math.abs(r.piorDia.valor) >= 1000} /> : "–",
      detalhe: r.piorDia ? formatarData(r.piorDia.dia) : undefined,
    },
    {
      rotulo: "Dias de pregão",
      info: "diasPregao",
      infoTexto:
        "Dias em que ao menos um dos robôs escolhidos operou. Dia sem operação de nenhum deles não entra na conta nem interrompe a sequência negativa; dia em que a soma dá zero interrompe.",
      valor: formatarNumero(r.nDias),
    },
  ];

  return (
    <>
      <Semaforo resultado={r} capital={capital} robos={robos} />
      <CardsKpi itens={cards} className="lg:grid-cols-4" />
      <ListaKpi itens={lista} />

      <section className="painel p-4 sm:p-5">
        <CurvaSimulada serie={r.serie} capital={capital} />
        <p className="mt-2 text-xs text-muted-foreground">
          Patrimônio simulado, dia a dia · linha do zero = capital inicial · drawdown em R$ sobre o capital inicial
        </p>
      </section>

      <footer className="text-xs text-pretty text-muted-foreground">
        <p>
          Capital mínimo pela regra publicada na aba Risco: margem de referência mais o drawdown máximo de todo o histórico, 1
          contrato, vezes {formatarMultiplo(fatorSeguranca, 1)}, no valor inteiro publicado, somado por robô e multiplicado
          pelos contratos. Drawdown em % sempre sobre o capital inicial informado.{" "}
          <Link href="/metodologia#simulador" className="underline underline-offset-4 hover:text-foreground">
            Como é calculado
          </Link>
        </p>
      </footer>
    </>
  );
}
