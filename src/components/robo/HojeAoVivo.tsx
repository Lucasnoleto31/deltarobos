"use client";

import { cn } from "cn";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { HaQuanto } from "@/components/compartilhados/HaQuanto";
import { Valor } from "@/components/compartilhados/Valor";
import { CompartilharDia } from "@/components/compartilhar/CompartilharDia";
import { versaoDoDiaAoVivo } from "@/components/compartilhar/regras-do-compartilhar";
import { versaoDoCard } from "@/components/compartilhar/url-do-card";
import { Fato, Fatos, NumeroGrande } from "@/components/sistema/Numero";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { formatarDataLonga, formatarHora, formatarNumero, formatarPreco, rotuloLado } from "@/lib/formato";
import { fimDoDia } from "@/lib/stats/card-do-dia";
import { mepMenDoDia, type ExposicaoHoje } from "@/lib/stats/exposicao";
import { excursao } from "@/lib/stats/operacoes";
import { normalizarHora } from "@/lib/stats/pregao";
import { ehCorpoSaldoDoDia, horarioDaJanela, type SaldoHoje } from "@/lib/stats/saldo-dia";
import type { OperacaoPublica, PosicaoPublica } from "@/lib/tipos";
import { CurvaDoDia } from "./CurvaDoDia";
import { LinhaOperacao } from "./LinhaOperacao";
import { OperacoesEmAberto } from "./OperacoesEmAberto";
import { usePregaoAberto, useRobo } from "./RoboAoVivoProvider";

/** O último pregão com operação antes de hoje: o que a aba mostra quando hoje ainda não tem nada. */
export interface UltimoPregao {
  /** YYYY-MM-DD */
  dia: string;
  /** as operações desse pregão, em ordem de fechamento */
  operacoes: OperacaoPublica[];
  /** o melhor e o pior momento medidos no MetaTrader 5 nesse dia, quando existem */
  exposicao: ExposicaoHoje | null;
}

interface Props {
  /** nulo quando hoje já tem operação (não é preciso) ou quando o robô nunca operou */
  ultimoPregao: UltimoPregao | null;
}

// Quantas operações aparecem em lista antes do "mostrar as outras". O dia inteiro está na curva
// logo acima; a lista é só o que acabou de acontecer. Num dia de 284 operações a tabela inteira
// tinha 16.600 px no celular (17/09/2026).
const VISIVEIS = 6;
const SEM_POSICOES: PosicaoPublica[] = [];

// o "o que é" do melhor e do pior momento medidos no MetaTrader 5 (22/09/2026); o texto padrão do glossário
// fala das duas fontes, e aqui a fonte é uma só. "Parcial" explica o que falta
const PARCIAL = " Parcial: a medição começou com o dia em andamento e pode ter perdido um ponto anterior.";
const TEXTO_MEP_EA = (parcial: boolean) =>
  `O ponto mais alto que o saldo do dia alcançou, com 1 contrato por entrada e já com custos, medido no MetaTrader 5 a cada movimento do preço, com a posição aberta: o mesmo número do Profit (MEP).${parcial ? PARCIAL : ""}`;
const TEXTO_MEN_EA = (parcial: boolean) =>
  `O ponto mais baixo que o saldo do dia alcançou, com 1 contrato por entrada e já com custos, medido no MetaTrader 5 a cada movimento do preço, com a posição aberta: o quanto o dia chegou a ficar no prejuízo (MEN).${parcial ? PARCIAL : ""}`;

const fmtDiaComSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
/** "segunda-feira, 23 de novembro de 2026" */
const diaComSemana = (dia: string) => fmtDiaComSemana.format(new Date(`${dia}T12:00:00Z`));

/**
 * A série do saldo de um pregão passado, medida no MetaTrader 5, pedida à mesma rota que o calendário usa
 * (/api/robos/[slug]/saldo/[dia]; dia passado fica em cache). Só pede quando há dia; se a rota falhar ou o
 * dia não tiver série, devolve nulo e a curva fica na de operação a operação.
 */
function useSaldoDoPregao(slug: string, dia: string | null): SaldoHoje | null {
  const [carga, setCarga] = useState<{ dia: string; saldo: SaldoHoje } | null>(null);
  useEffect(() => {
    if (!dia) return;
    const controle = new AbortController();
    fetch(`/api/robos/${encodeURIComponent(slug)}/saldo/${dia}`, { signal: controle.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const corpo: unknown = await r.json();
        // o JSON vem de fora: a forma é conferida antes de entrar no estado
        if (!ehCorpoSaldoDoDia(corpo) || corpo.dia !== dia) throw new Error("resposta em formato inesperado");
        setCarga({
          dia,
          saldo: { baldes: corpo.baldes, aproximado: corpo.aproximado, bucketSeg: corpo.bucketSeg, carregado: true, erro: null, atualizadoEm: corpo.geradoEm },
        });
      })
      .catch((e: unknown) => {
        if (controle.signal.aborted) return;
        console.warn(`[ao-vivo] saldo de ${dia}:`, e);
      });
    return () => controle.abort();
  }, [slug, dia]);
  return carga && carga.dia === dia ? carga.saldo : null;
}

/**
 * A aba "Ao vivo" do robô (revisão de 25/11/2026, DESIGN.md seção 9). Responde a uma pergunta: o que ele está
 * fazendo agora? Era o período "Hoje" da visão geral; virou aba, só em robô com coletor.
 *
 * - O número grande é o resultado de hoje, com a premissa embaixo; ao lado, o melhor e o pior momento do dia
 *   (o risco: onde aparece ganho, aparece o pior caso) e a operação aberta, com o resultado dela até aqui.
 * - A curva do dia na largura toda (a medida no MetaTrader 5 quando existe; senão, operação a operação) e,
 *   embaixo, as operações de hoje em linhas com fio, a mais recente em cima.
 * - "Abrir em tela cheia" leva à tela do dia sem o resto do site, para deixar num monitor.
 *
 * Enquanto hoje não tem operação, posição nem curva, a tela não vira uma coleção de zeros: mostra o último
 * pregão com operação, com a data escrita, e diz em palavras o que há de hoje ("hoje ainda sem operação",
 * "fora do pregão agora"). Assim que chega a primeira operação ou posição, volta para hoje sozinha. O robô
 * que nunca operou aparece uma vez, em palavras.
 *
 * O estado ao vivo (operações, posição, medições) vem do RoboAoVivoProvider, que o layout do robô monta; o
 * último pregão vem pronto da página.
 */
export function HojeAoVivo({ ultimoPregao }: Props) {
  const { estado, robo, pregao, hoje } = useRobo();
  const aberto = usePregaoAberto();
  // sem relógio aqui (18/09/2026): o "aberta há …" anda sozinho no HaQuanto e o bloco só
  // renderiza de novo quando chega operação ou posição
  const [todas, setTodas] = useState(false);

  const temSerieHoje = estado.saldoHoje.carregado && estado.saldoHoje.baldes.length > 0;
  const hojeTemDia = estado.operacoes.length > 0 || estado.posicoes.length > 0 || temSerieHoje;
  // o que está na tela: hoje, ou o último pregão enquanto hoje não tem o que mostrar
  const anterior = hojeTemDia ? null : ultimoPregao;
  const saldoAnterior = useSaldoDoPregao(robo.slug, anterior ? anterior.dia : null);

  const dia = anterior ? anterior.dia : hoje;
  const ops = anterior ? anterior.operacoes : estado.operacoes;
  const exposicao = anterior ? anterior.exposicao : estado.exposicaoHoje;
  const saldo = anterior ? saldoAnterior : estado.saldoHoje;
  const posicoes = anterior ? SEM_POSICOES : estado.posicoes;

  const liquidos = useMemo(() => ops.map((o) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato), [ops]);
  const liquido = liquidos.reduce((s, v) => s + v, 0);
  // O melhor e o pior momento do dia, já descontados os custos como o número grande: os medidos no MetaTrader 5
  // a cada movimento do preço (22/09/2026), com a hora; sem medição, os de fechamento em fechamento, a mesma
  // reserva da tela cheia e da imagem do dia
  const momentos = useMemo(() => {
    const ea = mepMenDoDia(exposicao, robo.custo_por_contrato, robo.valor_ponto_brl, "liquido", "brl");
    if (ea) return { melhor: ea.mep, pior: ea.men, melhorEm: ea.mep > 0 ? ea.mepEm : null, piorEm: ea.men < 0 ? ea.menEm : null, medido: true, parcial: ea.parcial };
    if (liquidos.length === 0) return null;
    const e = excursao(liquidos);
    return { melhor: e.mep, pior: e.men, melhorEm: null, piorEm: null, medido: false, parcial: false };
  }, [exposicao, robo.custo_por_contrato, robo.valor_ponto_brl, liquidos]);
  // O eixo do tempo da série é o horário do robô, ou o do pregão do ativo; memoizado porque a CurvaDoDia é
  // memo e compara por referência
  const horario = useMemo(() => horarioDaJanela(robo, pregao), [robo, pregao]);
  const temSerie = saldo !== null && saldo.carregado && saldo.baldes.length > 0;

  const telaCheia = (
    <Link href={`/robos/${robo.slug}/ao-vivo`} prefetch={false} className={cn(LINK_DO_PAINEL, "text-[0.8125rem]")}>
      Abrir em tela cheia
    </Link>
  );

  // Nada de hoje e nenhum pregão anterior: o dia aparece uma vez, em palavras
  if (!hojeTemDia && !anterior) {
    const vazio =
      robo.status === "em_breve"
        ? "Este robô ainda não começou a operar"
        : robo.status === "pausado"
          ? "Este robô está pausado"
          : robo.status === "arquivado"
            ? "Este robô foi arquivado"
            : aberto
              ? "Hoje ainda sem operação"
              : "Sem operação hoje";
    return (
      <section aria-labelledby="ao-vivo">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <h2 id="ao-vivo" className="text-[0.9375rem] font-normal text-muted-foreground">
            Hoje · {formatarDataLonga(hoje)}
          </h2>
          {telaCheia}
        </div>
        <p className="mt-3 text-[length:clamp(1.75rem,3.2vw,3rem)] leading-[1.1] font-medium tracking-[-0.02em] text-balance">{vazio}</p>
        {robo.horario_inicio && robo.horario_fim && robo.status === "ativo" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Opera das {normalizarHora(robo.horario_inicio)} às {normalizarHora(robo.horario_fim)}.
          </p>
        ) : null}
      </section>
    );
  }

  // a versão da imagem do dia (24/09/2026): muda com o dia, para a prévia não vir velha da CDN; o diálogo a
  // congela ao abrir. Pregão passado não muda mais: basta o número de operações
  const versao = anterior
    ? versaoDoCard(ops.length)
    : versaoDoDiaAoVivo(ops, estado.saldoHoje.baldes, { dia: hoje, fim: fimDoDia(horario, pregao) });

  // a mais recente em cima; as novas entram no topo mesmo com a lista recolhida
  const recentes = [...ops].reverse();
  const mostradas = todas ? recentes : recentes.slice(0, VISIVEIS);
  const escondidas = recentes.length - mostradas.length;

  return (
    <section aria-labelledby="ao-vivo">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[0.9375rem] text-muted-foreground">
          {/* "ao vivo" só com o pregão aberto: no sábado é o dia parado */}
          <h2 id="ao-vivo" className="font-normal">
            {anterior ? "Último pregão com operação" : aberto ? "Hoje, ao vivo" : "Hoje"}
          </h2>
          <span>· {anterior ? diaComSemana(dia) : formatarDataLonga(hoje)}</span>
          {anterior ? (
            // o que há de hoje, em palavras: é por isso que a tela está no pregão anterior
            <span className="text-sutil">· {aberto ? "hoje ainda sem operação" : "fora do pregão agora"}</span>
          ) : aberto ? (
            <span className="text-sutil">
              · <AtualizadoHa em={estado.ultimaMensagemEm ?? estado.ultimoHeartbeatEm} className="text-[0.8125rem] text-sutil" />
            </span>
          ) : null}
        </div>
        {telaCheia}
      </div>

      <div className="mt-3 grid gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,auto)_minmax(0,24rem)] lg:items-end lg:justify-start">
        <div className="min-w-0">
          <NumeroGrande valor={liquido} centavos={Math.abs(liquido) < 1000} />
          <p className="mt-3 text-sm text-pretty text-muted-foreground">
            com 1 contrato por entrada, já descontados os custos ·{" "}
            {ops.length > 0 ? `${formatarNumero(ops.length)} ${ops.length === 1 ? "operação" : "operações"}` : "nenhuma operação fechada ainda"}
          </p>
          {/* a imagem do dia para a live, o WhatsApp e o Instagram (24/09/2026): só com operação, porque sem ela
              não há imagem (a rota responde 404) */}
          {ops.length > 0 ? (
            <div className="mt-4">
              <CompartilharDia
                slug={robo.slug}
                nomeRobo={robo.nome}
                dia={dia}
                versao={versao}
                temOperacao
                caminhoDoLink={anterior ? undefined : `/robos/${robo.slug}/hoje`}
                contaDemo={robo.conta_tipo === "demo"}
              />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 lg:pb-0.5">
          <Fatos>
            {momentos ? (
              <>
                <Fato rotulo="Melhor momento do dia" info="mep" infoTexto={momentos.medido ? TEXTO_MEP_EA(momentos.parcial) : undefined}>
                  {momentos.melhorEm ? <span className="mr-3 text-sutil">{formatarHora(momentos.melhorEm)}</span> : null}
                  {/* o dia que nunca passou de zero não ganha um "R$ 0,00": diz isso em palavras */}
                  {momentos.melhor > 0 ? <Valor valor={momentos.melhor} className="font-medium" /> : <span className="text-muted-foreground">não ficou positivo</span>}
                </Fato>
                <Fato rotulo="Pior momento do dia" info="men" infoTexto={momentos.medido ? TEXTO_MEN_EA(momentos.parcial) : undefined}>
                  {momentos.piorEm ? <span className="mr-3 text-sutil">{formatarHora(momentos.piorEm)}</span> : null}
                  {momentos.pior < 0 ? <Valor valor={momentos.pior} className="font-medium" /> : <span className="text-muted-foreground">não ficou negativo</span>}
                </Fato>
              </>
            ) : null}
            {anterior ? null : posicoes.length === 0 ? (
              <Fato rotulo="Operação aberta">
                <span className="text-muted-foreground">nenhuma agora</span>
              </Fato>
            ) : (
              posicoes.map((p) => (
                // o número de cada posição é o resultado em aberto (flutuante): muda com o preço até ela fechar
                <Fato
                  key={`${p.simbolo}-${p.lado}`}
                  rotulo={
                    <>
                      {rotuloLado(p.lado)} a {formatarPreco(p.preco_abertura)}
                      <HaQuanto em={p.aberta_em} prefixo=" · aberta " />
                    </>
                  }
                  info="flutuante"
                >
                  <Valor valor={p.lucro_flutuante_por_contrato} className="font-medium" />
                </Fato>
              ))
            )}
          </Fatos>
          {/* "3 operações em aberto" (21/09/2026): cada entrada ainda aberta conta 1, e a lista acima agrupa por
              símbolo e lado, então o número pode ser maior que o de linhas. Some fora do pregão e com o coletor
              parado (aí o aviso do cabeçalho é quem fala) */}
          {posicoes.length > 0 ? <OperacoesEmAberto className="text-[0.8125rem] leading-7 text-sutil" /> : null}
          {momentos?.parcial ? <p className="text-[0.8125rem] leading-7 text-sutil">Medição parcial: começou com o dia em andamento.</p> : null}
        </div>
      </div>

      {/* O dia em curva; vazio só sem operação E sem série (23/09/2026): com posição aberta e nenhuma saída a
          série já mostra o dia. A altura é o que sobra da janela, para o número, a curva e o começo da lista
          caberem sem rolar no computador */}
      {ops.length === 0 && !temSerie ? null : (
        <div className="mt-8 min-w-0 [--alt-curva:15rem] sm:[--alt-curva:18rem] lg:[--alt-curva:clamp(14rem,calc(100dvh_-_42rem),26rem)]">
          <CurvaDoDia
            operacoes={ops}
            saldo={saldo}
            dia={dia}
            horario={horario}
            valorPonto={robo.valor_ponto_brl}
            coletorAtrasado={exposicao?.excursao_ea_parcial === true}
          />
        </div>
      )}

      {/* o que acabou de acontecer */}
      {ops.length > 0 ? (
        <div className="mt-8">
          <div className="flex items-baseline justify-between gap-3 border-b border-(--painel-fio) pb-3">
            <h3 className="text-[0.9375rem] font-medium">{anterior ? "Operações desse pregão" : "Operações de hoje"}</h3>
            {/* a contagem já está debaixo do número: aqui só se diz quando a lista está cortada */}
            {escondidas > 0 ? <p className="text-[0.8125rem] text-sutil">as {formatarNumero(mostradas.length)} mais recentes</p> : null}
          </div>
          <ul className="grid gap-x-12 lg:grid-cols-2 2xl:grid-cols-3">
            {mostradas.map((o) => (
              <LinhaOperacao key={o.id} operacao={o} />
            ))}
          </ul>
          {ops.length > VISIVEIS ? (
            <button
              type="button"
              onClick={() => setTodas((v) => !v)}
              aria-expanded={todas}
              className="mt-3 border-b border-(--painel-fio-forte) py-1 text-sm text-muted-foreground transition-colors outline-none hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {todas ? "Mostrar só as últimas" : `Mostrar as outras ${formatarNumero(escondidas)}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
