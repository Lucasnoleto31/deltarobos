import type { Metadata } from "next";
import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página não encontrada" };

/**
 * 404 do site inteiro (24/09/2026, varredura: um endereço errado caía no "404 · This page could not be
 * found." do Next, em inglês e sem marca). Fica na raiz do app, então não passa pelo layout do site — sem
 * cabeçalho nem rodapé, que dependem dos parâmetros do banco; a marca e o caminho de volta estão aqui.
 * O 404 de robô continua em (site)/robos/not-found.tsx, dentro do layout.
 */
export default function PaginaNaoEncontrada() {
  return (
    <main className="conteudo flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <Link href="/" className="inline-flex items-center gap-2 font-semibold">
        <Simbolo aria-hidden className="h-5 w-auto" /> Quants Robôs
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="max-w-prose text-muted-foreground">Não há nada neste endereço.</p>
      <Link href="/" className={buttonVariants()}>
        Ir para o início
      </Link>
    </main>
  );
}
