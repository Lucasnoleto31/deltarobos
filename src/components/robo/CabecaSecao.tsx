import { ChevronRight } from "lucide-react";
import Link from "next/link";

interface Props {
  /** o id do h2, para o aria-labelledby da seção */
  id: string;
  titulo: React.ReactNode;
  /** a ação da seção, à direita ("Ver desempenho completo", "Lista completa") */
  acao?: { href: string; rotulo: string };
}

/**
 * O título de seção da visão geral do robô (13/10/2026, mídia kit da Zeve): h2 em text-lg semibold, o mesmo
 * de "Distribuição" no Desempenho, e a ação à direita como link no acento (text-info: 5,0:1 sobre o chão claro,
 * 6,2:1 sobre o marinho). Antes cada seção tinha o seu desenho: botão contornado no resumo e nas últimas
 * operações, rótulo miúdo em caixa alta na Transparência.
 */
export function CabecaSecao({ id, titulo, acao }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {titulo}
      </h2>
      {acao ? (
        <Link
          href={acao.href}
          className="-mx-1 inline-flex min-h-8 items-center gap-0.5 rounded-md px-1 text-sm font-medium text-info underline-offset-4 hover:underline"
        >
          {acao.rotulo}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
