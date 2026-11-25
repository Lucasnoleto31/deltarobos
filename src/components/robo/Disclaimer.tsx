import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

interface Props {
  nomeRobo: string;
  texto: string;
  linkCta: string;
}

/**
 * A chamada "quero esse robô" (spec §8.2), em uma linha: a frase e o botão, com um fio em cima. Na página
 * do robô o botão subiu para o cabeçalho (ficha Mesa, 25/11/2026); aqui é para quem usa em outra tela (o
 * simulador). O aviso legal deixou de ser repetido aqui em 17/09/2026: o rodapé traz o mesmo texto em toda
 * página. A prop `texto` fica para não mexer em quem chama.
 */
export function Disclaimer({ nomeRobo, linkCta }: Props) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 border-t border-(--painel-fio) pt-5">
      <h2 className="text-[0.9375rem] font-medium">Licença do {nomeRobo}</h2>
      {linkCta ? (
        <a href={linkCta} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "h-9" })}>
          Quero esse robô
        </a>
      ) : (
        <Link href="/metodologia#como-comecar" className={buttonVariants({ className: "h-9" })}>
          Quero esse robô
        </Link>
      )}
    </section>
  );
}
