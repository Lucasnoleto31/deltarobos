"use client";

import { cn } from "cn";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarNumero, formatarPreco } from "@/lib/formato";
import { contarPosicionados } from "@/lib/stats/posicoes";
import { useCasa, useOperacoesEmAberto, usePregaoAberto } from "./CasaAoVivoProvider";

const fmtDia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/**
 * A fita de mercado no topo do sistema (ficha Mesa, 25/11/2026): pregão aberto ou fechado, a cotação de cada
 * ativo e o dia de hoje da casa em uma frase. Fica em toda página.
 *
 * Segunda passada do mesmo dia: saíram os zeros ("0 robôs em operação", "0 operações em aberto", "Robôs
 * hoje R$ 0,00"), que repetiam a página. O dia aparece uma vez, em palavras: "Hoje ainda sem operação
 * fechada" ou "Hoje +R$ 1.240 em 12 operações"; "robôs em operação agora" só quando há algum, com o pregão
 * aberto e o coletor em dia (21/09/2026). O ativo vai pelo nome ("Mini Índice"), não pelo código.
 */
export function FitaMercado({ className }: { className?: string }) {
  const { estado, hoje } = useCasa();
  // o valor do servidor vale até a hidratação (19/09/2026)
  const aberto = usePregaoAberto();
  const resumo = estado.resumo;
  const { aoVivo } = useOperacoesEmAberto();

  const posicionados = aoVivo ? (resumo?.n_robos_posicionados ?? contarPosicionados(Object.values(estado.coleta))) : 0;
  const operacoesHoje = resumo?.n_operacoes ?? 0;

  const ultimoHeartbeat = Object.values(estado.coleta)
    .map((c) => c.ultimo_heartbeat_em)
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);
  const atualizadoEm = estado.ultimaMensagemEm ?? ultimoHeartbeat ?? resumo?.gerado_em ?? null;

  return (
    <div
      className={cn(
        "borda-esmaece flex min-w-0 items-center gap-7 overflow-x-auto text-[0.8125rem] whitespace-nowrap text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 text-foreground">
        <span aria-hidden className={cn("size-1.5 rounded-full", aberto ? "bg-marca" : "bg-sutil")} />
        {aberto ? "Pregão aberto" : "Pregão fechado"}
      </span>

      {estado.mercado
        .filter((m) => m.preco !== null)
        .map((m) => (
          <span key={m.prefixo_simbolo} className="inline-flex items-baseline gap-2">
            {m.nome || m.prefixo_simbolo}
            <span className="font-medium text-foreground">{formatarPreco(m.preco ?? 0)}</span>
            {m.variacao_pct !== null ? (
              <span className={cn(m.variacao_pct > 0 ? "text-positivo" : m.variacao_pct < 0 ? "text-negativo" : "")}>
                {formatarNumero(m.variacao_pct, 2, true)}%
              </span>
            ) : null}
          </span>
        ))}

      {operacoesHoje > 0 && resumo ? (
        <span>
          Hoje <Valor valor={resumo.resultado_liquido_por_contrato} inteiro={Math.abs(resumo.resultado_liquido_por_contrato) >= 1000} className="font-medium" /> em{" "}
          {formatarNumero(operacoesHoje)} {operacoesHoje === 1 ? "operação" : "operações"}
        </span>
      ) : aberto ? (
        <span>Hoje ainda sem operação fechada</span>
      ) : null}

      {posicionados > 0 ? (
        <span className="text-info">
          {formatarNumero(posicionados)} {posicionados === 1 ? "robô em operação agora" : "robôs em operação agora"}
        </span>
      ) : null}

      <span className="ml-auto inline-flex items-baseline gap-2 pl-3 text-sutil">
        <span className="hidden xl:inline">{fmtDia.format(new Date(`${hoje}T12:00:00Z`))} ·</span>
        <AtualizadoHa em={atualizadoEm} className="text-[0.8125rem] text-sutil" />
      </span>
    </div>
  );
}
