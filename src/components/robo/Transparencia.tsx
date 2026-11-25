import Link from "next/link";
import { Painel } from "@/components/sistema/Painel";
import { formatarBRL } from "@/lib/formato";
import type { RoboPublico } from "@/lib/tipos";

interface Props {
  robo: RoboPublico;
  className?: string;
}

function Linha({ href, externo = false, rotulo, valor }: { href: string; externo?: boolean; rotulo: string; valor: React.ReactNode }) {
  const classes =
    "linha-interativa -mx-3 flex min-h-11 items-center justify-between gap-6 rounded-md px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
  const conteudo = (
    <>
      <span>{rotulo}</span>
      <span className="min-w-0 text-right text-muted-foreground">{valor}</span>
    </>
  );
  return (
    <li className="border-b border-(--painel-fio) last:border-b-0">
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
 * De onde vêm os números do robô (spec §8.2, "Transparência"). Uma lista de fatos, e cada linha leva à
 * explicação: o número fica aqui, o texto fica em Como funciona (17/09/2026). Desde a ficha Mesa (25/11/2026)
 * sem caixa e sem seta no fim da linha: a linha inteira é o link e acende sob o ponteiro.
 */
export function Transparencia({ robo, className }: Props) {
  return (
    <Painel id="transparencia" titulo="De onde vêm os números" corpo="" className={className}>
      <ul>
        <Linha
          href="/metodologia#coleta"
          rotulo="Origem dos dados"
          valor={robo.conta_tipo === "demo" ? "MetaTrader 5, conta demo" : robo.tem_coletor ? "MetaTrader 5, ao vivo" : "histórico importado"}
        />
        <Linha
          href="/metodologia#custos"
          rotulo="Custo descontado"
          valor={robo.custo_por_contrato > 0 ? `${formatarBRL(robo.custo_por_contrato)} por contrato, a cada operação` : "não configurado: valores antes dos custos"}
        />
        <Linha href="/metodologia#normalizacao" rotulo="Quanto vale 1 ponto" valor={`${formatarBRL(robo.valor_ponto_brl)} por contrato de ${robo.ativo_nome}`} />
        {/* os arquivos de cada mês moram na aba Dia a dia desde 25/11/2026 (a aba Relatórios saiu) */}
        <Linha href={`/robos/${robo.slug}/calendario#mes-a-mes`} rotulo="Relatórios mensais" valor="PDF e CSV" />
        {robo.relatorio_mt5_url ? <Linha href={robo.relatorio_mt5_url} externo rotulo="Relatório do MetaTrader" valor="abrir" /> : null}
      </ul>
    </Painel>
  );
}
