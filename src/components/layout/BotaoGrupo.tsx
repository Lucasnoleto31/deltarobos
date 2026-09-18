"use client";

import { usePathname } from "next/navigation";

interface Props {
  href: string;
}

/**
 * A pílula "Entrar no grupo" do cabeçalho. Some na home, onde o hero já tem o mesmo botão logo abaixo
 * (o Artur cortou o "Ver os robôs" por isso em 17/09/2026), e no celular, onde não cabe.
 */
export function BotaoGrupo({ href }: Props) {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hidden h-8 items-center rounded-full bg-foreground px-3.5 text-sm font-medium text-background transition-opacity hover:opacity-85 sm:inline-flex"
    >
      Entrar no grupo
    </a>
  );
}
