import { cn } from "cn";
import type { ChaveIndicador } from "@/components/compartilhados/glossario";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";

const GRADE: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 2xl:grid-cols-6",
};

/**
 * Números lado a lado (ficha Mesa, 25/11/2026, segunda passada): uma fileira com um fio em cima, cada número
 * separado do vizinho só por espaço. Sem caixa em volta de cada um. No máximo 6 por fileira, e só os que a
 * tela precisa: número que repete outro lugar da tela não entra.
 */
export function Indicadores({
  children,
  colunas = 4,
  className,
}: {
  children: React.ReactNode;
  colunas?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  return <dl className={cn("indicadores", GRADE[colunas], className)}>{children}</dl>;
}

/**
 * Um número: o nome em palavras de todo dia, o valor e, se precisar, uma linha dizendo o que ele quer dizer.
 * `info` é a chave do glossário: aí o nome abre a explicação ao toque. Use só em termo que o leigo não
 * conhece; rótulo comum ("No mês", "Hoje") não leva.
 */
export function Indicador({
  rotulo,
  info,
  infoTexto,
  valor,
  apoio,
  className,
}: {
  rotulo: React.ReactNode;
  info?: ChaveIndicador;
  infoTexto?: string;
  valor: React.ReactNode;
  apoio?: React.ReactNode;
  /** aceito por compatibilidade; o destaque da tela agora é o número grande, fora da fileira */
  destaque?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("indicador", className)}>
      <dt className="text-[0.8125rem] text-sutil">
        {info ? (
          <RotuloComInfo chave={info} texto={infoTexto}>
            {rotulo}
          </RotuloComInfo>
        ) : (
          rotulo
        )}
      </dt>
      <dd className="mt-1.5 text-xl leading-none font-medium tracking-tight sm:text-[1.375rem]">{valor}</dd>
      {apoio ? <dd className="mt-1.5 text-[0.8125rem] text-pretty text-muted-foreground">{apoio}</dd> : null}
    </div>
  );
}
