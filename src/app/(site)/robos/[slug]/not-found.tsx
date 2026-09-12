import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function RoboNaoEncontrado() {
  return (
    <div className="conteudo flex flex-col items-center gap-4 py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Robô não encontrado</h1>
      <p className="max-w-prose text-muted-foreground">
        Esse endereço não corresponde a nenhum robô cadastrado. Veja a lista completa na home.
      </p>
      <Link href="/#robos" className={buttonVariants()}>
        Ver os robôs
      </Link>
    </div>
  );
}
