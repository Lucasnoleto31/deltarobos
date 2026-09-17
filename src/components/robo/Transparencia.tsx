import { FileText } from "lucide-react";
import Link from "next/link";
import { formatarBRL } from "@/lib/formato";
import type { RoboPublico } from "@/lib/tipos";

interface Props {
  robo: RoboPublico;
}

/** Como o dado chega aqui, o que está descontado e o relatório do MT5 (spec §8.2, "Transparência"). */
export function Transparencia({ robo }: Props) {
  return (
    <section aria-labelledby="transparencia" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="transparencia" className="text-lg font-semibold tracking-tight">
          Transparência
        </h2>
        <Link href="/metodologia" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Como calculamos cada número
        </Link>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="painel p-4">
          <p className="font-medium">De onde vem o dado</p>
          <p className="mt-1 text-muted-foreground">
            Um coletor roda no MetaTrader 5 da conta da Delta Robôs{robo.conta_tipo === "demo" ? " (conta demo)" : ""} e
            envia cada operação ao fechar, mais um sinal de vida a cada 3 segundos. Nada é digitado à mão.
          </p>
        </div>
        <div className="painel p-4">
          <p className="font-medium">Custos considerados</p>
          <p className="mt-1 text-muted-foreground">
            {robo.custo_por_contrato > 0 ? (
              <>
                <span className="tabular-nums text-foreground">{formatarBRL(robo.custo_por_contrato)}</span> por
                contrato, por operação (corretagem e emolumentos), já descontados no resultado líquido.
              </>
            ) : (
              "Custos por contrato ainda não configurados: os valores exibidos são brutos."
            )}
          </p>
        </div>
        <div className="painel p-4">
          <p className="font-medium">Normalização</p>
          <p className="mt-1 text-muted-foreground">
            Tudo está por <span className="text-foreground">1 contrato</span>. Pontos viram R$ a{" "}
            <span className="tabular-nums text-foreground">{formatarBRL(robo.valor_ponto_brl)}</span> por ponto (
            {robo.ativo}). Multiplique pela sua quantidade de contratos.
          </p>
        </div>
        <div className="painel p-4">
          <p className="font-medium">Relatórios mensais</p>
          <p className="mt-1 text-muted-foreground">
            <Link
              href={`/robos/${robo.slug}/relatorios`}
              className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
            >
              <FileText className="size-4" /> Baixar o PDF ou o CSV de cada mês
            </Link>
            , gerados na hora a partir das operações.
          </p>
          {robo.relatorio_mt5_url ? (
            <a
              href={robo.relatorio_mt5_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Relatório exportado do MetaTrader
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
