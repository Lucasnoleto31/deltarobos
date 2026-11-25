"use client";

import { useMemo, useState } from "react";
import { HaQuanto } from "@/components/compartilhados/HaQuanto";
import { Valor } from "@/components/compartilhados/Valor";
import { CompartilharDia } from "@/components/compartilhar/CompartilharDia";
import { versaoDoDiaAoVivo } from "@/components/compartilhar/regras-do-compartilhar";
import { Fato, Fatos, NumeroGrande } from "@/components/sistema/Numero";
import { formatarHora, formatarNumero, formatarPreco, rotuloLado } from "@/lib/formato";
import { fimDoDia } from "@/lib/stats/card-do-dia";
import { mepMenDoDia } from "@/lib/stats/exposicao";
import { horarioDaJanela } from "@/lib/stats/saldo-dia";
import { CurvaDoDia } from "./CurvaDoDia";
import { LinhaOperacao } from "./LinhaOperacao";
import { OperacoesEmAberto } from "./OperacoesEmAberto";
import { usePregaoAberto, useRobo } from "./RoboAoVivoProvider";

// Quantas operações aparecem em lista antes do "mostrar as outras". O dia inteiro está na curva
// logo acima; a lista é só o que acabou de acontecer. Num dia de 284 operações a tabela inteira
// tinha 16.600 px no celular (17/09/2026).
const VISIVEIS = 6;

// o "o que é" do melhor e do pior momento medidos pelo coletor (22/09/2026); o texto padrão do glossário fala
// das duas fontes, e aqui a fonte é uma só. "Parcial" explica o que falta
const PARCIAL = " Parcial: o coletor subiu com o dia já em andamento e pode ter perdido um extremo anterior.";
const TEXTO_MEP_EA = (parcial: boolean) =>
  `O ponto mais alto que o saldo de hoje alcançou, com 1 contrato e já com custos, medido no MetaTrader 5 a cada movimento do preço, com a posição aberta: o mesmo número do Profit (MEP).${parcial ? PARCIAL : ""}`;
const TEXTO_MEN_EA = (parcial: boolean) =>
  `O ponto mais baixo que o saldo de hoje alcançou, com 1 contrato e já com custos, medido no MetaTrader 5 a cada movimento do preço, com a posição aberta: o quanto o dia chegou a ficar no prejuízo (MEN).${parcial ? PARCIAL : ""}`;

/**
 * O "Hoje" da visão geral do robô (spec §8.2): o resultado do dia, a operação aberta e as operações entrando
 * na hora. Desde a ficha Mesa (25/11/2026, segunda passada) segue o desenho da página inicial, sem caixa: o
 * número grande com a premissa embaixo, os fatos do dia ao lado (melhor e pior momento, operação aberta), a
 * curva do dia na largura toda e, embaixo, as operações de hoje em linhas com fio.
 */
export function HojeAoVivo() {
  const { estado, robo, pregao, hoje } = useRobo();
  const aberto = usePregaoAberto();
  // sem relógio aqui (18/09/2026): o "aberta há …" anda sozinho no HaQuanto e o bloco só
  // renderiza de novo quando chega operação ou posição
  const [todas, setTodas] = useState(false);

  const ops = estado.operacoes;
  const liquido = ops.reduce((s, o) => s + o.resultado_brl_por_contrato - o.custos_brl_por_contrato, 0);
  const gains = ops.filter((o) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato > 0).length;
  // Melhor e pior momento de hoje medidos pelo EA 1.1.0 tick a tick (22/09/2026), líquidos como o número
  // grande. Vem da view no HTML e chega atualizado pelo evento "coleta"; sem medição (EA antigo, sem coletor,
  // dia sem operação) as linhas não aparecem
  const mepMen = useMemo(
    () => mepMenDoDia(estado.exposicaoHoje, robo.custo_por_contrato, robo.valor_ponto_brl, "liquido", "brl"),
    [estado.exposicaoHoje, robo.custo_por_contrato, robo.valor_ponto_brl],
  );
  // A série do saldo de hoje medida pelo EA 1.1.2 (23/09/2026): só depois de a rota responder (carregado) e
  // com balde; até lá, e nos dias sem série, a curva por fechamento. O eixo do tempo é o horário do robô,
  // ou o do pregão do ativo; memoizado porque a CurvaDoDia é memo e compara por referência
  const horario = useMemo(() => horarioDaJanela(robo, pregao), [robo, pregao]);
  const temSerie = estado.saldoHoje.carregado && estado.saldoHoje.baldes.length > 0;
  // a versão da imagem do dia (24/09/2026): nº de operações e o minuto do último dado. Muda com o dia, para a
  // prévia de hoje não vir velha da CDN; o diálogo a congela ao abrir
  const versao = versaoDoDiaAoVivo(ops, estado.saldoHoje.baldes, { dia: hoje, fim: fimDoDia(horario, pregao) });

  // a mais recente em cima; as novas entram no topo mesmo com a lista recolhida
  const recentes = [...ops].reverse();
  const mostradas = todas ? recentes : recentes.slice(0, VISIVEIS);
  const escondidas = recentes.length - mostradas.length;

  const semDia = !robo.tem_coletor
    ? "Este robô só tem histórico importado, sem operações ao vivo."
    : aberto
      ? "nenhuma operação fechada hoje ainda"
      : "nenhuma operação hoje";

  return (
    <>
      <div className="mt-3 grid gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,auto)_minmax(0,24rem)] lg:items-end lg:justify-start">
        <div className="min-w-0">
          <NumeroGrande valor={liquido} centavos={Math.abs(liquido) < 1000} />
          <p className="mt-3 text-sm text-pretty text-muted-foreground">
            com 1 contrato, já descontados os custos ·{" "}
            {ops.length > 0
              ? `${formatarNumero(ops.length)} ${ops.length === 1 ? "operação" : "operações"}, ${formatarNumero(gains)} com ganho`
              : semDia}
          </p>
          {/* a imagem do dia para a live, o WhatsApp e o Instagram (24/09/2026): só com operação, porque sem ela
              não há imagem (a rota responde 404) */}
          {ops.length > 0 ? (
            <div className="mt-4">
              <CompartilharDia slug={robo.slug} nomeRobo={robo.nome} dia={hoje} versao={versao} temOperacao contaDemo={robo.conta_tipo === "demo"} />
            </div>
          ) : null}
        </div>

        <Fatos className="lg:pb-0.5">
          {mepMen ? (
            <>
              <Fato rotulo="Melhor momento do dia" info="mep" infoTexto={TEXTO_MEP_EA(mepMen.parcial)}>
                {mepMen.mep > 0 && mepMen.mepEm ? <span className="mr-3 text-sutil">{formatarHora(mepMen.mepEm)}</span> : null}
                <Valor valor={mepMen.mep} className="font-medium" />
              </Fato>
              <Fato rotulo="Pior momento do dia" info="men" infoTexto={TEXTO_MEN_EA(mepMen.parcial)}>
                {mepMen.men < 0 && mepMen.menEm ? <span className="mr-3 text-sutil">{formatarHora(mepMen.menEm)}</span> : null}
                <Valor valor={mepMen.men} className="font-medium" />
              </Fato>
            </>
          ) : null}
          {estado.posicoes.length === 0 ? (
            <Fato rotulo="Operação aberta">
              <span className="text-muted-foreground">nenhuma agora</span>
            </Fato>
          ) : (
            estado.posicoes.map((p) => (
              // o número de cada posição é o resultado em aberto (flutuante): muda com o preço até ela fechar
              <Fato
                key={`${p.simbolo}-${p.lado}`}
                rotulo={
                  <>
                    {rotuloLado(p.lado)} a {formatarPreco(p.preco_abertura)}
                    <HaQuanto em={p.aberta_em} prefixo=" · aberta " />
                  </>
                }
                info="flutuante"
              >
                <Valor valor={p.lucro_flutuante_por_contrato} className="font-medium" />
              </Fato>
            ))
          )}
          {/* "3 operações em aberto" (21/09/2026): cada entrada ainda aberta conta 1, e a lista acima agrupa por
              símbolo e lado, então o número pode ser maior que o de linhas. Some fora do pregão e com o coletor
              parado (aí o aviso do cabeçalho é quem fala) */}
          {estado.posicoes.length > 0 ? <OperacoesEmAberto className="text-[0.8125rem] text-sutil" /> : null}
          {mepMen?.parcial ? <p className="text-[0.8125rem] text-sutil">Medição parcial: o coletor não acompanhou o dia inteiro.</p> : null}
        </Fatos>
      </div>

      {/* o dia em curva; vazio só sem operação E sem série (23/09/2026): com posição aberta e nenhuma saída a
          série já mostra o dia */}
      {ops.length === 0 && !temSerie ? null : (
        <div className="mt-8 min-w-0">
          <CurvaDoDia
            operacoes={ops}
            saldo={estado.saldoHoje}
            dia={hoje}
            horario={horario}
            valorPonto={robo.valor_ponto_brl}
            altura={300}
            coletorAtrasado={estado.exposicaoHoje?.excursao_ea_parcial === true}
          />
        </div>
      )}

      {/* o que acabou de acontecer */}
      {ops.length > 0 ? (
        <div className="mt-8">
          <div className="flex items-baseline justify-between gap-3 border-b border-(--painel-fio) pb-3">
            <h3 className="text-[0.9375rem] font-medium">Operações de hoje</h3>
            <p className="text-[0.8125rem] text-sutil">
              {todas || ops.length <= VISIVEIS
                ? `${formatarNumero(ops.length)} no total`
                : `${formatarNumero(mostradas.length)} de ${formatarNumero(ops.length)}`}
            </p>
          </div>
          <ul className="grid gap-x-12 lg:grid-cols-2">
            {mostradas.map((o) => (
              <LinhaOperacao key={o.id} operacao={o} />
            ))}
          </ul>
          {ops.length > VISIVEIS ? (
            <button
              type="button"
              onClick={() => setTodas((v) => !v)}
              aria-expanded={todas}
              className="mt-3 border-b border-(--painel-fio-forte) text-sm text-muted-foreground transition-colors outline-none hover:border-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {todas ? "Mostrar só as últimas" : `Mostrar as outras ${formatarNumero(escondidas)}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
