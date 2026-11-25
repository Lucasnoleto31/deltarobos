import { cn } from "cn";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";

const fmtMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const fmtMesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

const doMes = (mes: string) => new Date(`${mes}-01T12:00:00Z`);

/** "Novembro", a partir de "2026-11". */
export function nomeDoMes(mes: string): string {
  const nome = fmtMes.format(doMes(mes));
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** "novembro de 2026", a partir de "2026-11": para o meio de uma frase e para o leitor de tela. */
export function mesComAno(mes: string): string {
  return fmtMesAno.format(doMes(mes));
}

/**
 * Onde estão os dois arquivos de um mês: o relatório em PDF e as operações em planilha (CSV), gerados na
 * hora pelas rotas /api/relatorios. Um lugar só, para a aba Dia a dia e o pé da aba Operações apontarem
 * para o mesmo endereço.
 */
export function arquivosDoMes(slug: string, mes: string): { pdf: string; planilha: string } {
  const base = `/api/relatorios/${slug}/${mes}`;
  return { pdf: `${base}/pdf`, planilha: `${base}/csv` };
}

// o texto é pequeno: o ::after aumenta a área de toque sem mexer no desenho
const ELO = cn(LINK_DO_PAINEL, "relative after:absolute after:-inset-x-2 after:-inset-y-2.5");

/**
 * Os dois arquivos de um mês, em texto com fio embaixo: "PDF" e "Planilha" (25/11/2026). Eram a aba
 * Relatórios, que saiu: agora ficam na linha de cada mês da aba Dia a dia e no pé da aba Operações. O nome
 * que o leitor de tela lê diz o mês e o que é cada arquivo; só existem para mês com operação fechada.
 */
export function ArquivosDoMes({ slug, mes, className }: { slug: string; mes: string; className?: string }) {
  const { pdf, planilha } = arquivosDoMes(slug, mes);
  const quando = mesComAno(mes);
  return (
    <span className={cn("flex gap-x-5 text-[0.8125rem]", className)}>
      <a href={pdf} aria-label={`Relatório de ${quando} em PDF`} className={ELO}>
        PDF
      </a>
      <a href={planilha} aria-label={`Operações de ${quando} em planilha (CSV)`} className={ELO}>
        Planilha
      </a>
    </span>
  );
}
