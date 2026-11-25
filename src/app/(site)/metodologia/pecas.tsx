import { cn } from "cn";
import { Painel } from "@/components/sistema/Painel";

/**
 * As peças de "Como funciona" (ficha Mesa, 25/11/2026). A página é um manual para quem nunca operou: cada
 * seção é uma seção sem caixa (título de 15 px com o fio embaixo), o texto tem largura de leitura e, quando a
 * coluna tem largura, a conta de exemplo fica ao lado dele. Quem mede essa largura é o próprio miolo da
 * página (@container), não a janela: com o índice ao lado, a coluna do texto tem tamanhos que a janela
 * sozinha não diz.
 */

/**
 * Uma seção do manual.
 * 19/09/2026: sem scroll-mt aqui: o scroll-padding-top do html (globals.css) já desconta a fita fixa do
 * topo, e os dois somavam, deixando a seção quase 100 px abaixo do necessário.
 */
export function Secao({
  id,
  titulo,
  apoio,
  corpo = "space-y-6 pt-5",
  children,
}: {
  id: string;
  titulo: string;
  apoio?: React.ReactNode;
  corpo?: string;
  children: React.ReactNode;
}) {
  return (
    <Painel id={id} titulo={titulo} apoio={apoio} corpo={corpo}>
      {children}
    </Painel>
  );
}

/**
 * Texto corrido, com largura de leitura. O primeiro parágrafo diz o que a coisa é e vai na cor do texto; os
 * seguintes (a conta, as exceções) ficam um tom abaixo. É a regra de 19/09/2026 (Artur: "as explicações
 * devem ser de fácil entendimento, para qualquer leigo entender"): primeiro o que quer dizer, depois a conta.
 */
export function Texto({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-3xl space-y-3 text-sm leading-relaxed text-pretty text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground [&>p:first-child]:text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Subtítulo dentro de uma seção. Leva `id` quando outra tela aponta para cá (os endereços antigos continuam valendo). */
export function Subtitulo({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-sm font-medium text-foreground">
      {children}
    </h3>
  );
}

/**
 * O texto de um lado e o exemplo do outro quando a coluna tem pelo menos 48 rem; senão, um embaixo do outro.
 * O texto para em 44 rem (linha de leitura) e o que sobra fica com o exemplo. O lado do texto é ele mesmo um
 * @container: uma lista (`Linhas`) posta ali mede a largura que sobrou para ela, não a da página.
 */
export function ComExemplo({ children, exemplo }: { children: React.ReactNode; exemplo: React.ReactNode }) {
  return (
    <div className="grid gap-x-12 gap-y-6 @3xl:grid-cols-[minmax(0,44rem)_minmax(18rem,1fr)]">
      <div className="@container min-w-0 space-y-6">{children}</div>
      <div className="min-w-0">{exemplo}</div>
    </div>
  );
}

/** O bloco ao lado do texto: uma legenda pequena e o conteúdo, sem caixa. */
export function AoLado({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <figure className={cn("max-w-sm text-sm", className)}>
      <figcaption className="text-[0.8125rem] text-sutil">{titulo}</figcaption>
      <div className="mt-1.5">{children}</div>
    </figure>
  );
}

export interface LinhaDaConta {
  rotulo: React.ReactNode;
  valor: React.ReactNode;
}

/** A linha pequena debaixo de um exemplo: de onde o número saiu, o que ele não diz. */
export function Nota({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-2 max-w-sm text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground", className)}>{children}</p>;
}

/**
 * Uma conta de exemplo, como numa folha de papel: uma linha por parcela e o resultado embaixo de um fio.
 * É a lista de fatos da página inicial (rótulo à esquerda, valor à direita), com o total no fim.
 * `desenho` vai em cima da conta, quando o exemplo tem uma figura (as entradas abertas ao mesmo tempo).
 */
export function Conta({
  titulo = "Exemplo",
  desenho,
  linhas,
  resultado,
  className,
}: {
  titulo?: string;
  desenho?: React.ReactNode;
  linhas: LinhaDaConta[];
  resultado?: LinhaDaConta;
  className?: string;
}) {
  return (
    <AoLado titulo={titulo} className={className}>
      {desenho ? <div className="mt-3 mb-3">{desenho}</div> : null}
      <dl>
        {linhas.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 leading-7">
            <dt className="text-muted-foreground">{l.rotulo}</dt>
            <dd className="text-right whitespace-nowrap">{l.valor}</dd>
          </div>
        ))}
        {resultado ? (
          <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t border-(--painel-fio-forte) pt-1.5 leading-7">
            <dt>{resultado.rotulo}</dt>
            <dd className="text-right font-medium whitespace-nowrap">{resultado.valor}</dd>
          </div>
        ) : null}
      </dl>
    </AoLado>
  );
}

export interface Linha {
  /** âncora da linha: outras telas e endereços antigos apontam para cá */
  id?: string;
  nome: React.ReactNode;
  /** o nome técnico, para quem já o conhece de outro lugar */
  tecnico?: string;
  texto: React.ReactNode;
  /** a conta, em palavras */
  conta?: React.ReactNode;
  /** a mesma conta com os números do exemplo da seção */
  exemplo?: React.ReactNode;
}

/**
 * Lista de definições em linhas com fio: o nome à esquerda, o que quer dizer e a conta no meio e, quando a
 * seção tem um exemplo, a conta com os números dele à direita. No celular cada linha empilha. É uma lista,
 * não uma tabela: o texto quebra dentro da própria coluna em vez de rolar de lado.
 *
 * `comoNaTela` é para quando o nome é a frase como aparece no site (com a cor do estado): aí a coluna do nome
 * é mais larga, para a frase caber numa linha, e quem leva a cor do texto é a explicação.
 */
export function Linhas({
  itens,
  rotuloDoExemplo = "No exemplo",
  comoNaTela = false,
  className,
}: {
  itens: Linha[];
  rotuloDoExemplo?: string;
  comoNaTela?: boolean;
  className?: string;
}) {
  const comExemplo = itens.some((l) => l.exemplo);
  const grade = comoNaTela
    ? "@3xl:grid-cols-[20rem_minmax(0,1fr)]"
    : comExemplo
      ? "@2xl:grid-cols-[13rem_minmax(0,1fr)] @5xl:grid-cols-[13rem_minmax(0,1fr)_minmax(0,15rem)]"
      : "@2xl:grid-cols-[13rem_minmax(0,1fr)]";
  return (
    <div className={className}>
      {comExemplo ? (
        <p aria-hidden className={cn("hidden gap-x-12 pb-2 text-[0.8125rem] text-sutil @5xl:grid", grade)}>
          <span className="col-start-3 text-right">{rotuloDoExemplo}</span>
        </p>
      ) : null}
      <dl className="border-t border-(--painel-fio)">
        {itens.map((l, i) => (
          <div key={i} id={l.id} className={cn("grid gap-x-12 gap-y-1 border-b border-(--painel-fio) py-3.5 text-sm", grade)}>
            <dt className="min-w-0">
              <span className={comoNaTela ? undefined : "font-medium"}>{l.nome}</span>
              {l.tecnico ? <span className="block text-[0.8125rem] text-muted-foreground">{l.tecnico}</span> : null}
            </dt>
            <dd
              className={cn(
                "max-w-3xl min-w-0 leading-relaxed text-pretty [&_strong]:font-medium [&_strong]:text-foreground",
                comoNaTela ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {l.texto}
              {l.conta ? (
                <span className="mt-1 block">
                  <span className="text-foreground">A conta:</span> {l.conta}
                </span>
              ) : null}
            </dd>
            {l.exemplo ? (
              <dd className="min-w-0 @2xl:col-start-2 @5xl:col-start-3 @5xl:text-right">
                <span className="text-muted-foreground @5xl:hidden">{rotuloDoExemplo}: </span>
                {l.exemplo}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * A curva de um exemplo, no desenho das curvas do site: linha fina na cor do texto e a maior queda em
 * vermelho na própria linha. A partida, em zero, entra como primeiro ponto. `queda` são os índices que
 * `maiorQueda` (lib/stats/serie-casa) devolve: -1 quando o ponto mais alto é a partida.
 */
export function CurvaDeExemplo({
  acumulados,
  queda,
  descricao,
  className,
}: {
  acumulados: readonly number[];
  queda: { iInicio: number; iFundo: number } | null;
  descricao: string;
  className?: string;
}) {
  const valores = [0, ...acumulados];
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const x = (i: number) => (i / Math.max(1, valores.length - 1)) * 100;
  const y = (v: number) => (max === min ? 50 : 96 - ((v - min) / (max - min)) * 92);
  const ponto = (i: number) => `${x(i).toFixed(2)},${y(valores[i]).toFixed(2)}`;
  const linha = valores.map((_, i) => `${i === 0 ? "M" : "L"}${ponto(i)}`).join("");
  // os índices da queda contam a partir do primeiro dia; aqui a partida ocupa a posição zero
  const de = queda ? queda.iInicio + 1 : 0;
  const ate = queda ? queda.iFundo + 1 : 0;
  const trecho = queda ? Array.from({ length: ate - de + 1 }, (_, k) => `${k === 0 ? "M" : "L"}${ponto(de + k)}`).join("") : null;
  return (
    <svg
      role="img"
      aria-label={descricao}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("block h-24 w-full overflow-visible text-foreground", className)}
    >
      <line x1={0} x2={100} y1={y(0)} y2={y(0)} stroke="var(--painel-fio-forte)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d={linha} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {trecho ? (
        <path d={trecho} fill="none" stroke="var(--negativo)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ) : null}
    </svg>
  );
}

/**
 * As entradas de um exemplo, cada uma num traço que vai da hora em que abre até a hora em que fecha, e um fio
 * vertical no instante em que mais delas estão abertas ao mesmo tempo. As que estão abertas nesse instante
 * levam a cor do texto e um traço mais grosso; as outras, a cor de apoio. `quando` é o que `picoDeEntradasAbertas` (lib/stats/indicadores-robo)
 * devolve para os mesmos intervalos: o desenho não refaz a conta.
 */
export function EntradasDeExemplo({
  intervalos,
  quando,
  descricao,
  className,
}: {
  intervalos: ReadonlyArray<readonly [abre: number, fecha: number]>;
  quando: number | null;
  descricao: string;
  className?: string;
}) {
  const inicio = Math.min(...intervalos.map((i) => i[0]));
  const fim = Math.max(...intervalos.map((i) => i[1]));
  const pct = (t: number) => (fim === inicio ? 0 : ((t - inicio) / (fim - inicio)) * 100);
  return (
    <div role="img" aria-label={descricao} className={cn("relative", className)}>
      {quando !== null ? <span aria-hidden className="absolute inset-y-0 w-px bg-(--painel-fio-forte)" style={{ left: `${pct(quando)}%` }} /> : null}
      {intervalos.map(([abre, fecha], i) => {
        const aberta = quando !== null && abre <= quando && quando < fecha;
        return (
          <div key={i} className="relative h-5">
            <span
              aria-hidden
              className={cn("absolute top-1/2 -translate-y-1/2", aberta ? "h-[3px] bg-foreground" : "h-0.5 bg-muted-foreground")}
              style={{ left: `${pct(abre)}%`, width: `${pct(fecha) - pct(abre)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
