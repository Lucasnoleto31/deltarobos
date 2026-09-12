/** Grupo sem cabeçalho nem rodapé: tela ao vivo e embed. */
export default function LayoutTelaCheia({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
