"use client";

import { cn } from "cn";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { BadgeStatusRobo } from "@/components/compartilhados/BadgeStatusRobo";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Valor } from "@/components/compartilhados/Valor";
import { MiniCurva } from "@/components/graficos/MiniCurva";
import { linkSimulador } from "@/components/simulador/simulador-url";
import { Badge } from "@/components/ui/badge";
import { corDoRobo } from "@/lib/cores-robo";
import { formatarNumero, formatarPct } from "@/lib/formato";
import type { StatusAoVivo } from "@/lib/stats/status-robo";
import { estiloDoRobo, PontoRobo } from "./cores";
import { formatarDiaCurto } from "./datas";
import type { DadosCardRobo, UltimoPregao } from "./tipos";

interface Props {
  card: DadosCardRobo;
  status: StatusAoVivo;
  /** operações em aberto agora (entradas, nunca contratos); vai no selo, "Posicionado · 3 em aberto" (21/09/2026) */
  posicoesAbertas?: number;
  /** operações e gains de hoje, do resumo ao vivo (quando há) */
  hojeOperacoes?: number;
  hojeGains?: number;
  /** quando vem, o destaque é esse dia já fechado no lugar de hoje (pregão fechado ou robô sem coletor, sem operação hoje) */
  ultimoPregao?: UltimoPregao | null;
}

/**
 * O cartão do robô na home. Em 18/09/2026 à noite virou vidro ("liquid glass", pedido do Artur): a
 * superfície é translúcida com brilho na borda de cima. A luz verde ou vermelha que ficava atrás do
 * vidro saiu no mesmo dia ("não gostei desse verde atrás do card"): a cor fica só nos números. Um
 * número por vez: o de hoje grande, com operações e acerto do dia embaixo; mês e acumulado em apoio;
 * a curva dos 30 dias na largura toda; no pé, o drawdown máximo e o botão redondo que leva ao robô.
 * Com memo (18/09/2026): a grade recalcula o status a cada 5 s, mas as props são primitivas ou
 * estáveis, então o cartão só renderiza de novo quando algo nele muda. Fora do pregão (ou, no robô sem
 * coletor, sempre) e sem operação hoje, o número grande é o do último pregão, com o dia no rótulo
 * (19/09/2026).
 *
 * 19/09/2026, à noite: a entrada deixou de ser no carregamento e passou a ser quando o cartão entra na
 * tela — quem faz isso é o RevelarNaRolagem, no <li> da GradeRobos, que também cuida da cascata. Aqui
 * ficou só o hover: o fio que acende (.painel-interativo), 2 px de elevação (.painel-eleva) e um
 * empurrãozinho na seta, os três na mesma curva e nos mesmos 180 ms.
 *
 * 19/09/2026 (Artur: "em todos os cards deve ter uma info sobre o que é"): cada número ganhou o i do
 * glossário. Botão dentro de link é inválido, então o cartão deixou de ser um <a>: o link é o nome do
 * robô, e o ::after dele cobre o cartão inteiro (link esticado), com o mesmo hover, a seta e o anel de
 * foco no cartão. Os i e o selo ficam por cima (z-10): o i abre a explicação e o selo mostra o title. Com
 * o link só no nome, o selo volta a levar a definição para leitor de tela.
 *
 * 13/10/2026, mídia kit da Zeve ("mais cores", Lucas): o cartão ganhou a identidade do robô, sem ser pintado
 * por inteiro. A cor vem da `ordem` do banco (--cor-robo, estiloDoRobo) e aparece no ponto ao lado do nome, no
 * fio do cartão (35%, e 60% no hover) e na mini curva. O número de cima é o protagonista (Valor em destaque);
 * mês, acumulado e drawdown viraram uma lista de apoio com o número alinhado à direita, todos com cor: os dois
 * primeiros pelo sinal e o drawdown sempre no vermelho (é perda). O azul do acento ficou para o que é ação: o link do
 * simulador e a seta, que no hover enche de azul.
 */
export const CardRobo = memo(function CardRobo({
  card,
  status,
  posicoesAbertas,
  hojeOperacoes,
  hojeGains,
  ultimoPregao,
}: Props) {
  const emBreve = card.status === "em_breve";
  const destaque = ultimoPregao
    ? {
        rotulo: formatarDiaCurto(ultimoPregao.dia),
        valor: ultimoPregao.valor,
        operacoes: ultimoPregao.nOperacoes,
        gains: ultimoPregao.nGain,
      }
    : { rotulo: "Hoje", valor: card.hoje, operacoes: hojeOperacoes, gains: hojeGains };

  return (
    <article
      style={estiloDoRobo(card.ordem)}
      className={cn(
        // o anel de foco do cartão é só do link do título (o esticado); o "Simular com meu capital" tem o contorno próprio
        "group relative flex h-full flex-col painel vidro painel-interativo painel-eleva p-5 has-[h3_a:focus-visible]:ring-2 has-[h3_a:focus-visible]:ring-ring/50",
        // o fio na cor do robô vence o do .vidro e o do hover do .painel-interativo (utilitário vence componente)
        "border-[color-mix(in_srgb,var(--cor-robo)_35%,transparent)] hover:border-[color-mix(in_srgb,var(--cor-robo)_60%,transparent)]",
        // os i ficam acima do ::after do link (o InfoIndicador já é relative)
        "[&_button]:z-10",
        emBreve && "opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-lg leading-tight font-semibold">
          <PontoRobo className="size-2.5" />
          <Link href={`/robos/${card.slug}`} className="min-w-0 truncate outline-none after:absolute after:inset-0">
            {card.nome}
          </Link>
        </h3>
        <BadgeStatusRobo status={status} abertas={posicoesAbertas} className="relative z-10" />
      </div>
      {/* fora da linha do selo, na largura toda: ao lado do "Posicionado · 1 em aberto" o "Mini Índice · WIN"
          quebrava em duas linhas de 1024 a ~1100 px. Alinhado ao nome, não ao ponto: 10 px do ponto e 8 do gap */}
      <p className="mt-0.5 pl-[18px] text-xs text-muted-foreground">
        {card.ativoNome} · {card.ativo}
      </p>

      {emBreve ? (
        <div className="flex flex-1 flex-col justify-between gap-4 pt-5">
          <p className="text-sm text-muted-foreground">{card.descricao ?? "Sem operações ainda."}</p>
          <Badge variant="outline" className="w-fit">
            Em breve
          </Badge>
        </div>
      ) : (
        <>
          <div className="pt-5">
            <p className="rotulo-metrica">
              <RotuloComInfo chave="resultadoDia">{destaque.rotulo}</RotuloComInfo>
            </p>
            <p className="mt-2">
              <Valor
                valor={destaque.valor}
                inteiro={Math.abs(destaque.valor) >= 10_000}
                destaque
                className="text-3xl"
              />
            </p>
            {destaque.operacoes ? (
              <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                {formatarNumero(destaque.operacoes)} {destaque.operacoes === 1 ? "operação" : "operações"}
                {destaque.gains !== undefined ? ` · ${formatarPct(destaque.gains / destaque.operacoes, 0)} de acerto` : ""}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">sem operação fechada hoje</p>
            )}
          </div>

          {/* a curva dos 30 dias na cor do robô (13/10/2026): o sinal do período já está no mês e no acumulado */}
          <MiniCurva pontos={card.sparkline} altura={64} cor={corDoRobo(card.ordem)} className="mt-4" />

          {/* apoio em lista, rótulo à esquerda e número alinhado à direita: cabe igual em qualquer largura (em
              linha, os três quebravam de 1024 a ~1100 px e cada cartão ficava de um jeito) */}
          <dl className="mt-4 space-y-1.5 border-t border-(--painel-fio) pt-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">
                <RotuloComInfo chave="mesAtual">Mês</RotuloComInfo>
              </dt>
              <dd className="font-semibold">
                <Valor valor={card.mes} inteiro={Math.abs(card.mes) >= 1000} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">
                <RotuloComInfo chave="acumulado">Acumulado</RotuloComInfo>
              </dt>
              <dd className="font-semibold">
                <Valor valor={card.acumulado} inteiro={Math.abs(card.acumulado) >= 1000} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">
                <RotuloComInfo chave="drawdown">DD máx.</RotuloComInfo>
              </dt>
              {/* drawdown é perda: vermelho sempre, cinza só no zero (o Valor decide pelo sinal) */}
              <dd className="font-semibold">
                <Valor valor={-card.drawdownMaximo} inteiro />
              </dd>
            </div>
          </dl>

          <div className="mt-auto flex items-end justify-between gap-3 pt-4 text-xs">
            {/* "Simular com meu capital" (23/09/2026): o cartão é link esticado, então este link fica por
                cima dele (relative z-10), como os i. Sem nowrap: no cartão estreito o texto quebra em duas
                linhas em vez de estourar a largura. Sublinhado por padrão, como na aba Risco: no toque não
                há hover para dizer que é link. Só o slug entra na URL (linkSimulador), nada de prop nova.
                13/10/2026: no azul do acento (text-info), a cor de link do site. */}
            <Link
              href={linkSimulador(card.slug)}
              className="relative z-10 min-w-0 font-medium text-info underline decoration-info/40 underline-offset-4 hover:decoration-info"
            >
              Simular com meu capital
            </Link>
            {/* o empurrãozinho da seta (2 px para cima e para a direita) é o que o cartão inteiro faz
                em miniatura; mesma curva e mesmos 180 ms do .painel-interativo. A propriedade da
                transição é "translate", não "transform": o translate-* do Tailwind 4 escreve na
                propriedade translate, e com "transform" na lista a seta pulava sem transição
                (conferido no navegador em 19/09/2026). 13/10/2026: no hover enche do azul do botão
                principal (era a cor do texto), com o branco dele por cima. */}
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full border border-(--painel-fio-forte) text-foreground transition-[color,background-color,border-color,translate] duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
            >
              <ArrowUpRight className="size-4" />
            </span>
          </div>
        </>
      )}
    </article>
  );
});
