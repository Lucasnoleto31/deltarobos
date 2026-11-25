"use client";

import { cn } from "cn";
import { useState } from "react";
import { Valor } from "@/components/compartilhados/Valor";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { formatarBRL, formatarNumero } from "@/lib/formato";
import type { AnoDoHistorico, ResumoDoPeriodo } from "@/lib/stats/calendario";
import { ArquivosDoMes, mesComAno, nomeDoMes } from "./ArquivosDoMes";

interface Props {
  /** o histórico em anos e meses, do mais recente para o mais antigo (anosDoHistorico) */
  anos: AnoDoHistorico[];
  slug: string;
  /** o mês que o calendário está mostrando: leva o fio de item atual */
  mesEmVista: string;
  /** o mês de hoje: é o que aparece como "em andamento" */
  mesAtual: string;
  /** escolher um mês leva o calendário até ele */
  aoEscolher: (mes: string) => void;
  className?: string;
}

// A lista abre mostrando pelo menos estes meses: os anos mais recentes até completar. Ano mais antigo fica
// recolhido numa linha (o ano em números) e abre com um toque.
const MESES_A_VISTA = 6;

// As colunas de toda linha. No celular são duas, e a linha tem três andares: o nome e o resultado; os dias
// com ganho e a maior queda; os arquivos. Do tablet para cima vira uma linha de tabela. A largura de cada
// coluna não depende do conteúdo, e por isso as linhas alinham entre si sem ser uma <table>.
const COLUNAS =
  "grid-cols-[minmax(0,1fr)_auto] gap-x-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_8.5rem] md:gap-x-6";
// a linha sangra 12 px para cada lado, como as da página inicial: o texto alinha com o resto e o realce tem respiro
const LINHA = cn("grid", COLUNAS, "-mx-3 items-center gap-y-0.5 rounded-md px-3 py-3 md:py-0");
const NOME = "min-w-0 max-md:col-start-1 max-md:row-start-1";
const COM_GANHO = "min-w-0 text-[0.8125rem] text-muted-foreground max-md:col-start-1 max-md:row-start-2 md:text-right md:text-sm";
const QUEDA = "text-right text-[0.8125rem] whitespace-nowrap text-muted-foreground max-md:col-start-2 max-md:row-start-2 md:text-sm";
const RESULTADO = "text-right max-md:col-start-2 max-md:row-start-1";
const NO_FIM = "max-md:col-span-2 max-md:row-start-3 md:justify-self-end";
const ROTULO = "text-right text-[0.8125rem] text-sutil";

const emReais = (v: number) => formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });

/** "7 de 13 dias" (ou "meses") e a maior queda de dentro do período: as duas colunas do meio de toda linha. */
function MeioDaLinha({ comGanho, de, unidade, r }: { comGanho: number; de: number; unidade: [string, string]; r: ResumoDoPeriodo }) {
  return (
    <>
      <span className={COM_GANHO}>
        {formatarNumero(comGanho)} de {formatarNumero(de)} {de === 1 ? unidade[0] : unidade[1]}
        {/* no celular não há cabeçalho de coluna e o rótulo vai junto do número; com cabeçalho, fica só para o leitor de tela */}
        <span className="md:sr-only"> com ganho</span>
      </span>
      <span className={QUEDA}>
        {r.maiorQueda > 0 ? (
          <>
            <span className="md:sr-only">maior queda </span>
            {emReais(-r.maiorQueda)}
          </>
        ) : (
          <span className="text-sutil">
            <span className="md:sr-only">sem queda</span>
            <span aria-hidden className="max-md:hidden">
              nenhuma
            </span>
          </span>
        )}
      </span>
    </>
  );
}

/**
 * "Mês a mês", na aba Dia a dia (25/11/2026): cada mês com o resultado, os dias com ganho, a maior queda de
 * dentro do mês e os dois arquivos dele, "PDF" e "Planilha". É para cá que vai quem abria a aba Relatórios
 * (o site redireciona /robos/:slug/relatorios para #mes-a-mes).
 *
 * Tomou o lugar do mapa colorido de meses: com o resultado de cada mês na lista, o mapa repetia os mesmos
 * números logo acima. O que ele dava de visão do ano ficou na linha de cada ano: a soma, em quantos meses
 * ganhou e a maior queda de dentro do ano. Robô com muitos anos abre com os mais recentes e os outros
 * recolhidos, uma linha por ano.
 *
 * A lista é também o controle do calendário: o nome do mês é um botão que leva o calendário até ele (com
 * anos de histórico, voltar de mês em mês não chega lá), e o mês em vista leva o fio de item atual. Os
 * números vêm prontos de anosDoHistorico (lib/stats/calendario): nenhuma conta é feita aqui.
 */
export function MesAMes({ anos, slug, mesEmVista, mesAtual, aoEscolher, className }: Props) {
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => {
    const inicio = new Set<string>();
    let meses = 0;
    for (const a of anos) {
      if (meses >= MESES_A_VISTA) break;
      inicio.add(a.ano);
      meses += a.meses.length;
    }
    return inicio;
  });

  const alternar = (ano: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(ano)) novo.delete(ano);
      else novo.add(ano);
      return novo;
    });

  if (anos.length === 0) return null;
  // com um ano só não há o que recolher
  const recolhe = anos.length > 1;

  return (
    <Painel id="mes-a-mes" titulo="Mês a mês" apoio="com o relatório de cada mês em PDF e as operações em planilha" corpo="" className={className}>
      <div aria-hidden className={cn("hidden h-9 items-center border-b border-(--painel-fio) md:grid", COLUNAS)}>
        <span />
        <span className={ROTULO}>Com ganho</span>
        <span className={ROTULO}>Maior queda</span>
        <span className={ROTULO}>Resultado</span>
        <span className={ROTULO}>Arquivos</span>
      </div>

      {anos.map((a) => {
        const aberto = !recolhe || abertos.has(a.ano);
        const idMeses = `meses-de-${a.ano}`;
        const doAno = (
          <>
            <span className={cn(NOME, "text-[0.9375rem] font-medium")}>{a.ano}</span>
            <MeioDaLinha comGanho={a.mesesComGanho} de={a.meses.length} unidade={["mês", "meses"]} r={a} />
            <span className={RESULTADO}>
              <Valor valor={a.total} inteiro={Math.abs(a.total) >= 1000} className="text-[0.9375rem] font-medium" />
            </span>
            {recolhe ? (
              <span className={cn(NO_FIM, "text-[0.8125rem] max-md:mt-1.5")}>
                <span className={LINK_DO_PAINEL}>
                  {aberto ? "Recolher" : a.meses.length === 1 ? "Ver o mês" : `Ver os ${formatarNumero(a.meses.length)} meses`}
                </span>
              </span>
            ) : null}
          </>
        );

        return (
          <div key={a.ano} role="group" aria-label={`Meses de ${a.ano}`} className="border-b border-(--painel-fio)">
            {recolhe ? (
              <button
                type="button"
                onClick={() => alternar(a.ano)}
                aria-expanded={aberto}
                aria-controls={idMeses}
                className={cn(
                  LINHA,
                  "w-[calc(100%+1.5rem)] text-left outline-none transition-colors hover:bg-(--linha-hover) focus-visible:bg-(--linha-hover) focus-visible:ring-2 focus-visible:ring-ring/50 md:min-h-[3.25rem]",
                )}
              >
                {doAno}
              </button>
            ) : (
              <div className={cn(LINHA, "md:min-h-[3.25rem]")}>{doAno}</div>
            )}

            {aberto ? (
              <ul id={idMeses}>
                {a.meses.map((m) => {
                  const emVista = m.mes === mesEmVista;
                  return (
                    <li key={m.mes} className="border-t border-(--painel-fio)">
                      <div className={cn(LINHA, "transition-colors hover:bg-(--linha-hover) md:min-h-12")}>
                        <span className={cn(NOME, "flex flex-wrap items-baseline gap-x-2.5 text-sm")}>
                          <button
                            type="button"
                            onClick={() => aoEscolher(m.mes)}
                            aria-pressed={emVista}
                            aria-label={`Ver ${mesComAno(m.mes)} no calendário`}
                            className={cn(
                              // o alvo de toque cresce pelo ::after, sem o fio descer do texto
                              "relative border-b outline-none transition-colors after:absolute after:-inset-x-2 after:-inset-y-2.5 focus-visible:ring-2 focus-visible:ring-ring/50",
                              emVista ? "border-foreground font-medium" : "border-transparent hover:border-(--painel-fio-forte)",
                            )}
                          >
                            {nomeDoMes(m.mes)}
                          </button>
                          {m.mes === mesAtual ? <span className="text-[0.8125rem] text-sutil">em andamento</span> : null}
                        </span>
                        <MeioDaLinha comGanho={m.comGanho} de={m.dias} unidade={["dia", "dias"]} r={m} />
                        <span className={RESULTADO}>
                          <Valor valor={m.total} inteiro={Math.abs(m.total) >= 1000} className="text-sm" />
                        </span>
                        <ArquivosDoMes slug={slug} mes={m.mes} className={cn(NO_FIM, "max-md:mt-2.5")} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </Painel>
  );
}
