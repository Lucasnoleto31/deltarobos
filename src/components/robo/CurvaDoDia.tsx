"use client";

import { useId, useMemo } from "react";
import { tomDe, type ConteudoDaDica } from "@/components/graficos/base";
import {
  AmostraDaLinha,
  CURVA_POR_OPERACAO,
  DesenhoDaCurva,
  MolduraProfit,
  type PontoDoDesenho,
} from "@/components/graficos/CurvaProfit";
import { formatarBRL, formatarDuracao, formatarHora, formatarNumero, formatarPontos, formatarPreco, rotuloLado } from "@/lib/formato";
import type { OperacaoPublica } from "@/lib/tipos";

interface Props {
  /** operações fechadas hoje, em ordem de fechamento */
  operacoes: readonly OperacaoPublica[];
}

// mesmo teto da curva de capital: acima disso cada coluna vira uma fatia de operações
const MAX_COLUNAS = 240;
const reais = (v: number) => formatarBRL(v, { sinal: true });

/**
 * O dia em curva, operação a operação, no lugar do tabelão (17/09/2026, pedido do Artur: "essa visão
 * geral com esse tabelão não está legal"). Num dia de 345 operações a tabela não deixava ver o dia;
 * a curva mostra de relance quando subiu, quando devolveu e onde está agora, e cada ponto abre a
 * operação inteira na dica: hora, lado, entrada e saída, duração, pontos, resultado e o acumulado.
 */
export function CurvaDoDia({ operacoes }: Props) {
  const id = `dia-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const { pontos, rotulosX } = useMemo(() => {
    const n = operacoes.length;
    let acumulado = 0;
    let pico = 0;
    const brutos = operacoes.map((o, i) => {
      const liquido = o.resultado_brl_por_contrato - o.custos_brl_por_contrato;
      acumulado += liquido;
      pico = Math.max(pico, acumulado);
      return { o, ordem: i + 1, liquido, acumulado, drawdown: Math.min(0, acumulado - pico), posicao: (i + 1) / n };
    });

    const tamanho = n / MAX_COLUNAS;
    const fatias =
      n <= MAX_COLUNAS
        ? brutos.map((b) => [b])
        : Array.from({ length: MAX_COLUNAS }, (_, k) => {
            const de = Math.floor(k * tamanho);
            return brutos.slice(de, Math.max(de + 1, Math.floor((k + 1) * tamanho)));
          });

    const pontosDoDia = fatias.map((fatia): PontoDoDesenho => {
      const primeiro = fatia[0];
      const ultimo = fatia[fatia.length - 1];
      const drawdown = fatia.reduce((m, b) => Math.min(m, b.drawdown), 0);
      let dica: ConteudoDaDica;
      if (fatia.length === 1) {
        const { o } = ultimo;
        const temPrecos = o.preco_entrada !== null && o.preco_saida !== null;
        dica = {
          titulo: `${formatarHora(o.fechamento_em)} · ${rotuloLado(o.lado)}`,
          subtitulo: `Operação ${formatarNumero(ultimo.ordem)} de ${formatarNumero(n)} · ${formatarDuracao(o.duracao_seg)}`,
          linhas: [
            ...(temPrecos
              ? [{ rotulo: "Entrada e saída", valor: `${formatarPreco(o.preco_entrada)} → ${formatarPreco(o.preco_saida)}` }]
              : []),
            { rotulo: "Pontos", valor: `${formatarPontos(o.pontos_por_contrato, true)} pts`, tom: tomDe(o.pontos_por_contrato) },
            { rotulo: "Resultado", valor: reais(ultimo.liquido), tom: tomDe(ultimo.liquido) },
            { rotulo: "Acumulado do dia", valor: reais(ultimo.acumulado), tom: tomDe(ultimo.acumulado) },
          ],
        };
      } else {
        const valor = fatia.reduce((s, b) => s + b.liquido, 0);
        dica = {
          titulo: `${formatarHora(primeiro.o.fechamento_em)} a ${formatarHora(ultimo.o.fechamento_em)}`,
          subtitulo: `Operações ${formatarNumero(primeiro.ordem)} a ${formatarNumero(ultimo.ordem)} de ${formatarNumero(n)}`,
          linhas: [
            { rotulo: "Neste trecho", valor: reais(valor), tom: tomDe(valor) },
            { rotulo: "Acumulado do dia", valor: reais(ultimo.acumulado), tom: tomDe(ultimo.acumulado) },
          ],
        };
      }
      return { posicao: ultimo.posicao, acumulado: ultimo.acumulado, drawdown, dica };
    });

    // cinco horários espaçados por igual: a hora da operação que está naquela altura do eixo
    const marcas = n === 0 ? [] : Array.from({ length: Math.min(5, n) }, (_, i) => {
      const f = i / Math.min(5, n);
      return { x: f * 100, rotulo: formatarHora(operacoes[Math.min(n - 1, Math.floor(f * n))].fechamento_em) };
    });
    return { pontos: pontosDoDia, rotulosX: marcas.filter((m, i) => i === 0 || m.rotulo !== marcas[i - 1].rotulo) };
  }, [operacoes]);

  if (pontos.length === 0) return null;

  return (
    <MolduraProfit
      titulo="Resultado do dia, operação a operação"
      legenda={
        <span className="inline-flex items-center gap-1.5">
          <AmostraDaLinha cores={CURVA_POR_OPERACAO} />
          1 contrato, líquido · passe o mouse ou toque para ver a operação
        </span>
      }
    >
      <DesenhoDaCurva
        id={id}
        pontos={pontos}
        cores={CURVA_POR_OPERACAO}
        altura={190}
        rotulosX={rotulosX}
        formatarEixo={(v) => formatarNumero(v, 0)}
        rotuloVertical="Saldo do dia (R$)"
        rotuloAria="Resultado acumulado de hoje, operação a operação"
      />
    </MolduraProfit>
  );
}
