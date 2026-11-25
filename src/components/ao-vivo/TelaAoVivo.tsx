"use client";

import { cn } from "cn";
import Link from "next/link";
import { useMemo } from "react";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { HaQuanto } from "@/components/compartilhados/HaQuanto";
import { Valor } from "@/components/compartilhados/Valor";
import { CompartilharDia } from "@/components/compartilhar/CompartilharDia";
import { versaoDoDiaAoVivo } from "@/components/compartilhar/regras-do-compartilhar";
import { Simbolo } from "@/components/marca/Simbolo";
import { CurvaDoDia } from "@/components/robo/CurvaDoDia";
import { LinhaOperacao } from "@/components/robo/LinhaOperacao";
import { OperacoesEmAberto } from "@/components/robo/OperacoesEmAberto";
import { usePregaoAberto, useRobo } from "@/components/robo/RoboAoVivoProvider";
import { Fato, Fatos, NumeroGrande } from "@/components/sistema/Numero";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { buttonVariants } from "@/components/ui/button";
import { useMontado } from "@/hooks/useMontado";
import { formatarBRL, formatarDataLonga, formatarHora, formatarNumero, formatarPreco, rotuloLado } from "@/lib/formato";
import { fimDoDia } from "@/lib/stats/card-do-dia";
import { mepMenDoDia } from "@/lib/stats/exposicao";
import { excursao } from "@/lib/stats/operacoes";
import { totalAbertas } from "@/lib/stats/posicoes";
import { normalizarHora } from "@/lib/stats/pregao";
import { horarioDaJanela } from "@/lib/stats/saldo-dia";

// Quantas operações entram na lista (as mais recentes): o dia inteiro está na curva, e a lista completa mora
// na aba Operações, para onde o "Ver todas" leva. Num dia de 345 operações a lista inteira não cabe em tela nenhuma.
const NA_LISTA = 40;

/**
 * Tela cheia do dia (spec §8.4): só o que o robô fez hoje, para deixar aberta num monitor ou no celular.
 * Refeita na ficha Mesa (25/11/2026): usa a tela inteira e não tem caixa. Em cima, uma faixa fina com a marca
 * (é ela que diz, num print, de quem é o número), o "atualizado há…", o compartilhar e o caminho de volta para
 * a página do robô. Depois, o desenho de toda tela do sistema:
 *
 * - o resultado do dia em número grande, com a premissa embaixo ("com 1 contrato, já descontados os custos");
 * - a operação aberta em uma frase ("Em operação agora: compra a 168.805, aberta há 3 min, +R$ 35,00 até aqui");
 * - três fatos ao lado: quantas operações e quantas com ganho, o melhor e o pior momento do dia (o risco);
 * - a curva do dia, que no computador ocupa a altura que sobra da janela;
 * - as operações de hoje em linhas com fio, a mais recente em cima. No computador ficam numa coluna ao lado
 *   da curva, rolando dentro dela; no celular vêm embaixo, só as seis últimas.
 *
 * Num dia sem operação, sem posição e sem curva a tela não vira uma coleção de zeros: o dia aparece uma vez,
 * em palavras.
 *
 * Era um cartão de story centralizado (17/09/2026), com no máximo 448 px de largura, três números em caixas
 * (pontos, operações, acerto), a posição numa caixa e a curva na moldura do Profit. Saíram os pontos (a conta
 * em pontos fica na aba Operações e na imagem do dia), os selos e as caixas. Os números do dia continuam
 * saindo das operações ao vivo, pela mesma regra do "Hoje" da página do robô (ganho = líquido acima de zero).
 */
export function TelaAoVivo() {
  const { estado, robo, pregao, hoje } = useRobo();
  const montado = useMontado();
  // o texto do dia vazio segue o pregão calculado no servidor até montar: mesmo HTML dos dois lados
  const aberto = usePregaoAberto();

  const ops = estado.operacoes;
  const liquidos = useMemo(() => ops.map((o) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato), [ops]);
  const liquido = liquidos.reduce((s, v) => s + v, 0);
  const comGanho = liquidos.filter((v) => v > 0).length;

  // O melhor e o pior momento do dia, já descontados os custos como o número grande: os medidos pelo EA tick a
  // tick (22/09/2026), com a hora; sem medição (EA antigo, robô sem coletor), os de fechamento em fechamento,
  // a mesma reserva da imagem do dia. O pior momento é o risco da tela: onde aparece ganho, aparece o pior caso
  const momentos = useMemo(() => {
    const ea = mepMenDoDia(estado.exposicaoHoje, robo.custo_por_contrato, robo.valor_ponto_brl, "liquido", "brl");
    if (ea) return { melhor: ea.mep, pior: ea.men, melhorEm: ea.mep > 0 ? ea.mepEm : null, piorEm: ea.men < 0 ? ea.menEm : null };
    if (liquidos.length === 0) return null;
    const e = excursao(liquidos);
    return { melhor: e.mep, pior: e.men, melhorEm: null, piorEm: null };
  }, [estado.exposicaoHoje, robo.custo_por_contrato, robo.valor_ponto_brl, liquidos]);

  // a mesma curva do "Hoje" da página do robô (23/09/2026): a série do saldo medida pelo EA quando a rota já
  // respondeu com balde, senão por fechamento. O horário do robô (ou do pregão) dimensiona o eixo
  const horario = useMemo(() => horarioDaJanela(robo, pregao), [robo, pregao]);
  const temSerie = estado.saldoHoje.carregado && estado.saldoHoje.baldes.length > 0;
  // a versão da imagem do dia, como no "Hoje" (24/09/2026): nº de operações e o minuto do último dado,
  // o balde só até o fim do dia do robô mais a folga
  const versao = versaoDoDiaAoVivo(ops, estado.saldoHoje.baldes, { dia: hoje, fim: fimDoDia(horario, pregao) });

  const posicoes = estado.posicoes;
  const temDia = ops.length > 0 || temSerie || posicoes.length > 0;
  const origem = robo.tem_coletor ? "direto do MetaTrader 5" : "histórico importado";

  // o dia sem nada, em palavras; "ainda" só com o pregão aberto (19/09/2026): no sábado não vem mais nenhuma
  const diaVazio =
    robo.status === "em_breve"
      ? "Este robô ainda não começou a operar"
      : robo.status === "pausado"
        ? "Este robô está pausado"
        : robo.status === "arquivado"
          ? "Este robô foi arquivado"
          : !robo.tem_coletor
            ? "Este robô não tem acompanhamento ao vivo"
            : aberto
              ? "Hoje ainda sem operação"
              : "Sem operação hoje";

  const compartilharLink = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${robo.nome} ao vivo`,
          text: `${robo.nome} hoje: ${formatarBRL(liquido, { sinal: true })} com 1 contrato, já descontados os custos`,
          url,
        });
      } else await navigator.clipboard.writeText(url);
    } catch {
      /* usuário cancelou */
    }
  };

  // a mais recente em cima; as novas entram no topo
  const recentes = useMemo(() => [...ops].reverse().slice(0, NA_LISTA), [ops]);
  const comLista = ops.length > 0;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* A faixa de cima. No celular quebra em duas linhas: a marca e o "atualizado há…" na primeira, o compartilhar
          e o caminho de volta na segunda (o vão elástico fica no fim da primeira linha) */}
      <header className="border-b">
        <div className="conteudo mx-auto flex min-h-12 flex-wrap items-center gap-x-5 gap-y-1.5 py-2.5 text-[0.8125rem]">
          <Link href="/" className="flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-tight">
            <Simbolo aria-hidden className="h-5 w-auto text-marca" />
            <span>
              Quants <span className="font-normal text-muted-foreground">Robôs</span>
            </span>
          </Link>
          {/* o endereço só existe no navegador: aparece depois de montar, para o print dizer de onde veio */}
          {montado ? <span className="text-sutil max-sm:hidden">{window.location.host}</span> : null}
          <span aria-hidden className="ml-auto" />

          {/* sem coletor não há sinal: "atualizado sem dados" não diz nada (19/09/2026) */}
          {robo.tem_coletor ? <AtualizadoHa em={estado.ultimaMensagemEm ?? estado.ultimoHeartbeatEm} className="text-[0.8125rem]" /> : null}
          {/* 24/09/2026: com operação no dia, o "Compartilhar" abre a imagem do dia (Quadrado ou Story, com
              Compartilhar, Baixar imagem e Copiar link, este apontando para a própria tela cheia). Sem operação
              não há imagem (a rota responde 404) e fica o botão que compartilha o link da tela. Um ou outro,
              nunca os dois: não há dois "Compartilhar" na tela */}
          {ops.length > 0 ? (
            <CompartilharDia
              slug={robo.slug}
              nomeRobo={robo.nome}
              dia={hoje}
              versao={versao}
              temOperacao
              rotulo="Compartilhar"
              caminhoDoLink={`/robos/${robo.slug}/ao-vivo`}
              contaDemo={robo.conta_tipo === "demo"}
            />
          ) : (
            <button type="button" onClick={compartilharLink} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Compartilhar
            </button>
          )}
          {/* o caminho de volta (18/09/2026, Artur: "toda página precisa ter uma maneira de voltar") */}
          <Link href={`/robos/${robo.slug}`} className={LINK_DO_PAINEL}>
            Página do {robo.nome}
          </Link>
        </div>
      </header>

      <main
        className={cn(
          "conteudo mx-auto grid flex-1 content-start gap-x-12 gap-y-10 pt-8 pb-10",
          comLista && "xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_25rem]",
        )}
      >
        <div className="min-w-0">
          <h1 className="text-[0.9375rem] text-muted-foreground">
            <span className="font-medium text-foreground">{robo.nome}</span> · {temDia ? "resultado de hoje" : "hoje"} · {formatarDataLonga(hoje)}
            {robo.conta_tipo === "demo" ? <span className="text-alerta"> · conta demo</span> : null}
          </h1>

          {temDia ? (
            <>
              <div className="mt-3 grid gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,auto)_minmax(0,22rem)] lg:items-end lg:justify-start">
                <div className="min-w-0">
                  {/* a tela é para ser lida de longe: em monitor largo (a partir de 1536 px, onde há lugar ao lado dos
                      fatos e da lista) o número passa do teto de 72 px do resto do sistema */}
                  <NumeroGrande valor={liquido} centavos={Math.abs(liquido) < 1000} className="2xl:text-[length:clamp(4.5rem,5.4vw,6.5rem)]" />
                  <p className="mt-3 text-sm text-pretty text-muted-foreground">com 1 contrato, já descontados os custos · {origem}</p>
                  {/* A operação aberta, em uma frase. O valor é o resultado em aberto: muda com o preço até ela
                      fechar. O lado fica neutro (19/09/2026): verde e vermelho só no resultado. A linha existe
                      sempre, com ou sem operação aberta, para a curva não subir e descer a cada entrada */}
                  <p className="mt-1.5 text-sm text-pretty">
                    {posicoes.length > 0 ? (
                      <>
                        <span className="text-info">Em operação agora</span>
                        {posicoes.map((p, i) => (
                          <span key={`${p.simbolo}-${p.lado}`}>
                            {i === 0 ? ": " : "; "}
                            {rotuloLado(p.lado).toLowerCase()} a {formatarPreco(p.preco_abertura)}
                            <HaQuanto em={p.aberta_em} prefixo=", aberta " />, <Valor valor={p.lucro_flutuante_por_contrato} className="font-medium" /> até aqui
                          </span>
                        ))}
                        .
                      </>
                    ) : (
                      <span className="text-muted-foreground">{robo.tem_coletor ? "Nenhuma operação aberta agora." : "Sem acompanhamento ao vivo."}</span>
                    )}
                  </p>
                  {/* "3 operações em aberto" (21/09/2026): cada entrada ainda aberta conta 1, e a frase acima agrupa
                      por lado, então só aparece quando há mais de uma. Sem o i: num print ele é um botão que não abre */}
                  {totalAbertas(posicoes) > 1 ? <OperacoesEmAberto comInfo={false} className="mt-0.5 text-[0.8125rem] text-sutil" /> : null}
                </div>

                {ops.length > 0 ? (
                  <Fatos className="lg:pb-0.5">
                    <Fato rotulo="Operações">
                      <span className="font-medium">{formatarNumero(ops.length)}</span>
                      <span className="text-muted-foreground"> · {formatarNumero(comGanho)} com ganho</span>
                    </Fato>
                    {momentos ? (
                      <>
                        <Fato rotulo="Melhor momento do dia">
                          {momentos.melhorEm ? <span className="mr-3 text-sutil">{formatarHora(momentos.melhorEm)}</span> : null}
                          {/* o dia que nunca passou de zero não ganha um "R$ 0,00": diz isso em palavras */}
                          {momentos.melhor > 0 ? <Valor valor={momentos.melhor} className="font-medium" /> : <span className="text-muted-foreground">não ficou positivo</span>}
                        </Fato>
                        <Fato rotulo="Pior momento do dia">
                          {momentos.piorEm ? <span className="mr-3 text-sutil">{formatarHora(momentos.piorEm)}</span> : null}
                          {momentos.pior < 0 ? <Valor valor={momentos.pior} className="font-medium" /> : <span className="text-muted-foreground">não ficou negativo</span>}
                        </Fato>
                      </>
                    ) : null}
                  </Fatos>
                ) : null}
              </div>

              {/* O dia em curva; some só sem operação E sem série (23/09/2026): com posição aberta e nenhuma saída a
                  série já mostra o dia. A altura vem de --alt-curva (o desenho a lê): no computador a curva fica com
                  o que sobra da janela (o que vem antes e depois dela soma de 24 a 28 rem), para a tela inteira
                  caber sem rolar */}
              {ops.length > 0 || temSerie ? (
                <div className="mt-8 min-w-0 [--alt-curva:14rem] sm:[--alt-curva:18rem] xl:[--alt-curva:clamp(14rem,calc(100dvh_-_29rem),44rem)]">
                  <CurvaDoDia
                    operacoes={ops}
                    saldo={estado.saldoHoje}
                    dia={hoje}
                    horario={horario}
                    valorPonto={robo.valor_ponto_brl}
                    titulo="O dia, operação a operação"
                    tituloSerie="O dia, medido no MetaTrader 5"
                    // a premissa ("com 1 contrato, já descontados os custos") já está debaixo do número grande
                    legenda="resultado do dia"
                    coletorAtrasado={estado.exposicaoHoje?.excursao_ea_parcial === true}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-3 text-[length:clamp(1.75rem,3.2vw,3rem)] leading-[1.1] font-medium tracking-[-0.02em] text-balance">{diaVazio}</p>
              <p className="mt-3 text-sm text-pretty text-muted-foreground">
                {robo.horario_inicio && robo.horario_fim && robo.tem_coletor && robo.status === "ativo"
                  ? `Opera das ${normalizarHora(robo.horario_inicio)} às ${normalizarHora(robo.horario_fim)} · `
                  : ""}
                {origem}
              </p>
            </>
          )}
        </div>

        {comLista ? (
          // no computador a coluna tem a altura da janela (menos a faixa de cima e as margens) e a lista rola dentro dela
          <section aria-labelledby="ops-de-hoje" className="min-w-0 xl:flex xl:max-h-[calc(100dvh_-_7.75rem)] xl:flex-col">
            <div className="flex items-baseline justify-between gap-3 border-b border-(--painel-fio) pb-3">
              <h2 id="ops-de-hoje" className="text-[0.9375rem] font-medium">
                Operações de hoje
              </h2>
              <Link href={`/robos/${robo.slug}/operacoes`} className={cn(LINK_DO_PAINEL, "text-[0.8125rem]")}>
                Ver todas
              </Link>
            </div>
            {/* até xl só as seis últimas (em duas colunas no tablet): o resto está a um toque, em "Ver todas". O link
                não repete a contagem: ela já está nos fatos, ao lado do número */}
            <ul className="max-xl:[&>li:nth-child(n+7)]:hidden md:max-xl:grid md:max-xl:grid-cols-2 md:max-xl:gap-x-12 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-3">
              {recentes.map((o) => (
                <LinhaOperacao key={o.id} operacao={o} />
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
