"use client";

import { cn } from "cn";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarNumero, formatarPreco } from "@/lib/formato";
import { useCasa, usePregaoAberto } from "./CasaAoVivoProvider";

// 19/09/2026: o ponto era muted/40, com contraste 2,2 no escuro e 1,7 no claro; como divisor ele
// precisa ser visto, então vai na mesma cor do texto de apoio.
function Separador() {
  return <span aria-hidden className="text-muted-foreground">·</span>;
}

/**
 * Item 1 da home: pregão, WIN/WDO agora, robôs posicionados, resultado da casa. Com o pregão fechado e
 * nenhuma operação no dia (fim de semana, madrugada), "0 robôs posicionados" e "Todos hoje R$ 0,00"
 * saem: ficavam logo acima do hero com o último pregão (19/09/2026). Voltam com o pregão aberto ou com
 * a primeira operação do dia; robô posicionado aparece sempre. "Pregão aberto" na cor do texto: verde é
 * só resultado em dinheiro.
 */
export function BarraAoVivo() {
  const { estado } = useCasa();
  // o valor do servidor vale até a hidratação: o HTML já chega sem os zeros (19/09/2026)
  const aberto = usePregaoAberto();
  const resumo = estado.resumo;

  const posicionados =
    resumo?.n_robos_posicionados ??
    Object.values(estado.coleta).filter((c) => c.posicionado).length;
  const semDia = !aberto && (resumo?.n_operacoes ?? 0) === 0;

  const ultimoHeartbeat = Object.values(estado.coleta)
    .map((c) => c.ultimo_heartbeat_em)
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);
  const atualizadoEm = estado.ultimaMensagemEm ?? ultimoHeartbeat ?? resumo?.gerado_em ?? null;

  return (
    <div className="border-b bg-muted/40 text-xs">
      <div className="borda-esmaece conteudo flex h-9 items-center gap-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="font-medium">{aberto ? "Pregão aberto" : "Pregão fechado"}</span>

        {estado.mercado
          .filter((m) => m.preco !== null)
          .map((m) => (
            <span key={m.prefixo_simbolo} className="inline-flex items-center gap-1.5">
              <Separador />
              <span className="font-medium">{m.prefixo_simbolo}</span>
              <span className="tabular-nums">{formatarPreco(m.preco ?? 0)}</span>
              {m.variacao_pct !== null ? (
                <span
                  className={cn(
                    "tabular-nums",
                    m.variacao_pct > 0
                      ? "text-positivo"
                      : m.variacao_pct < 0
                        ? "text-negativo"
                        : "text-muted-foreground",
                  )}
                >
                  {formatarNumero(m.variacao_pct, 2, true)}%
                </span>
              ) : null}
            </span>
          ))}

        {semDia && posicionados === 0 ? null : (
          <>
            <Separador />
            <span className="tabular-nums">
              {formatarNumero(posicionados)} {posicionados === 1 ? "robô posicionado" : "robôs posicionados"}
            </span>
          </>
        )}

        {resumo && !semDia ? (
          <>
            <Separador />
            <span className="inline-flex items-center gap-1">
              Todos hoje
              <Valor valor={resumo.resultado_liquido_por_contrato} className="font-semibold" />
              <span className="text-muted-foreground">/ct</span>
            </span>
          </>
        ) : null}

        <span className="ml-auto pl-3">
          <AtualizadoHa em={atualizadoEm} />
        </span>
      </div>
    </div>
  );
}
