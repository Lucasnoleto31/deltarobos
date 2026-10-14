"use client";

import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarDataLonga, formatarNumero, formatarPct } from "@/lib/formato";
import { rotuloOperacoesEmAberto } from "@/lib/stats/posicoes";
import { useCasa, useOperacoesEmAberto, usePregaoAberto } from "./CasaAoVivoProvider";
import { formatarDiaLongo } from "./datas";
import type { UltimoPregaoCasa } from "./tipos";

interface Props {
  ultimoPregao: UltimoPregaoCasa | null;
}

const TEXTO_RESULTADO =
  "Soma do que todos os robôs ganharam e perderam nas operações fechadas nesse pregão, com 1 contrato em cada um e já descontados os custos.";
const TEXTO_OPERACOES =
  "Quantas vezes os robôs entraram no mercado e saíram nesse pregão, somando todos. Cada operação vai da entrada até a posição zerar.";

/**
 * Número grande do hero: resultado de hoje de todos os robôs, por contrato, líquido. Com o pregão
 * fechado e nenhuma operação hoje (fim de semana, noite, madrugada) mostra o último pregão, com a data
 * e o melhor robô do dia, em vez de uma tela de zeros (19/09/2026). Com o pregão aberto continua
 * "Hoje", ao vivo, mesmo zerado. O "atualizado há" só acompanha o número de hoje: embaixo do último
 * pregão ele repetia a barra e sugeria número novo (19/09/2026).
 *
 * O número grande, as operações e os acertos têm o i do glossário (19/09/2026). O número grande e as
 * operações somam todos os robôs, então o texto do glossário, escrito para um robô, vai trocado aqui pelo
 * da casa.
 *
 * 21/09/2026: no modo ao vivo o tile "Posicionados" continua com o número de robôs e ganha, em apoio, as
 * operações em aberto da casa ("3 em aberto", com o i que explica: entradas, nunca contratos). Ficou o
 * apoio, e não um tile novo "Em aberto", porque a coluna tem uns 90 px no celular: "Posicionados" cabe
 * hoje, e "3 em aberto" com o i mede uns 85 px, enquanto "3 operações em aberto" não caberia; e fora do
 * pregão, quando o contador não pode aparecer, o tile teria que virar outra coisa, e o de robôs
 * posicionados já existe. O apoio só aparece com o pregão aberto, o coletor em dia e pelo menos uma.
 */
export function NumeroHero({ ultimoPregao }: Props) {
  const { estado, hoje } = useCasa();
  const resumo = estado.resumo;
  const temRobos = (resumo?.robos.length ?? 0) > 0;

  // servidor e hidratação usam o que o servidor calculou; antes, o calendário dizia "dia de pregão" de
  // manhã, antes da abertura, e o HTML chegava com "Hoje R$ 0,00" (19/09/2026)
  const aberto = usePregaoAberto();
  const passado = !aberto && (resumo?.n_operacoes ?? 0) === 0 ? ultimoPregao : null;
  const { total: emAberto, aoVivo } = useOperacoesEmAberto();

  const dia = passado
    ? {
        rotulo: "Último pregão, todos os robôs",
        valor: passado.valor,
        data: formatarDiaLongo(passado.dia),
        operacoes: passado.nOperacoes,
        gains: passado.nGain,
        terceiro: { rotulo: "Melhor robô", valor: passado.melhor?.nome ?? "–", emAberto: 0 },
      }
    : resumo && temRobos
      ? {
          rotulo: "Hoje, todos os robôs",
          valor: resumo.resultado_liquido_por_contrato,
          data: formatarDataLonga(resumo.dia ?? hoje),
          operacoes: resumo.n_operacoes,
          gains: resumo.n_gain,
          terceiro: { rotulo: "Posicionados", valor: formatarNumero(resumo.n_robos_posicionados), emAberto },
        }
      : null;
  // ao vivo mostra o zero ("0 em aberto"); sem ao vivo o apoio some (21/09/2026)
  const rotuloEmAberto = dia ? rotuloOperacoesEmAberto(dia.terceiro.emAberto, aoVivo) : null;

  return (
    // 19/09/2026: uma entrada só, no carregamento, e curta. O cartão já está na tela quando a página
    // abre, então não teria o que "revelar ao rolar"; e o número dentro dele nunca ganha efeito, porque
    // muda sozinho durante o pregão e animar a troca faria o valor parecer outra coisa.
    <div className="relative painel vidro p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:animation-duration-500 motion-safe:[--tw-ease:cubic-bezier(0.16,1,0.3,1)] sm:p-8">
      <p className="text-sm text-muted-foreground">
        <RotuloComInfo chave="resultadoDia" texto={TEXTO_RESULTADO}>
          {dia?.rotulo ?? "Hoje, todos os robôs"}
        </RotuloComInfo>
      </p>
      <p className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">
        {dia ? <Valor valor={dia.valor} inteiro={false} /> : <span className="text-muted-foreground">–</span>}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {/* a data em linha própria (19/09/2026): com o " · " no meio, a quebra deixava o ponto sozinho no fim da
            linha; sem o tnum do body, o hífen de "sexta-feira" volta à largura normal */}
        por contrato, líquido de custos
        <span className="block [font-feature-settings:normal]">{dia?.data ?? formatarDataLonga(resumo?.dia ?? hoje)}</span>
      </p>

      {dia ? (
        <dl className="mt-6 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">
              <RotuloComInfo chave="operacoes" texto={TEXTO_OPERACOES}>
                Operações
              </RotuloComInfo>
            </dt>
            <dd className="text-lg font-semibold tabular-nums">{formatarNumero(dia.operacoes)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              <RotuloComInfo chave="taxaAcerto">Acertos</RotuloComInfo>
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatarPct(dia.operacoes > 0 ? dia.gains / dia.operacoes : null, 0)}
            </dd>
          </div>
          <div className="min-w-0">
            {/* sem o i: no celular a coluna tem 90 px e "Melhor robô" com o i quebrava em duas linhas */}
            <dt className="text-muted-foreground">{dia.terceiro.rotulo}</dt>
            <dd className="truncate text-lg font-semibold tabular-nums">{dia.terceiro.valor}</dd>
            {rotuloEmAberto ? (
              // o visível é curto para caber na coluna; o leitor de tela ouve "3 operações em aberto"
              <dd className="text-xs text-muted-foreground tabular-nums">
                <RotuloComInfo chave="operacoesEmAberto">
                  {/* nowrap: a coluna tem 90 px no celular e "12 em aberto" com o i partia em duas linhas */}
                  <span aria-hidden className="whitespace-nowrap">{formatarNumero(dia.terceiro.emAberto)} em aberto</span>
                  <span className="sr-only">{rotuloEmAberto}</span>
                </RotuloComInfo>
              </dd>
            ) : null}
          </div>
        </dl>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Nenhum robô em operação.</p>
      )}

      {passado ? null : (
        <div className="mt-4">
          <AtualizadoHa em={estado.ultimaMensagemEm ?? resumo?.gerado_em ?? null} />
        </div>
      )}
    </div>
  );
}
