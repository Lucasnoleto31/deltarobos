"use client";

import { ArrowLeft, ArrowUpRight, Share2 } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { BadgeStatusRobo } from "@/components/compartilhados/BadgeStatusRobo";
import { Valor } from "@/components/compartilhados/Valor";
import { CompartilharDia } from "@/components/compartilhar/CompartilharDia";
import { versaoDoDiaAoVivo } from "@/components/compartilhar/regras-do-compartilhar";
import { Simbolo } from "@/components/marca/Simbolo";
import { CurvaDoDia } from "@/components/robo/CurvaDoDia";
import { LinhaOperacao } from "@/components/robo/LinhaOperacao";
import { OperacoesEmAberto } from "@/components/robo/OperacoesEmAberto";
import { usePregaoAberto, useRobo } from "@/components/robo/RoboAoVivoProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgora } from "@/hooks/useAgora";
import { useMontado } from "@/hooks/useMontado";
import { formatarBRL, formatarDataLonga, formatarNumero, formatarPct, formatarPontos, formatarPreco, rotuloLado } from "@/lib/formato";
import { fimDoDia } from "@/lib/stats/card-do-dia";
import { pregaoAberto } from "@/lib/stats/pregao";
import { horarioDaJanela } from "@/lib/stats/saldo-dia";
import { statusAoVivo } from "@/lib/stats/status-robo";

// A tela é um cartão de story: o que importa cabe na primeira tela do celular, e o resto rola.
const ULTIMAS = 3;

// Sem o i do "o que é" (19/09/2026): testado nos três números, ele tirava os rótulos do centro e, num print
// de story, é um botão que não abre. A explicação fica na página do robô.
function Numero({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-3 text-center">
      <dd className="truncate text-lg leading-none font-semibold tabular-nums">{children}</dd>
      <dt className="mt-1.5 text-[11px] text-muted-foreground">{rotulo}</dt>
    </div>
  );
}

/**
 * Tela cheia do dia (spec §8.4), feita para print vertical: vai parar em story e WhatsApp. Refeita em
 * 17/09/2026: no celular o número grande passava da borda ("+R$ 9.864,75" cortado), metade da tela era
 * uma tabela de dez operações e o print não levava marca nenhuma. Agora a marca e o robô abrem a tela,
 * o número se ajusta à largura pelo tamanho do próprio texto, o dia aparece em curva no estilo Profit e
 * só as três últimas operações ficam em lista. No computador (18/09/2026) vira duas colunas: número,
 * apoio e posição à esquerda; o dia em curva e as últimas operações à direita.
 */
export function TelaAoVivo() {
  const { estado, robo, pregao, feriados, hoje } = useRobo();
  // 5 s basta (18/09/2026): o relógio aqui só decide pregão e status, que mudam por minuto; o "há X s"
  // anda no AtualizadoHa, que tem relógio próprio. Com 1 s a tela inteira renderizava a cada segundo.
  const agora = useAgora(5000);
  const montado = useMontado();
  // o texto do dia vazio segue o pregão calculado no servidor até montar: mesmo HTML dos dois lados
  const abertoParaTexto = usePregaoAberto();

  const ops = estado.operacoes;
  const liquido = ops.reduce((s, o) => s + o.resultado_brl_por_contrato - o.custos_brl_por_contrato, 0);
  const pontos = ops.reduce((s, o) => s + o.pontos_por_contrato, 0);
  const gains = ops.filter((o) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato > 0).length;

  // a mesma curva do painel "Hoje ao vivo" (23/09/2026): a série do saldo medida pelo EA quando a rota já
  // respondeu com balde, senão por fechamento. O horário do robô (ou do pregão) dimensiona o eixo
  const horario = useMemo(() => horarioDaJanela(robo, pregao), [robo, pregao]);
  const temSerie = estado.saldoHoje.carregado && estado.saldoHoje.baldes.length > 0;
  // a versão da imagem do dia, como no Hoje ao vivo (24/09/2026): nº de operações e o minuto do último dado,
  // o balde só até o fim do dia do robô mais a folga
  const versao = versaoDoDiaAoVivo(ops, estado.saldoHoje.baldes, { dia: hoje, fim: fimDoDia(horario, pregao) });

  const aberto = agora ? pregaoAberto(agora, pregao, feriados) : false;
  const status = statusAoVivo({
    status: robo.status,
    posicionado: estado.posicoes.length > 0,
    ultimoHeartbeatEm: estado.ultimoHeartbeatEm,
    horarioInicio: robo.horario_inicio,
    horarioFim: robo.horario_fim,
    pregaoAberto: aberto,
    agora: agora ?? new Date(0),
    temColetor: robo.tem_coletor,
  });

  const resultado = formatarBRL(liquido, { sinal: true });
  // O número ocupa a largura que tem: cada caractere pede uns 0,6em, então o tamanho sai da conta
  // (largura útil ÷ caracteres), com teto de 4,5rem. "+R$ 9.864,75" e "+R$ 129.864,75" cabem os dois.
  const tamanhoDoNumero = `min(4.5rem, calc((min(100vw, 28rem) - 2.5rem) / ${(Math.max(8, resultado.length) * 0.6).toFixed(1)}))`;

  const compartilhar = async () => {
    const url = window.location.href;
    const texto = `${robo.nome} hoje: ${resultado} por contrato, líquido de custos`;
    try {
      if (navigator.share) await navigator.share({ title: `${robo.nome} ao vivo`, text: texto, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* usuário cancelou */
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-4 lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:content-start lg:gap-x-10 lg:px-8 lg:py-6">
      {/* a marca abre a tela: é ela que diz, num print, de quem é o número */}
      <header className="flex items-center justify-between gap-2 lg:col-span-2">
        <div className="flex items-center gap-1">
          <Link
            href={`/robos/${robo.slug}`}
            aria-label={`Voltar para a página do ${robo.nome}`}
            className="-ml-2 grid size-9 place-items-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <Simbolo aria-hidden className="h-6 w-auto" />
          <span className="ml-1 text-sm font-semibold tracking-tight">
            Quants <span className="text-muted-foreground">Robôs</span>
          </span>
        </div>
        {/* só o status (21/09/2026): "Posicionado · 3 em aberto" não cabe ao lado da marca a 375 px, e o
            "3 operações em aberto" já aparece por extenso ao lado de "Posição aberta", logo abaixo */}
        <BadgeStatusRobo status={status} />
      </header>

      <div className="contents lg:flex lg:flex-col lg:gap-5">
      <section className="text-center">
        <h1 className="flex flex-wrap items-center justify-center gap-2 text-2xl font-semibold tracking-tight">
          {robo.nome}
          <Badge variant="outline" className="font-normal">
            {robo.ativo_nome} · {robo.ativo}
          </Badge>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatarDataLonga(hoje)}</p>

        <p className="mt-4 leading-none font-semibold tracking-tight whitespace-nowrap" style={{ fontSize: tamanhoDoNumero }}>
          <Valor valor={liquido} />
        </p>
        <p className="mt-2 text-xs text-muted-foreground">por contrato, líquido de custos</p>
        {/* sem coletor não há sinal: "atualizado sem dados" não diz nada (19/09/2026) */}
        {robo.tem_coletor ? (
          <div className="mt-2 flex justify-center">
            <AtualizadoHa em={estado.ultimaMensagemEm ?? estado.ultimoHeartbeatEm} />
          </div>
        ) : null}
      </section>

      <dl className="painel grid grid-cols-3 divide-x divide-(--painel-fio)">
        {/* sem o "pts": o rótulo embaixo já diz, e com ele o número não cabia em um terço da tela */}
        <Numero rotulo="pontos">{formatarPontos(pontos, true)}</Numero>
        <Numero rotulo={ops.length === 1 ? "operação" : "operações"}>{formatarNumero(ops.length)}</Numero>
        <Numero rotulo={ops.length > 0 ? `acerto · ${formatarNumero(gains)} ${gains === 1 ? "gain" : "gains"}` : "acerto"}>
          {ops.length > 0 ? formatarPct(gains / ops.length) : "–"}
        </Numero>
      </dl>

      {estado.posicoes.length > 0 ? (
        <section className="painel-grupo">
          <div className="painel-cabeca">
            <h2 className="painel-titulo">Posição aberta</h2>
            {/* "3 operações em aberto" ao lado do título (21/09/2026), sem o i: num print de story ele é um
                botão que não abre; a explicação fica na página do robô e na Metodologia */}
            <OperacoesEmAberto comInfo={false} className="painel-acao" />
          </div>
          <ul className="space-y-2">
            {estado.posicoes.map((p) => (
              <li
                key={`${p.simbolo}-${p.lado}`}
                className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {/* o lado fica neutro (19/09/2026): verde e vermelho só no resultado */}
                  <span className="text-sm font-medium">{rotuloLado(p.lado)}</span>
                  <span className="text-sm font-medium">{p.simbolo}</span>
                  <span className="truncate text-sm text-muted-foreground tabular-nums">@ {formatarPreco(p.preco_abertura)}</span>
                </div>
                <Valor valor={p.lucro_flutuante_por_contrato} className="shrink-0 font-semibold" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </div>

      <div className="contents lg:flex lg:flex-col lg:gap-5">
      {/* vazio só sem operação E sem série (23/09/2026): com posição aberta a série já mostra o calor do dia */}
      {ops.length > 0 || temSerie ? (
        <CurvaDoDia
          operacoes={ops}
          saldo={estado.saldoHoje}
          dia={hoje}
          horario={horario}
          valorPonto={robo.valor_ponto_brl}
          altura={200}
          titulo="O dia, operação a operação"
          tituloSerie="O dia, medido no MT5"
          legenda="por contrato, líquido de custos"
          coletorAtrasado={estado.exposicaoHoje?.excursao_ea_parcial === true}
        />
      ) : (
        <p className="painel px-4 py-8 text-center text-sm text-muted-foreground">
          {/* robô sem coletor (só histórico importado) não tem dia ao vivo: a tela diz isso, em vez de parecer parada.
              "ainda" só com o pregão aberto (19/09/2026): no sábado não vem mais nenhuma */}
          {!robo.tem_coletor
            ? "Este robô só tem histórico importado, sem operações ao vivo."
            : abertoParaTexto
              ? "Nenhuma operação fechada hoje ainda."
              : "Nenhuma operação hoje."}
        </p>
      )}


      {ops.length > 0 ? (
        <section className="painel-grupo">
          <div className="painel-cabeca">
            <h2 className="painel-titulo">Últimas operações</h2>
            <div className="painel-acao">
              <Link
                href={`/robos/${robo.slug}/operacoes`}
                className="inline-flex items-center gap-0.5 underline-offset-4 hover:text-foreground hover:underline"
              >
                Todas as {formatarNumero(ops.length)} <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </div>
          </div>
          <ul className="painel overflow-hidden">
            {[...ops]
              .reverse()
              .slice(0, ULTIMAS)
              .map((o) => (
                <LinhaOperacao key={o.id} operacao={o} />
              ))}
          </ul>
        </section>
      ) : null}
      </div>

      <footer className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground lg:col-span-2">
        {/* o endereço só existe no navegador: aparece depois de montar, para o print dizer de onde veio.
            Sem truncate (19/09/2026): no celular o endereço saía cortado; agora desce inteiro para a segunda linha */}
        <span className="min-w-0">
          {robo.tem_coletor ? "direto do MetaTrader 5" : "histórico importado"}
          {montado ? (
            <>
              {" · "}
              <span className="whitespace-nowrap">{window.location.host}</span>
            </>
          ) : null}
        </span>
        {/* 24/09/2026: com operação no dia, o "Compartilhar" abre a imagem do dia (Quadrado ou Story, com
            Compartilhar, Baixar imagem e Copiar link, este apontando para a própria tela cheia). Sem operação
            não há imagem (a rota responde 404) e fica o botão de antes, que compartilha o link da tela. Um ou
            outro, nunca os dois: não há dois "Compartilhar" na tela */}
        {ops.length > 0 ? (
          <CompartilharDia
            slug={robo.slug}
            nomeRobo={robo.nome}
            dia={hoje}
            versao={versao}
            temOperacao
            rotulo="Compartilhar"
            variante="ghost"
            caminhoDoLink={`/robos/${robo.slug}/ao-vivo`}
            contaDemo={robo.conta_tipo === "demo"}
          />
        ) : (
          <Button variant="ghost" size="sm" onClick={compartilhar}>
            <Share2 data-icon="inline-start" /> Compartilhar
          </Button>
        )}
      </footer>
    </main>
  );
}
