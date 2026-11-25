import { cn } from "cn";
import type { ChaveIndicador } from "@/components/compartilhados/glossario";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { formatarBRL } from "@/lib/formato";

/**
 * O número principal da tela (ficha Mesa, 25/11/2026): um por tela. O sinal e o "R$" vão mais leves que os
 * algarismos (peso 400 e cinza), que é o detalhe que tira o número do padrão de aplicativo de corretora.
 * Negativo fica vermelho inteiro; positivo fica na cor do texto (o verde é das colunas de resultado).
 */
export function NumeroGrande({
  valor,
  centavos = false,
  className,
}: {
  valor: number;
  /** mostra os centavos (resultado do dia, valores pequenos) */
  centavos?: boolean;
  className?: string;
}) {
  const texto = formatarBRL(valor, { sinal: true, inteiro: !centavos });
  const corte = texto.search(/\d/);
  const prefixo = corte < 0 ? "" : texto.slice(0, corte).trim();
  const algarismos = corte < 0 ? texto : texto.slice(corte);
  return (
    <p className={cn("numero-grande", valor < 0 && "text-negativo", className)}>
      <span className={cn("mr-[0.18em] font-normal", valor >= 0 && "text-muted-foreground")}>{prefixo}</span>
      {algarismos}
    </p>
  );
}

/**
 * Os três ou quatro fatos que acompanham o número grande, em lista: nome à esquerda, valor à direita. Fica
 * colada no número, não do outro lado da tela. Um deles é sempre a maior queda ou o pior caso.
 */
export function Fatos({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("text-sm", className)}>{children}</dl>;
}

export function Fato({
  rotulo,
  info,
  infoTexto,
  children,
}: {
  rotulo: React.ReactNode;
  /** chave do glossário, só para termo que o leigo não conhece */
  info?: ChaveIndicador;
  infoTexto?: string;
  children: React.ReactNode;
}) {
  return (
    // o rótulo quebra em linhas e o número não encolhe: com uma nota longa no rótulo, o número era empurrado para
    // fora da tela no celular (25/11/2026, capital mínimo do robô sem medição de entradas)
    <div className="flex items-baseline justify-between gap-6 leading-7">
      <dt className="min-w-0 text-muted-foreground">
        {info ? (
          <RotuloComInfo chave={info} texto={infoTexto}>
            {rotulo}
          </RotuloComInfo>
        ) : (
          rotulo
        )}
      </dt>
      <dd className="shrink-0 text-right">{children}</dd>
    </div>
  );
}
