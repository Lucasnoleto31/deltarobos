import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * 404 de robô. Fica em /robos, não em /robos/[slug] (19/09/2026): o notFound() sai do layout de [slug],
 * e o not-found de um segmento só pega o que acontece abaixo do layout dele. Dentro de [slug] ele nunca
 * era usado, e a página saía com o 404 padrão do Next, em inglês.
 */
export default function RoboNaoEncontrado() {
  return (
    <div className="conteudo flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Robô não encontrado</h1>
      <p className="max-w-prose text-muted-foreground">
        Nenhum robô cadastrado tem esse endereço.
      </p>
      <Link href="/#robos" className={buttonVariants()}>
        Ver os robôs
      </Link>
    </div>
  );
}
