/** Grupo sem a casca do site (barra lateral, fita e rodapé): a tela ao vivo, que ocupa a janela inteira, e o embed. */
export default function LayoutTelaCheia({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
