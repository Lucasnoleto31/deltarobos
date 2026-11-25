import { cn } from "cn";
import type { ChaveIndicador } from "@/components/compartilhados/glossario";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";

// 25/11/2026, revisão das telas (DESIGN.md, seção 9): a faixa de números lado a lado (CardsKpi) saiu com as
// telas que a usavam (a aba Desempenho e a página Comparar). O arquivo guarda só a lista, que é o "mais
// números" das telas de análise. O `tom` e o `icone` do item saíram junto: nenhuma tela os passava, e a lista
// nunca pintou nem mostrou ícone.

export interface ItemKpi {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  /** chave do glossário: com ela, o rótulo vira o gatilho do "o que é" (sublinhado pontilhado, sem ícone) */
  info?: ChaveIndicador;
  /** troca o texto do glossário quando o número da tela pede outra explicação (por exemplo, a premissa de custos do robô) */
  infoTexto?: string;
}

interface Props {
  itens: ItemKpi[];
  className?: string;
}

/** O rótulo, com o "o que é" quando o item traz a chave do glossário. */
function Rotulo({ item }: { item: ItemKpi }) {
  return item.info ? (
    <RotuloComInfo chave={item.info} texto={item.infoTexto}>
      {item.rotulo}
    </RotuloComInfo>
  ) : (
    item.rotulo
  );
}

/**
 * Números em lista: rótulo e apoio à esquerda, valor à direita, uma linha por número com fio entre elas, em
 * duas colunas a partir do lg. É o "Como ele opera" do Resumo do robô e as listas de Quedas e risco e de
 * Melhores horários.
 */
export function ListaKpi({ itens, className }: Props) {
  return (
    <dl className={cn("grid gap-x-12 lg:grid-cols-2", className)}>
      {itens.map((item) => (
        <div key={item.rotulo} className="flex items-center justify-between gap-4 border-b border-(--painel-fio) py-2.5">
          <dt className="min-w-0">
            <span className="block text-sm">
              <Rotulo item={item} />
            </span>
            {item.detalhe ? <span className="block text-[0.8125rem] text-pretty text-sutil">{item.detalhe}</span> : null}
          </dt>
          <dd className="shrink-0 text-sm font-medium whitespace-nowrap">{item.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
