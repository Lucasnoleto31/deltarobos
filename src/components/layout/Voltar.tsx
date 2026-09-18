import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Props {
  href: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * O caminho de volta no alto de toda página que não é a home (18/09/2026, Artur: "toda página precisa
 * ter uma maneira de voltar"). O logo do cabeçalho também leva à home, mas ninguém precisa adivinhar isso.
 */
export function Voltar({ href, children, className }: Props) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${className ?? ""}`}
    >
      <ArrowLeft aria-hidden className="size-4" />
      {children}
    </Link>
  );
}
