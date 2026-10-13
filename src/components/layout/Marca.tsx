import { cn } from "cn";
import { Simbolo } from "@/components/marca/Simbolo";

interface Props {
  className?: string;
}

/**
 * A marca do cabeçalho e do rodapé (13/10/2026, mídia kit da Zeve): o "Z" no azul do acento e o nome, o
 * mesmo desenho nos dois lugares. O símbolo novo tem 320 x 234 (1,37:1), bem mais largo que o brasão da
 * Quants: com a altura de antes (28 px) ele chegava a 38 px de largura e pesava mais que o nome. Com 20 px de
 * altura fica com 27 px de largura, e o traço ocupa a mesma faixa das maiúsculas do nome.
 */
export function Marca({ className }: Props) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <Simbolo aria-hidden className="h-5 w-auto shrink-0" />
      <span>
        Quants <span className="text-muted-foreground">Robôs</span>
      </span>
    </span>
  );
}
