import { Valor } from "@/components/compartilhados/Valor";
import { formatarDataCurta, formatarDuracao, formatarHora, formatarPreco, rotuloLado } from "@/lib/formato";
import type { OperacaoPublica } from "@/lib/tipos";

interface Props {
  operacoes: OperacaoPublica[];
}

/** Lista compacta das últimas operações (usada na visão geral). */
export function UltimasOperacoes({ operacoes }: Props) {
  if (operacoes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhuma operação fechada ainda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
            <th>Data</th>
            <th>Fech.</th>
            <th>Lado</th>
            <th className="hidden sm:table-cell">Símbolo</th>
            <th className="text-right">Entrada</th>
            <th className="text-right">Saída</th>
            <th className="text-right">Pontos</th>
            <th className="text-right">R$ /ct</th>
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t">
          {operacoes.map((o) => (
            <tr key={o.id} className="tabular-nums [&>td]:px-3 [&>td]:py-2">
              <td>{formatarDataCurta(o.dia_pregao)}</td>
              <td>
                {formatarHora(o.fechamento_em)}
                {o.origem !== "manual" ? (
                  <span className="ml-1 text-xs text-muted-foreground">{formatarDuracao(o.duracao_seg)}</span>
                ) : null}
              </td>
              <td className={o.lado === "compra" ? "text-positivo" : "text-negativo"}>{rotuloLado(o.lado)}</td>
              <td className="hidden sm:table-cell">{o.simbolo}</td>
              <td className="text-right">{formatarPreco(o.preco_entrada)}</td>
              <td className="text-right">{formatarPreco(o.preco_saida)}</td>
              <td className="text-right">
                <Valor valor={o.pontos_por_contrato} unidade="pontos" />
              </td>
              <td className="text-right font-medium">
                <Valor valor={o.resultado_brl_por_contrato - o.custos_brl_por_contrato} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
