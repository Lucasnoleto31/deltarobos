"use client";

import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface RoboDoMenu {
  slug: string;
  nome: string;
  ativo: string;
}

interface Props {
  robos: RoboDoMenu[];
}

/**
 * "Robôs" no cabeçalho: um menu com cada robô, atalho para o detalhe de qualquer um a partir de
 * qualquer página (18/09/2026, Artur: "os robôs agora não ficou um atalho para ver o detalhe de cada
 * um"). Fecha ao escolher, ao clicar fora e com Esc. Aparece no celular também.
 */
export function MenuRobos({ robos }: Props) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const fechar = () => setAberto(false);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  if (robos.length === 0) return null;

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          aberto || pathname.startsWith("/robos/") ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Robôs
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", aberto && "rotate-180")} />
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label="Robôs"
          className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-xl bg-popover py-1 text-sm shadow-xl ring-1 ring-border motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150"
        >
          {robos.map((r) => {
            const atual = pathname.startsWith(`/robos/${r.slug}`);
            return (
              <Link
                key={r.slug}
                role="menuitem"
                href={`/robos/${r.slug}`}
                aria-current={atual ? "page" : undefined}
                onClick={fechar}
                className={cn(
                  "flex items-baseline justify-between gap-3 px-3 py-2 outline-none hover:bg-(--linha-hover) focus-visible:bg-(--linha-hover)",
                  atual && "font-medium",
                )}
              >
                <span>{r.nome}</span>
                <span className="text-xs text-muted-foreground">{r.ativo}</span>
              </Link>
            );
          })}
          <Link
            role="menuitem"
            href="/#robos"
            onClick={fechar}
            className="mt-1 flex items-center border-t border-(--painel-fio) px-3 py-2 text-muted-foreground outline-none hover:bg-(--linha-hover) hover:text-foreground focus-visible:bg-(--linha-hover)"
          >
            Todos os robôs
          </Link>
        </div>
      ) : null}
    </div>
  );
}
