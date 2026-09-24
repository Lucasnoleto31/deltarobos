"use client";

import { useMemo, useState } from "react";
import { HaQuanto } from "@/components/compartilhados/HaQuanto";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarHora, formatarNumero, formatarPreco, rotuloLado } from "@/lib/formato";
import { mepMenDoDia } from "@/lib/stats/exposicao";
import { brlParaPontos } from "@/lib/stats/normalizacao";
import { horarioDaJanela } from "@/lib/stats/saldo-dia";
import { CurvaDoDia } from "./CurvaDoDia";
import { LinhaOperacao } from "./LinhaOperacao";
import { OperacoesEmAberto } from "./OperacoesEmAberto";
import { usePregaoAberto, useRobo } from "./RoboAoVivoProvider";

// Quantas operações aparecem em lista antes do "mostrar as outras". O dia inteiro está na curva
// logo acima; a lista é só o que acabou de acontecer. Num dia de 284 operações a tabela inteira
// tinha 16.600 px no celular, e os KPIs só apareciam umas vinte telas abaixo (17/09/2026).
const VISIVEIS = 5;

// o "o que é" do MEP/MEN medidos pelo coletor (22/09/2026); o texto padrão do glossário fala das duas fontes,
// e aqui a fonte é uma só. "Parcial" explica o que falta
const PARCIAL = " Parcial: o coletor subiu com o dia já em andamento e pode ter perdido um extremo anterior.";
const TEXTO_MEP_EA = (parcial: boolean) =>
  `O ponto mais alto que o saldo de hoje alcançou, por contrato e já com custos, medido no MetaTrader 5 a cada movimento do preço, com a posição aberta: o mesmo número do Profit.${parcial ? PARCIAL : ""}`;
const TEXTO_MEN_EA = (parcial: boolean) =>
  `O ponto mais baixo que o saldo de hoje alcançou, por contrato e já com custos, medido no MetaTrader 5 a cada movimento do preço, com a posição aberta: o quanto o dia chegou a ficar no prejuízo.${parcial ? PARCIAL : ""}`;

/**
 * O "Hoje" do painel de resultado (spec §8.2): resultado do dia, posição aberta e as operações
 * entrando na hora. Em 18/09/2026 a lista saiu de baixo da curva e passou a ocupar a largura toda:
 * com ela na coluna da direita, a esquerda terminava uma tela antes ("melhore a questão da assimetria").
 */
export function HojeAoVivo() {
  const { estado, robo, pregao, hoje } = useRobo();
  const aberto = usePregaoAberto();
  // sem relógio aqui (18/09/2026): o "aberta há …" anda sozinho no HaQuanto e o painel só
  // renderiza de novo quando chega operação ou posição
  const [todas, setTodas] = useState(false);

  const ops = estado.operacoes;
  const pontos = ops.reduce((s, o) => s + o.pontos_por_contrato, 0);
  const bruto = ops.reduce((s, o) => s + o.resultado_brl_por_contrato, 0);
  const custos = ops.reduce((s, o) => s + o.custos_brl_por_contrato, 0);
  const liquido = bruto - custos;
  const gains = ops.filter((o) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato > 0).length;
  // MEP/MEN de hoje medidos pelo EA 1.1.0 tick a tick (22/09/2026), líquidos como o número grande: o custo
  // de cada saída feita até o extremo. Vem da view no HTML e chega atualizado pelo evento "coleta"; sem
  // medição (EA antigo, sem coletor, dia sem operação) a linha não aparece, nada de número por fechamento
  // aqui: a curva ao lado já mostra o dia operação a operação
  const mepMen = useMemo(
    () => mepMenDoDia(estado.exposicaoHoje, robo.custo_por_contrato, robo.valor_ponto_brl, "liquido", "brl"),
    [estado.exposicaoHoje, robo.custo_por_contrato, robo.valor_ponto_brl],
  );
  // A série do saldo de hoje medida pelo EA 1.1.2 (23/09/2026): só depois de a rota responder (carregado) e
  // com balde; até lá, e nos dias sem série, a curva por fechamento. O eixo do tempo é o horário do robô,
  // ou o do pregão do ativo; memoizado porque a CurvaDoDia é memo e compara por referência
  const horario = useMemo(() => horarioDaJanela(robo, pregao), [robo, pregao]);
  const temSerie = estado.saldoHoje.carregado && estado.saldoHoje.baldes.length > 0;

  // a mais recente em cima; as novas entram no topo mesmo com a lista recolhida
  const recentes = [...ops].reverse();
  const mostradas = todas ? recentes : recentes.slice(0, VISIVEIS);
  const escondidas = recentes.length - mostradas.length;

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr] lg:items-start">
        {/* resultado do dia + posição */}
        <div className="space-y-5">
          {/* sem rótulo em cima do número (19/09/2026): o título do painel já diz "Hoje" */}
          <div>
            <p className="text-4xl font-semibold tracking-tight sm:text-5xl">
              <Valor valor={liquido} />
            </p>
            <p className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
              <Valor valor={pontos} unidade="pontos" colorir={false} className="text-foreground" />
              <span className="tabular-nums">
                {formatarNumero(ops.length)} {ops.length === 1 ? "operação" : "operações"}
              </span>
              {ops.length > 0 ? (
                <span className="tabular-nums">
                  {formatarNumero(gains)}/{formatarNumero(ops.length)} gains
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Por contrato, líquido de custos (bruto <Valor valor={bruto} colorir={false} className="text-muted-foreground" />).
            </p>
          </div>

          {mepMen ? (
            <div>
              <p className="mb-2 text-sm font-medium">Exposição do dia</p>
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted-foreground">
                    <RotuloComInfo chave="mep" texto={TEXTO_MEP_EA(mepMen.parcial)}>MEP</RotuloComInfo>
                  </dt>
                  <dd className="font-semibold">
                    <Valor valor={mepMen.mep} />
                    {mepMen.mep > 0 && mepMen.mepEm ? (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">às {formatarHora(mepMen.mepEm)}</span>
                    ) : null}
                  </dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted-foreground">
                    <RotuloComInfo chave="men" texto={TEXTO_MEN_EA(mepMen.parcial)}>MEN</RotuloComInfo>
                  </dt>
                  <dd className="font-semibold">
                    <Valor valor={mepMen.men} />
                    {mepMen.men < 0 && mepMen.menEm ? (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">às {formatarHora(mepMen.menEm)}</span>
                    ) : null}
                  </dd>
                </div>
              </dl>
              <p className="mt-1 text-xs text-muted-foreground">
                Medido no MT5, tick a tick, com a posição aberta{mepMen.parcial ? " · parcial: o coletor não acompanhou o dia inteiro" : ""}.
              </p>
            </div>
          ) : null}

          <div>
            {/* o número de cada posição é o flutuante: o i explica, e só aparece quando há posição (19/09/2026) */}
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                {estado.posicoes.length > 0 ? <RotuloComInfo chave="flutuante">Posição aberta</RotuloComInfo> : "Posição aberta"}
              </p>
              {/* "3 operações em aberto" (21/09/2026): cada entrada ainda aberta conta 1, e a lista abaixo agrupa
                  por símbolo e lado, então o número pode ser maior que o de linhas. Some fora do pregão e com o
                  coletor parado (aí o aviso do cabeçalho é quem fala), como o selo Posicionado */}
              <OperacoesEmAberto className="text-xs text-muted-foreground" />
            </div>
            {/* sem moldura (19/09/2026): já está dentro do painel */}
            {estado.posicoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma posição aberta agora.</p>
            ) : (
              <ul className="space-y-2">
                {estado.posicoes.map((p) => {
                  const flutuantePontos = brlParaPontos(p.lucro_flutuante_por_contrato, robo.valor_ponto_brl);
                  return (
                    <li
                      key={`${p.simbolo}-${p.lado}`}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm">
                          {/* o lado fica neutro (19/09/2026): verde e vermelho só no resultado */}
                          <span className="font-medium">{rotuloLado(p.lado)}</span>
                          <span className="font-medium">{p.simbolo}</span>
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
                          @ {formatarPreco(p.preco_abertura)}
                          <HaQuanto em={p.aberta_em} prefixo=" · aberta " />
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">
                          <Valor valor={p.lucro_flutuante_por_contrato} />
                          <span className="ml-1 text-xs font-normal text-muted-foreground">/ct</span>
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          <Valor valor={flutuantePontos} unidade="pontos" colorir={false} className="text-muted-foreground" />
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* o dia em curva */}
        <div className="min-w-0">
          {/* vazio só sem operação E sem série (23/09/2026): com posição aberta e nenhuma saída a série já
              mostra o calor do dia */}
          {ops.length === 0 && !temSerie ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {/* o mesmo texto da tela ao vivo: robô sem coletor não tem dia ao vivo (19/09/2026).
                  "ainda" só com o pregão aberto: no sábado não vem mais nenhuma */}
              {!robo.tem_coletor
                ? "Este robô só tem histórico importado, sem operações ao vivo."
                : aberto
                  ? "Nenhuma operação fechada hoje ainda."
                  : "Nenhuma operação hoje."}
            </p>
          ) : (
            <CurvaDoDia
              operacoes={ops}
              saldo={estado.saldoHoje}
              dia={hoje}
              horario={horario}
              valorPonto={robo.valor_ponto_brl}
              altura={200}
            />
          )}
        </div>
      </div>

      {/* o que acabou de acontecer, na largura toda */}
      {ops.length > 0 ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Últimas operações de hoje</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {todas || ops.length <= VISIVEIS
                ? `${formatarNumero(ops.length)} no total`
                : `${formatarNumero(mostradas.length)} de ${formatarNumero(ops.length)}`}
            </p>
          </div>
          <ul className="border-y border-(--painel-fio) max-sm:-mx-4">
            {mostradas.map((o) => (
              <LinhaOperacao key={o.id} operacao={o} />
            ))}
          </ul>
          {ops.length > VISIVEIS ? (
            <button
              type="button"
              onClick={() => setTodas((v) => !v)}
              aria-expanded={todas}
              className="mt-3 w-full rounded-lg border border-(--painel-fio) px-3 py-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:border-(--painel-fio-forte) hover:bg-(--linha-hover) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {todas ? "Mostrar só as últimas" : `Mostrar as outras ${formatarNumero(escondidas)}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
