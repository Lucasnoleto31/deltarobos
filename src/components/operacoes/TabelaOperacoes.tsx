"use client";

import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarData, formatarDuracao, formatarHora, formatarPontos, formatarPreco, rotuloLado } from "@/lib/formato";
import { excursaoDaOperacao } from "@/lib/stats/exposicao";
import { supabaseBrowser } from "@/lib/supabase/cliente";
import type { OperacaoPublica } from "@/lib/tipos";

interface Props {
  itens: OperacaoPublica[];
  slug: string;
  dia: string;
  /** página 1 sem filtro: operações novas de hoje entram no topo em tempo real */
  aoVivo: boolean;
  /** há filtro na URL: muda a frase da lista vazia */
  filtrado: boolean;
  /** o filtro já é de compra ou de venda: o título da aba diz o lado, e a coluna só repetiria */
  semLado?: boolean;
  className?: string;
}

/** Pontos com sinal e unidade: "+150 pts". */
function pontos(valor: number): string {
  return `${formatarPontos(valor, true)} pts`;
}

const SEM_MEDIDA = <span className="text-sutil">–</span>;

/**
 * A tabela de operações (ficha Mesa, 25/11/2026): é a tela inteira da aba. Classe .tbl, sem caixa, na
 * largura toda, linha de 40 px (são 50 por página, de milhares). Os cabeçalhos são palavras de todo dia:
 * "Pior momento" no lugar de MAE, com a explicação do glossário no próprio rótulo. Só a coluna Resultado
 * leva verde e vermelho; os pontos ficam neutros, para o olho ter uma coluna só.
 *
 * Revisão de 25/11/2026 (DESIGN.md, seção 9): saiu a coluna "Melhor momento" (MFE). Quanto a operação
 * chegou a ganhar antes de fechar não ajuda a decidir; quanto chegou a perder, sim, e por isso o pior
 * momento ficou. O melhor momento de cada operação continua na planilha do mês.
 *
 * O que saiu da tabela e continua no arquivo que se baixa no pé: símbolo do contrato, resultado antes dos
 * custos e os custos de cada operação. A coluna Resultado é o valor já descontado.
 *
 * Uma tabela só, em qualquer largura. Antes havia duas listas no HTML (19/09/2026: no celular a tabela de
 * doze colunas deixava o resultado uns 600 px à direita, sem sinal de rolagem, e virou uma lista de duas
 * linhas). Agora a tabela rola de lado dentro do próprio bloco e a coluna Resultado fica presa à direita:
 * em 375 px veem-se a data, o horário e o resultado, e o resto passa por baixo. Vale também para o que a
 * conta de 20/09/2026 ensinou: valor em dinheiro cortado na borda lê errado, então ele nunca sai da tela.
 * O fio à esquerda da coluna presa só aparece quando há o que rolar.
 *
 * Coluna que a página inteira não tem como preencher não aparece: robô de histórico importado não tem
 * preço de entrada e saída, duração nem pior momento, e ficaria com fileiras de traços.
 */
export function TabelaOperacoes({ itens, slug, dia, aoVivo, filtrado, semLado = false, className }: Props) {
  // novas/removidas chegam pelo realtime e zeram quando o servidor manda outra página
  const [base, setBase] = useState(itens);
  const [novas, setNovas] = useState<OperacaoPublica[]>([]);
  const [removidas, setRemovidas] = useState<number[]>([]);
  if (base !== itens) {
    setBase(itens);
    setNovas([]);
    setRemovidas([]);
  }

  useEffect(() => {
    if (!aoVivo) return;
    let sb: ReturnType<typeof supabaseBrowser>;
    try {
      sb = supabaseBrowser();
    } catch {
      return;
    }
    const canal = sb
      .channel(`robo:${slug}`, { config: { private: true } })
      .on("broadcast", { event: "operacao" }, ({ payload }) => {
        // o evento é a linha inteira de operacoes_publico: vem com o pior momento (e é reemitido quando o EA o manda)
        const op = payload as OperacaoPublica;
        if (op.dia_pregao !== dia) return;
        setNovas((l) => [op, ...l.filter((x) => x.id !== op.id)]);
      })
      .on("broadcast", { event: "operacao_removida" }, ({ payload }) => {
        const { id } = payload as { id: number };
        setRemovidas((r) => [...r, id]);
      })
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
  }, [aoVivo, slug, dia]);

  const lista = [...novas.filter((n) => !itens.some((i) => i.id === n.id)), ...itens].filter(
    (o) => !removidas.includes(o.id),
  );
  const vazia = lista.length === 0;

  // a tabela passa da largura do bloco? Só aí a coluna presa ganha o fio que a separa do que rola por baixo
  const molduraRef = useRef<HTMLDivElement>(null);
  const [rola, setRola] = useState(false);
  useEffect(() => {
    const moldura = molduraRef.current;
    if (!moldura || typeof ResizeObserver === "undefined") return;
    // o observador chama uma vez assim que começa a observar, com a medida inicial
    const observador = new ResizeObserver(() => setRola(moldura.scrollWidth > moldura.clientWidth + 1));
    observador.observe(moldura);
    if (moldura.firstElementChild) observador.observe(moldura.firstElementChild);
    return () => observador.disconnect();
  }, [vazia]);

  if (vazia) {
    return (
      <p className={cn("py-6 text-sm text-muted-foreground", className)}>
        {filtrado ? "Nenhuma operação com esse filtro." : "Este robô ainda não tem operações fechadas."}
      </p>
    );
  }

  const linhas = lista.map((o, i) => ({
    o,
    excursao: excursaoDaOperacao(o),
    // a data só vem na cor do texto na primeira operação de cada pregão: dá para ver onde o dia vira
    repeteODia: i > 0 && lista[i - 1].dia_pregao === o.dia_pregao,
  }));
  const temPrecos = lista.some((o) => o.preco_entrada !== null || o.preco_saida !== null);
  const temDuracao = lista.some((o) => o.origem !== "manual");
  const temPiorMomento = linhas.some((l) => l.excursao !== null);
  const temParcial = linhas.some((l) => l.excursao?.parcial);

  const presa = cn("sticky right-0 bg-background", rola && "border-l");

  return (
    <div className={className}>
      <div
        ref={molduraRef}
        // relative: o texto só para leitor de tela (sr-only, que é position absolute) fica preso aqui dentro.
        // Solto, ele escapa da rolagem do bloco e estica a página inteira no celular (o caso de 24/09/2026).
        className="tbl-moldura relative"
        // região que rola precisa receber foco para quem usa só o teclado
        {...(rola ? { tabIndex: 0, role: "region", "aria-label": "Tabela de operações, rola de lado" } : {})}
      >
        {/* border-separate: com as bordas fundidas (o padrão da .tbl) o fio não acompanha a célula presa */}
        <table className="tbl border-separate border-spacing-0 [&_td]:h-10">
          <caption className="sr-only">Operações fechadas, da mais recente para a mais antiga</caption>
          <thead>
            <tr>
              {/* 1%: as primeiras colunas ficam do tamanho do texto e a largura que sobra vai para os números */}
              <th className="w-[1%]">Data</th>
              <th className="w-[1%]">Horário</th>
              {semLado ? null : <th className="w-[1%]">Lado</th>}
              {temPrecos ? (
                <>
                  <th className="num">Entrada</th>
                  <th className="num">Saída</th>
                </>
              ) : null}
              {temDuracao ? <th className="num">Duração</th> : null}
              {temPiorMomento ? (
                <th className="num">
                  <RotuloComInfo chave="mae">Pior momento</RotuloComInfo>
                </th>
              ) : null}
              <th className="num">Pontos</th>
              <th className={cn("num", presa)}>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ o, excursao, repeteODia }) => {
              const importada = o.origem === "manual";
              const parcial = excursao?.parcial ? (
                <>
                  <span aria-hidden>*</span>
                  <span className="sr-only"> (medição parcial)</span>
                </>
              ) : null;
              return (
                <tr key={o.id}>
                  <td className={cn("whitespace-nowrap", repeteODia && "text-muted-foreground")}>{formatarData(o.dia_pregao)}</td>
                  {/* histórico importado não traz a hora da entrada: fica só a da saída */}
                  <td className="whitespace-nowrap">
                    {importada ? formatarHora(o.fechamento_em) : `${formatarHora(o.abertura_em)} – ${formatarHora(o.fechamento_em)}`}
                  </td>
                  {/* 19/09/2026: o lado fica neutro; verde e vermelho só no resultado */}
                  {semLado ? null : <td className="text-muted-foreground">{rotuloLado(o.lado)}</td>}
                  {temPrecos ? (
                    <>
                      <td className="num text-muted-foreground">{formatarPreco(o.preco_entrada)}</td>
                      <td className="num text-muted-foreground">{formatarPreco(o.preco_saida)}</td>
                    </>
                  ) : null}
                  {temDuracao ? <td className="num text-muted-foreground">{importada ? SEM_MEDIDA : formatarDuracao(o.duracao_seg)}</td> : null}
                  {temPiorMomento ? (
                    <td className="num text-muted-foreground">
                      {excursao ? (
                        <>
                          {pontos(excursao.mae)}
                          {parcial}
                        </>
                      ) : (
                        SEM_MEDIDA
                      )}
                    </td>
                  ) : null}
                  <td className="num text-muted-foreground">{pontos(o.pontos_por_contrato)}</td>
                  {/* o fundo da célula presa é utilitário e venceria o realce de linha da .tbl: o realce vem junto */}
                  <td className={cn("num font-medium [tr:hover>&]:bg-(--linha-hover)", presa)}>
                    <Valor valor={o.resultado_brl_por_contrato - o.custos_brl_por_contrato} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {temParcial ? (
        <p className="mt-3 text-[0.8125rem] text-pretty text-muted-foreground">
          * A medição começou com a operação já aberta: o pior momento pode ter ido além do que aparece.
        </p>
      ) : null}
    </div>
  );
}
