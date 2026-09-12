import { formatarBRL } from "@/lib/formato";
import type { RoboPublico } from "@/lib/tipos";

interface Props {
  robo: RoboPublico;
}

/** Como o dado chega aqui e o que está descontado (spec §8.2, "Transparência"). */
export function Transparencia({ robo }: Props) {
  return (
    <section aria-labelledby="transparencia" className="space-y-3">
      <h2 id="transparencia" className="text-lg font-semibold tracking-tight">
        Transparência
      </h2>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="font-medium">De onde vem o dado</p>
          <p className="mt-1 text-muted-foreground">
            Um coletor roda no MetaTrader 5 da conta real da Delta Robôs e envia cada operação ao
            fechar, mais um sinal de vida a cada 3 segundos. Nada é digitado à mão.
          </p>
        </div>
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="font-medium">Custos considerados</p>
          <p className="mt-1 text-muted-foreground">
            {robo.custo_por_contrato > 0 ? (
              <>
                <span className="tabular-nums text-foreground">{formatarBRL(robo.custo_por_contrato)}</span>{" "}
                por contrato, por operação (corretagem e emolumentos), já descontados no resultado
                líquido.
              </>
            ) : (
              "Custos por contrato ainda não configurados: os valores exibidos são brutos."
            )}
          </p>
        </div>
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="font-medium">Normalização</p>
          <p className="mt-1 text-muted-foreground">
            Tudo está por <span className="text-foreground">1 contrato</span>. Pontos viram R$ a{" "}
            <span className="tabular-nums text-foreground">{formatarBRL(robo.valor_ponto_brl)}</span> por
            ponto ({robo.ativo}). Multiplique pela sua quantidade de contratos.
          </p>
        </div>
      </div>
    </section>
  );
}
