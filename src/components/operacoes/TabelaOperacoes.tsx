"use client";

import { useEffect, useState } from "react";
import { Valor } from "@/components/compartilhados/Valor";
import { LinhaOperacao } from "@/components/robo/LinhaOperacao";
import { formatarDataCurta, formatarDuracao, formatarHora, formatarMfeMae, formatarPontos, formatarPreco, rotuloLado } from "@/lib/formato";
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
}

export function TabelaOperacoes({ itens, slug, dia, aoVivo, filtrado }: Props) {
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
        // o evento é a linha inteira de operacoes_publico: vem com MFE/MAE (e é reemitido quando o EA os manda)
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

  if (lista.length === 0) {
    return (
      <p className="painel px-4 py-8 text-center text-sm text-muted-foreground">
        {filtrado ? "Nenhuma operação com esse filtro." : "Sem operações fechadas ainda."}
      </p>
    );
  }

  return (
    <>
      {/* celular (19/09/2026): a tabela de doze colunas deixava o líquido uns 600 px à direita, sem sinal
          de rolagem. Duas linhas por operação, como na visão geral; bruto, custos e símbolo ficam na
          tabela do computador e no CSV */}
      <ul className="painel overflow-hidden sm:hidden">
        {lista.map((o) => (
          <LinhaOperacao key={o.id} operacao={o} comData />
        ))}
      </ul>

      {/* 20/09/2026: o px-3 das doze colunas pedia 1.011 px e o .conteudo passou a ter 992 px em 1280,
          onde agora há a barra lateral de navegação — o "Líquido /ct" ficava cortado na última casa
          decimal, e valor em dinheiro cortado lê errado. Com px-2.5 a tabela pede 963 px e fecha em
          1280 e também em 1024, onde ela já estava cortada antes desta leva.
          22/09/2026: a coluna "MFE / MAE" (EA 1.1.0) só entra a partir de xl. Em lg não cabe: o .conteudo
          é max-w-6xl (1.152 − 48 px de padding = 1.104 px; em 1024 são 976 px), as doze colunas pedem
          963–994 px e a célula "+1.320 / −185" mais ~120 px; com " pts" na célula e "(pts)" no cabeçalho
          a tabela pedia 1.145 px e rolava de lado com o "Líquido /ct" fora da tela em qualquer largura.
          Sem a unidade na célula (ela está no title e a coluna "Pontos /ct" ao lado já a diz) fica na
          casa dos 1.090 px, que cabem em xl. Abaixo de xl ela fica no CSV e na lista do celular. */}
      <div className="hidden overflow-x-auto painel sm:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="[&>th]:px-2.5 [&>th]:py-2 [&>th]:font-medium">
              <th>Data</th>
              <th>Abertura</th>
              <th>Fechamento</th>
              <th>Duração</th>
              <th>Símbolo</th>
              <th>Lado</th>
              <th className="text-right">Entrada</th>
              <th className="text-right">Saída</th>
              <th className="text-right">Pontos /ct</th>
              <th className="hidden text-right xl:table-cell" title="MFE / MAE: máxima excursão a favor e contra, em pontos por contrato, medidas no MetaTrader">
                MFE / MAE
              </th>
              <th className="text-right">Bruto /ct</th>
              <th className="text-right">Custos /ct</th>
              <th className="text-right">Líquido /ct</th>
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t">
            {lista.map((o) => {
              const excursao = excursaoDaOperacao(o);
              return (
              <tr key={o.id} className="tabular-nums [&>td]:px-2.5 [&>td]:py-2">
                <td>{formatarDataCurta(o.dia_pregao)}</td>
                <td>{formatarHora(o.abertura_em)}</td>
                <td>{formatarHora(o.fechamento_em)}</td>
                <td className="whitespace-nowrap text-muted-foreground">{o.origem === "manual" ? "–" : formatarDuracao(o.duracao_seg)}</td>
                <td>{o.simbolo}</td>
                {/* 19/09/2026: o lado fica neutro; verde e vermelho só no resultado */}
                <td>{rotuloLado(o.lado)}</td>
                <td className="text-right">{formatarPreco(o.preco_entrada)}</td>
                <td className="text-right">{formatarPreco(o.preco_saida)}</td>
                <td className="text-right">
                  <Valor valor={o.pontos_por_contrato} unidade="pontos" />
                </td>
                <td className="hidden text-right whitespace-nowrap text-muted-foreground xl:table-cell">
                  {excursao ? (
                    <span title={`${formatarMfeMae(excursao.mfe, excursao.mae)}${excursao.parcial ? " · medição parcial: o coletor subiu com a operação já aberta" : ""}`}>
                      {formatarPontos(excursao.mfe, true)} / {formatarPontos(excursao.mae, true)}
                      {excursao.parcial ? "*" : ""}
                    </span>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="text-right">
                  <Valor valor={o.resultado_brl_por_contrato} colorir={false} />
                </td>
                <td className="text-right text-muted-foreground">
                  <Valor valor={-o.custos_brl_por_contrato} colorir={false} className="text-muted-foreground" />
                </td>
                <td className="text-right font-medium">
                  <Valor valor={o.resultado_brl_por_contrato - o.custos_brl_por_contrato} />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
