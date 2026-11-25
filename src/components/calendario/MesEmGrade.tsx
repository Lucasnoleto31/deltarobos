"use client";

import { cn } from "cn";
import { formatarBRL, formatarData, formatarNumero } from "@/lib/formato";
import type { DiaCalendario } from "@/lib/stats/calendario";

interface Props {
  /** as semanas do mês, já só de segunda a sexta */
  semanas: DiaCalendario[][];
  /** o nome do mês por extenso, para o leitor de tela */
  nomeDoMes: string;
  escolhido: string | null;
  hoje: string;
  /** de 0 a 1, o tamanho do resultado do dia na régua do histórico inteiro (escalaDeForca) */
  forca: (valor: number) => number;
  aoEscolher: (dia: string) => void;
}

const SEMANA = [
  { curto: "Seg", longo: "Segunda" },
  { curto: "Ter", longo: "Terça" },
  { curto: "Qua", longo: "Quarta" },
  { curto: "Qui", longo: "Quinta" },
  { curto: "Sex", longo: "Sexta" },
];

// cada dia é uma casa entre dois fios, de 60 px (19/09/2026: altura fixa e baixa; esticadas até o detalhe, as
// casas ficavam com 135 px e o número perdido no canto). No celular eram 56 px até 25/11/2026: "não operou" não
// cabe numa linha nos 56 px de largura útil da casa e precisa de duas. A cor do fio de cima vai à parte (FIO),
// porque no dia escolhido ele troca para a cor do texto e duas cores de borda na mesma casa disputariam
const CASA = "flex h-[3.75rem] min-w-0 flex-col border-t px-2 py-2 text-left sm:px-3";
const FIO = "border-(--painel-fio)";

/** Na casa do dia os centavos só aparecem em valor pequeno e quebrado: "+R$ 46,75", mas "+R$ 80" e "+R$ 1.342". */
function semCentavos(v: number): boolean {
  const a = Math.abs(v);
  return a >= 100 || Math.abs(a - Math.round(a)) < 0.005;
}

/** O valor dentro da casa do dia no celular: sem "R$" e sem espaço depois do sinal, para caber nos 70 px da casa. */
function curto(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${formatarNumero(Math.abs(v), semCentavos(v) ? 0 : 2)}`;
}

/**
 * O mês em casas, de segunda a sexta (ficha Mesa, 25/11/2026). Sem caixa por dia: cada semana é uma linha
 * entre dois fios, e a casa leva só o dia do mês, o resultado em verde ou vermelho e, embaixo, uma barra do
 * tamanho do resultado. A barra é o que sobrou do fundo colorido de antes (17/09/2026: "todo dia positivo
 * tinha o mesmo verde", a cor passou a seguir o tamanho do resultado): o tamanho continua na tela, agora no
 * comprimento, e o mês se lê de relance sem vinte quadrados pintados. A régua é o histórico inteiro, para
 * um mês poder ser comparado com outro.
 *
 * O dia escolhido leva o realce de linha e o fio de cima na cor do texto. Dia sem operação não é botão: fica
 * só o número, apagado, com "feriado" quando a bolsa não abriu e "não operou" quando a bolsa abriu e o robô
 * não fechou operação (25/11/2026; quem decide é gradeMes, em lib/stats/calendario, e só afirma quando dá
 * para saber). O motivo o sistema não sabe e a casa não inventa. O número de operações saiu da casa (está
 * no detalhe do dia, ao lado) e continua no nome que o leitor de tela lê.
 */
export function MesEmGrade({ semanas, nomeDoMes, escolhido, hoje, forca, aoEscolher }: Props) {
  return (
    // sangra 8 ou 12 px para cada lado, como as tabelas: o texto da primeira coluna alinha com o resto da
    // página e o realce do dia tem respiro
    <div role="group" aria-label={`Dias de ${nomeDoMes}`} className="-mx-2 border-b border-(--painel-fio) sm:-mx-3">
      <div aria-hidden className="grid grid-cols-5 pb-2 text-[0.8125rem] leading-none text-sutil">
        {SEMANA.map((s) => (
          <span key={s.curto} className="px-2 sm:px-3">
            <span className="sm:hidden">{s.curto}</span>
            <span className="max-sm:hidden">{s.longo}</span>
          </span>
        ))}
      </div>
      <div className="grid grid-cols-5">
        {semanas.flat().map((d) => {
          if (d.foraDoMes) return <div key={d.dia} aria-hidden className={cn(CASA, FIO)} />;

          const ehHoje = d.dia === hoje;
          const numero = (
            <span className={cn("text-[0.8125rem] leading-none", ehHoje && "font-medium text-foreground")}>
              {d.diaDoMes}
              {ehHoje ? <span className="font-normal text-sutil"> hoje</span> : null}
            </span>
          );

          if (d.valor === null) {
            // dia de semana em que a bolsa não abriu, ou pregão em que o robô não fechou operação
            const oQueHouve = !d.pregao ? "feriado" : d.naoOperou ? "não operou" : null;
            return (
              <div key={d.dia} className={cn(CASA, FIO, "text-sutil")}>
                {numero}
                {oQueHouve ? <span className="mt-1 text-xs leading-[1.1] sm:mt-1.5 sm:leading-none">{oQueHouve}</span> : null}
              </div>
            );
          }

          const valor = d.valor;
          const selecionado = d.dia === escolhido;
          return (
            <button
              key={d.dia}
              type="button"
              onClick={() => aoEscolher(d.dia)}
              aria-pressed={selecionado}
              aria-label={`${formatarData(d.dia)}: ${formatarBRL(valor, { sinal: true })} em ${formatarNumero(d.nOperacoes)} ${d.nOperacoes === 1 ? "operação" : "operações"}`}
              className={cn(
                CASA,
                "text-muted-foreground outline-none transition-colors hover:bg-(--linha-hover) focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                selecionado ? "border-foreground bg-(--linha-hover)" : FIO,
              )}
            >
              {numero}
              <span
                className={cn(
                  "mt-1.5 text-[0.8125rem] leading-none font-medium whitespace-nowrap sm:text-[0.9375rem]",
                  valor > 0 ? "text-positivo" : valor < 0 ? "text-negativo" : "text-muted-foreground",
                )}
              >
                <span className="sm:hidden">{curto(valor)}</span>
                <span className="max-sm:hidden">{formatarBRL(valor, { sinal: true, inteiro: semCentavos(valor) })}</span>
              </span>
              {valor !== 0 ? (
                <span
                  aria-hidden
                  className={cn("mt-auto block h-[3px]", valor > 0 ? "bg-positivo" : "bg-negativo")}
                  style={{ width: `${Math.max(6, Math.round(forca(valor) * 100))}%` }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
