import { ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatarBRL } from "@/lib/formato";
import type { RoboPublico } from "@/lib/tipos";

interface Props {
  robo: RoboPublico;
}

function Linha({
  href,
  externo = false,
  rotulo,
  valor,
}: {
  href: string;
  externo?: boolean;
  rotulo: string;
  valor: React.ReactNode;
}) {
  const classes =
    "linha-interativa flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
  const conteudo = (
    <>
      <span className="text-sm">{rotulo}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-right text-sm text-muted-foreground tabular-nums">
        <span className="min-w-0">{valor}</span>
        {externo ? (
          <ArrowUpRight aria-hidden className="size-4 shrink-0 text-foreground/30" />
        ) : (
          <ChevronRight aria-hidden className="size-4 shrink-0 text-foreground/30" />
        )}
      </span>
    </>
  );
  return (
    <li className="sep [--sep:16px]">
      {externo ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
          {conteudo}
        </a>
      ) : (
        <Link href={href} className={classes}>
          {conteudo}
        </Link>
      )}
    </li>
  );
}

/**
 * Transparência do robô (spec §8.2). Eram quatro cartões de parágrafo repetindo, em cada robô, o que
 * a metodologia já explica (coleta, custos, normalização). Desde 17/09/2026 é uma lista de fatos do
 * robô, e cada linha leva à explicação: o número fica aqui, o texto fica lá.
 */
export function Transparencia({ robo }: Props) {
  return (
    <section aria-labelledby="transparencia" className="painel-grupo">
      <div className="painel-cabeca">
        <h2 id="transparencia" className="painel-titulo">
          Transparência
        </h2>
      </div>
      <ul className="painel overflow-hidden">
        <Linha
          href="/metodologia#coleta"
          rotulo="Origem dos dados"
          valor={robo.conta_tipo === "demo" ? "MetaTrader 5, conta demo" : "MetaTrader 5, ao vivo"}
        />
        <Linha
          href="/metodologia#custos"
          rotulo="Custo por contrato"
          valor={robo.custo_por_contrato > 0 ? `${formatarBRL(robo.custo_por_contrato)} por operação` : "não configurado: valores brutos"}
        />
        <Linha
          href="/metodologia#normalizacao"
          rotulo="Valor do ponto"
          valor={`${formatarBRL(robo.valor_ponto_brl)} · ${robo.ativo}`}
        />
        <Linha href={`/robos/${robo.slug}/relatorios`} rotulo="Relatórios mensais" valor="PDF e CSV" />
        {robo.relatorio_mt5_url ? (
          <Linha href={robo.relatorio_mt5_url} externo rotulo="Relatório do MetaTrader" valor="abrir" />
        ) : null}
      </ul>
    </section>
  );
}
