"use client";

import { ArrowLeft, ArrowUpRight, Share2 } from "lucide-react";
import Link from "next/link";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { BadgeStatusRobo } from "@/components/compartilhados/BadgeStatusRobo";
import { Valor } from "@/components/compartilhados/Valor";
import { Simbolo } from "@/components/marca/Simbolo";
import { CurvaDoDia } from "@/components/robo/CurvaDoDia";
import { LinhaOperacao } from "@/components/robo/LinhaOperacao";
import { useRobo } from "@/components/robo/RoboAoVivoProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAgora } from "@/hooks/useAgora";
import { useMontado } from "@/hooks/useMontado";
import { formatarBRL, formatarDataLonga, formatarNumero, formatarPct, formatarPontos, formatarPreco, rotuloLado } from "@/lib/formato";
import { pregaoAberto } from "@/lib/stats/pregao";
import { statusAoVivo } from "@/lib/stats/status-robo";

// A tela é um cartão de story: o que importa cabe na primeira tela do celular, e o resto rola.
const ULTIMAS = 3;

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
 * só as três últimas operações ficam em lista.
 */
export function TelaAoVivo() {
  const { estado, robo, pregao, feriados, hoje } = useRobo();
  const agora = useAgora(1000);
  const montado = useMontado();

  const ops = estado.operacoes;
  const liquido = ops.reduce((s, o) => s + o.resultado_brl_por_contrato - o.custos_brl_por_contrato, 0);
  const pontos = ops.reduce((s, o) => s + o.pontos_por_contrato, 0);
  const gains = ops.filter((o) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato > 0).length;

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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-4">
      {/* a marca abre a tela: é ela que diz, num print, de quem é o número */}
      <header className="flex items-center justify-between gap-2">
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
            Delta <span className="text-muted-foreground">Robôs</span>
          </span>
        </div>
        <BadgeStatusRobo status={status} />
      </header>

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
        <div className="mt-2 flex justify-center">
          <AtualizadoHa em={estado.ultimaMensagemEm ?? estado.ultimoHeartbeatEm} />
        </div>
      </section>

      <dl className="painel grid grid-cols-3 divide-x divide-(--painel-fio)">
        {/* sem o "pts": o rótulo embaixo já diz, e com ele o número não cabia em um terço da tela */}
        <Numero rotulo="pontos">{formatarPontos(pontos, true)}</Numero>
        <Numero rotulo={ops.length === 1 ? "operação" : "operações"}>{formatarNumero(ops.length)}</Numero>
        <Numero rotulo={ops.length > 0 ? `acerto · ${formatarNumero(gains)} gain` : "acerto"}>
          {ops.length > 0 ? formatarPct(gains / ops.length) : "–"}
        </Numero>
      </dl>

      {ops.length > 0 ? (
        <CurvaDoDia operacoes={ops} altura={200} titulo="O dia, operação a operação" legenda="por contrato, líquido de custos" />
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {/* robô sem coletor (só histórico importado) não tem dia ao vivo: a tela diz isso, em vez de parecer parada */}
          {robo.tem_coletor
            ? "Nenhuma operação fechada hoje ainda."
            : "Este robô só tem histórico importado. Não há operações ao vivo."}
        </p>
      )}

      {estado.posicoes.length > 0 ? (
        <section className="painel-grupo">
          <div className="painel-cabeca">
            <h2 className="painel-titulo">Posição aberta</h2>
          </div>
          <ul className="space-y-2">
            {estado.posicoes.map((p) => (
              <li
                key={`${p.simbolo}-${p.lado}`}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  p.lado === "compra" ? "border-positivo/40 bg-positivo/5" : "border-negativo/40 bg-negativo/5"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="secondary" className={p.lado === "compra" ? "bg-positivo/15 text-positivo" : "bg-negativo/15 text-negativo"}>
                    {rotuloLado(p.lado)}
                  </Badge>
                  <span className="text-sm font-medium">{p.simbolo}</span>
                  <span className="truncate text-sm text-muted-foreground tabular-nums">@ {formatarPreco(p.preco_abertura)}</span>
                </div>
                <Valor valor={p.lucro_flutuante_por_contrato} className="shrink-0 font-semibold" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

      <footer className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
        {/* o endereço só existe no navegador: aparece depois de montar, para o print dizer de onde veio */}
        <span className="truncate">
          {robo.tem_coletor ? "direto do MetaTrader 5" : "histórico importado"}
          {montado ? ` · ${window.location.host}` : ""}
        </span>
        <Button variant="ghost" size="sm" onClick={compartilhar}>
          <Share2 data-icon="inline-start" /> Compartilhar
        </Button>
      </footer>
    </main>
  );
}
