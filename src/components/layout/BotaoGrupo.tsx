"use client";

import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

interface Props {
  href: string;
}

/**
 * A pílula "Como começar" do cabeçalho: vai direto para o WhatsApp da equipe (18/09/2026, Artur: "o como
 * começar deve redirecionar para o nosso número"). Some na home, onde o hero já tem o mesmo botão logo
 * abaixo (o Artur cortou o "Ver os robôs" por isso em 17/09/2026), e no celular, onde não cabe.
 * Em 19/09/2026 passou a usar o buttonVariants: era branco/preto escrito à mão e ficou de fora quando o
 * botão principal virou o verde da Quants, então o mesmo botão saía de duas cores conforme a tela.
 */
export function BotaoGrupo({ href }: Props) {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants(), "hidden sm:inline-flex")}
    >
      Como começar
    </a>
  );
}
