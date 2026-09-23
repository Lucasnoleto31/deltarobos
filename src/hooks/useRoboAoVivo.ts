"use client";

import { useEffect, useRef, useState } from "react";
import type { ExposicaoHoje } from "@/lib/stats/exposicao";
import { totalAbertas } from "@/lib/stats/posicoes";
import { LIMITE_SEM_HEARTBEAT_SEG, coletaParada, segundosDesde } from "@/lib/stats/pregao";
import { SALDO_HOJE_VAZIO, baldesDoEvento, ehCorpoSaldoDoDia, fundirBaldes, type SaldoHoje } from "@/lib/stats/saldo-dia";
import { supabaseBrowser } from "@/lib/supabase/cliente";
import type { EventoColeta, EventoSaldo, OperacaoPublica, PosicaoPublica } from "@/lib/tipos";

export interface EstadoRoboAoVivo {
  operacoes: OperacaoPublica[];
  posicoes: PosicaoPublica[];
  ultimoHeartbeatEm: string | null;
  /** última mensagem recebida no canal (qualquer evento) */
  ultimaMensagemEm: string | null;
  conectado: boolean;
  /**
   * MEP/MEN de hoje medidos pelo EA 1.1.0 tick a tick (22/09/2026): a linha de exposicao_dia_publico do
   * dia, atualizada pelo evento "coleta". null = sem medição (EA antigo, robô sem coletor, dia sem operação).
   */
  exposicaoHoje: ExposicaoHoje | null;
  /**
   * A série do saldo de hoje medida pelo EA 1.1.2 (23/09/2026): os baldes de saldo_dia_publico do dia,
   * carregados pela rota /api/robos/[slug]/saldo/[dia] e refinados pelo evento "saldo". Nasce vazia e
   * `carregado: false` nos dois lados (servidor e hidratação); a tela só desenha a série depois da
   * primeira resposta da rota, e até lá fica na curva por fechamento.
   */
  saldoHoje: SaldoHoje;
}

/** Opções do hook (23/09/2026). */
export interface OpcoesRoboAoVivo {
  /**
   * O pregão está aberto agora (vem do provider, que já calcula isto a cada 30 s). Guardado em ref e lido só
   * pelo vigia da série do saldo: não entra nas deps do efeito, senão a abertura do pregão remontaria o canal.
   */
  pregaoAberto?: boolean;
  /**
   * O robô tem coletor (robos.tem_coletor). Com false (só histórico importado) não há série do saldo a pedir: nem
   * a carga na assinatura, nem a volta do segundo plano, nem o vigia (revisão de 23/09/2026: cada SUBSCRIBED fazia
   * um GET à rota para receber uma lista vazia). Padrão true, para quem monta o hook sem saber.
   */
  temColetor?: boolean;
}

/** Quanto tempo o vigia tolera sem dado novo da série (pela hora de chegada), com o pregão aberto e o coletor em dia, antes de reler a rota; também o salto entre baldes que conta como buraco. */
const ATRASO_SALDO_SEG = 60;
/** Intervalo mínimo entre duas releituras não forçadas da rota do saldo (o vigia roda a cada 30 s). */
const INTERVALO_MINIMO_SALDO_MS = 60_000;
/** Quantas releituras fora do fluxo normal (primeira carga que falhou fora do pregão, buraco na série) o vigia insiste antes de desistir. */
const TENTATIVAS_EXTRA = 3;
/** Quanto esperar depois de marcar um buraco antes de reler: a foto de hoje fica até 15 s no CDN + 15 s de SWR, e uma leitura antes disso traria a foto de ANTES do reenvio que abriu o buraco. */
const ESPERA_BURACO_MS = 30_000;

/** Um trecho da série de hoje que a tela não tem e o banco pode ter (epoch em segundos), com a contagem de releituras. */
interface Buraco {
  de: number;
  ate: number;
  desdeMs: number;
  tentativas: number;
}

export interface InicialRoboAoVivo {
  operacoes: OperacaoPublica[];
  posicoes: PosicaoPublica[];
  ultimoHeartbeatEm: string | null;
  /** dia de pregão (YYYY-MM-DD) que o painel "hoje" representa */
  dia: string;
  /** MEP/MEN de hoje pelo EA (listarExposicaoDia com dia = hoje); opcional para quem monta o estado sem ele */
  exposicaoHoje?: ExposicaoHoje | null;
}

/**
 * O evento "coleta" traz, desde a migration 0021, os campos de exposicao_dia_publico de hoje (EventoColeta
 * já os declara; as horas do extremo não vêm no evento, mas entram se um dia vierem). Evento anterior à
 * migration vem sem nenhum deles.
 */
type ColetaComExposicao = EventoColeta & Partial<ExposicaoHoje>;

/** A coleta trouxe os campos de MEP/MEN? Só então ela substitui o que a tela tem (evento antigo não apaga nada). */
function exposicaoDaColeta(c: ColetaComExposicao): ExposicaoHoje | null | undefined {
  if (!("mep_ea" in c) && !("men_ea" in c)) return undefined;
  if (typeof c.mep_ea !== "number" && typeof c.men_ea !== "number") return null;
  return {
    mep_ea: typeof c.mep_ea === "number" ? c.mep_ea : null,
    men_ea: typeof c.men_ea === "number" ? c.men_ea : null,
    mep_ea_n_saidas: typeof c.mep_ea_n_saidas === "number" ? c.mep_ea_n_saidas : null,
    men_ea_n_saidas: typeof c.men_ea_n_saidas === "number" ? c.men_ea_n_saidas : null,
    excursao_ea_parcial: c.excursao_ea_parcial === true,
    mep_ea_em: typeof c.mep_ea_em === "string" ? c.mep_ea_em : null,
    men_ea_em: typeof c.men_ea_em === "string" ? c.men_ea_em : null,
  };
}

function ordenarOperacoes(lista: OperacaoPublica[]): OperacaoPublica[] {
  return [...lista].sort(
    (a, b) => new Date(a.fechamento_em).getTime() - new Date(b.fechamento_em).getTime(),
  );
}

/**
 * Assina o topic privado robo:<slug> e aplica os eventos em cima dos dados
 * que vieram do servidor. Sem F5.
 */
export function useRoboAoVivo(slug: string, inicial: InicialRoboAoVivo, opcoes: OpcoesRoboAoVivo = {}): EstadoRoboAoVivo {
  const [estado, setEstado] = useState<EstadoRoboAoVivo>({
    operacoes: ordenarOperacoes(inicial.operacoes),
    posicoes: inicial.posicoes,
    ultimoHeartbeatEm: inicial.ultimoHeartbeatEm,
    ultimaMensagemEm: null,
    conectado: false,
    exposicaoHoje: inicial.exposicaoHoje ?? null,
    saldoHoje: SALDO_HOJE_VAZIO,
  });

  // As posições mais recentes, para o handler do evento "coleta" comparar sem depender do closure do
  // efeito (que só vê o estado do primeiro render). Escrita no efeito, lida só em handler: nunca no render.
  const posicoesAtuais = useRef<PosicaoPublica[]>(inicial.posicoes);
  useEffect(() => {
    posicoesAtuais.current = estado.posicoes;
  }, [estado.posicoes]);
  // O mesmo padrão para o vigia da série do saldo (23/09/2026): o pregão, o último heartbeat e a série como
  // estão agora, lidos só dentro do setInterval, sem remontar o canal a cada mudança deles.
  const pregaoAbertoRef = useRef(opcoes.pregaoAberto === true);
  useEffect(() => {
    pregaoAbertoRef.current = opcoes.pregaoAberto === true;
  }, [opcoes.pregaoAberto]);
  const heartbeatRef = useRef<string | null>(inicial.ultimoHeartbeatEm);
  useEffect(() => {
    heartbeatRef.current = estado.ultimoHeartbeatEm;
  }, [estado.ultimoHeartbeatEm]);
  const saldoRef = useRef<SaldoHoje>(SALDO_HOJE_VAZIO);
  useEffect(() => {
    saldoRef.current = estado.saldoHoje;
  }, [estado.saldoHoje]);
  // fixo por página (o robô não muda de coletor com ela aberta): entra nas deps por honestidade, sem remontar nada
  const temColetor = opcoes.temColetor !== false;

  useEffect(() => {
    let sb: ReturnType<typeof supabaseBrowser>;
    try {
      sb = supabaseBrowser();
    } catch (e) {
      console.warn("[realtime] sem configuração do Supabase no cliente", e);
      return;
    }

    const marcar = () => new Date().toISOString();
    const canal = sb.channel(`robo:${slug}`, { config: { private: true } });

    // Sobem a cada evento que mexe na lista. A ressincronização guarda o valor antes de consultar e, se
    // chegou evento enquanto a consulta estava no ar, não aplica a foto: o evento é mais novo que ela.
    // Sem isso, um "posicao_fechada" recebido durante a consulta era atropelado pela resposta, que
    // ressuscitava o grupo fechado, e nada corrigia depois (21/09/2026).
    let versaoPosicoes = 0;
    let versaoOperacoes = 0;

    // O pedido da série do saldo em voo e quando saiu o último (ver carregarSaldo, abaixo). Declarados antes
    // dos handlers do canal, que os usam.
    let pedidoSaldo: AbortController | null = null;
    let ultimoPedidoSaldoEm = 0;
    // O trecho da série que falta (ver o handler de "saldo"): um só, esticado se outro aparecer antes de
    // fechar; as tentativas não zeram, para um salto marcado a cada evento (ativo sem tick por mais de um
    // minuto) não virar releitura sem fim: no máximo TENTATIVAS_EXTRA por buraco marcado.
    let buraco: Buraco | null = null;
    function marcarBuraco(de: number, ate: number) {
      if (!temColetor || !(ate > de)) return;
      buraco = buraco ? { ...buraco, de: Math.min(buraco.de, de), ate: Math.max(buraco.ate, ate) } : { de, ate, desdeMs: Date.now(), tentativas: 0 };
    }
    function pedirSaldo(forcar: boolean): boolean {
      if (pedidoSaldo !== null) return false;
      if (!forcar && Date.now() - ultimoPedidoSaldoEm < INTERVALO_MINIMO_SALDO_MS) return false;
      ultimoPedidoSaldoEm = Date.now();
      const controle = new AbortController();
      pedidoSaldo = controle;
      void carregarSaldo(controle);
      return true;
    }

    canal
      .on("broadcast", { event: "operacao" }, ({ payload }) => {
        const op = payload as OperacaoPublica;
        if (op.dia_pregao !== inicial.dia) return;
        versaoOperacoes++;
        setEstado((s) => ({
          ...s,
          operacoes: ordenarOperacoes([...s.operacoes.filter((o) => o.id !== op.id), op]),
          ultimaMensagemEm: marcar(),
        }));
      })
      .on("broadcast", { event: "operacao_removida" }, ({ payload }) => {
        const { id } = payload as { id: number };
        versaoOperacoes++;
        setEstado((s) => ({
          ...s,
          operacoes: s.operacoes.filter((o) => o.id !== id),
          ultimaMensagemEm: marcar(),
        }));
      })
      // posições vêm agregadas por (símbolo, lado); cada evento é a linha inteira da view, então o
      // n_abertas do grupo (operações em aberto, 21/09/2026) chega junto e substitui o anterior
      .on("broadcast", { event: "posicao" }, ({ payload }) => {
        const p = payload as PosicaoPublica;
        versaoPosicoes++;
        setEstado((s) => ({
          ...s,
          posicoes: [
            ...s.posicoes.filter((x) => !(x.simbolo === p.simbolo && x.lado === p.lado)),
            p,
          ],
          ultimaMensagemEm: marcar(),
        }));
      })
      .on("broadcast", { event: "posicao_fechada" }, ({ payload }) => {
        const { simbolo, lado } = payload as { simbolo: string; lado?: PosicaoPublica["lado"] };
        versaoPosicoes++;
        setEstado((s) => ({
          ...s,
          posicoes: s.posicoes.filter(
            (x) => !(x.simbolo === simbolo && (lado === undefined || x.lado === lado)),
          ),
          ultimaMensagemEm: marcar(),
        }));
      })
      // A série do saldo de hoje (23/09/2026): os baldes públicos gravados nos últimos 30 s, sem replay, e
      // cada balde chega mais de uma vez enquanto o EA o refina (o mínimo desce, o máximo sobe, o último
      // muda): a fusão é por instante (upsert), nunca uma lista que cresce. Vale mesmo antes de a rota
      // responder: o que chegou fica guardado e entra no desenho junto com a primeira carga.
      .on("broadcast", { event: "saldo" }, ({ payload }) => {
        const ev = payload as EventoSaldo;
        if (ev.dia !== inicial.dia) return;
        const novos = baldesDoEvento(ev);
        if (novos.length === 0) return;
        // Buraco no MEIO da série (revisão de 23/09/2026): o evento só traz baldes com início nos últimos 2 min.
        // Se o EA ficou sem alcançar o servidor por mais que isso (a fila de 720 baldes existe para isso) e depois
        // descarregou a fila, o banco tem tudo, mas o evento entrega só a ponta: entre o último balde da tela e o
        // primeiro novo fica um salto que nenhum evento posterior fecha, e o vigia, que olha só a cauda (fresca
        // de novo), também não veria; a curva desenharia uma reta por cima de baldes que existem, o "não foi
        // assim que ocorreu" do pedido, até um F5. Então é aqui que o buraco se marca, e o vigia relê a rota
        // depois da janela do CDN, até 3 vezes, enquanto a foto não trouxer balde de dentro dele.
        const s = saldoRef.current;
        const n = s.baldes.length;
        if (s.carregado && n > 0) {
          const ultimoT = s.baldes[n - 1][0];
          const primeiroNovo = novos.find((b) => b[0] > ultimoT);
          if (primeiroNovo && primeiroNovo[0] - (ultimoT + s.bucketSeg) > ATRASO_SALDO_SEG) marcarBuraco(ultimoT + s.bucketSeg, primeiroNovo[0]);
        }
        setEstado((s) => ({
          ...s,
          ultimaMensagemEm: marcar(),
          saldoHoje: { ...s.saldoHoje, baldes: fundirBaldes(s.saldoHoje.baldes, novos), atualizadoEm: marcar() },
        }));
      })
      .on("broadcast", { event: "coleta" }, ({ payload }) => {
        const c = payload as ColetaComExposicao;
        // Coletor que voltou depois de calado (revisão de 23/09/2026): o heartbeat anterior há mais de
        // LIMITE_SEM_HEARTBEAT_SEG e um novo agora. O EA reenvia a fila de baldes no primeiro heartbeat aceito;
        // se o evento "saldo" desse reenvio se perder (throttle, aba dormindo), a série ficaria com o buraco do
        // silêncio. Marca o trecho calado como buraco e o vigia relê a rota, como no handler de "saldo".
        const calado = segundosDesde(heartbeatRef.current, new Date());
        if (calado !== null && calado > LIMITE_SEM_HEARTBEAT_SEG) {
          const agoraSeg = Math.floor(Date.now() / 1000);
          marcarBuraco(agoraSeg - calado, agoraSeg);
        }
        // O broadcast não tem replay: um "posicao_fechada" perdido (aba em segundo plano, reconexão no
        // meio) deixava o grupo preso e "2 operações em aberto" congelado até a próxima reconexão. A
        // coleta traz n_posicoes_abertas a cada <= 30 s: quando diverge do que a tela soma, ressincroniza.
        // A coleta conta antes da sincronização do mesmo heartbeat, então a divergência pode ser
        // passageira; a ressincronização (quatro consultas pequenas) resolve nos dois casos.
        if (
          typeof c.n_posicoes_abertas === "number" &&
          c.n_posicoes_abertas !== totalAbertas(posicoesAtuais.current)
        ) {
          void ressincronizar();
        }
        // MEP/MEN de hoje pelo EA (22/09/2026): a coleta traz a linha de exposicao_dia_publico do dia
        const exposicao = exposicaoDaColeta(c);
        setEstado((s) => ({
          ...s,
          ultimoHeartbeatEm: c.ultimo_heartbeat_em ?? s.ultimoHeartbeatEm,
          ultimaMensagemEm: marcar(),
          exposicaoHoje: exposicao === undefined ? s.exposicaoHoje : exposicao,
        }));
      })
      .subscribe((status) => {
        setEstado((s) => ({ ...s, conectado: status === "SUBSCRIBED" }));
        // Ao (re)conectar, busca o estado atual: cobre o que aconteceu entre o
        // render em cache do servidor e a assinatura, ou durante uma queda.
        // A série do saldo vai junto (23/09/2026): o evento "saldo" só cobre os últimos 30 s, então
        // uma queda maior que isso deixa buraco, e a rota é quem o preenche. Sem coletor não há série.
        if (status === "SUBSCRIBED") {
          void ressincronizar();
          if (temColetor) pedirSaldo(true);
        }
      });

    async function ressincronizar() {
      const vPos = versaoPosicoes;
      const vOps = versaoOperacoes;
      try {
        const [ops, pos, robo, exposicao] = await Promise.all([
          sb
            .from("operacoes_publico")
            .select("*")
            .eq("slug", slug)
            .eq("dia_pregao", inicial.dia)
            .order("fechamento_em", { ascending: true }),
          // "*" traz n_abertas junto quando a view tiver a coluna (migration 0020)
          sb.from("posicoes_abertas_publico").select("*").eq("slug", slug),
          sb.from("robos_publico").select("ultimo_heartbeat_em").eq("slug", slug).maybeSingle(),
          // MEP/MEN de hoje pelo EA (migration 0021); view ausente vira erro, e a tela fica com o que tem
          sb
            .from("exposicao_dia_publico")
            .select("mep_ea, men_ea, mep_ea_em, men_ea_em, mep_ea_n_saidas, men_ea_n_saidas, excursao_ea_parcial")
            .eq("slug", slug)
            .eq("dia", inicial.dia)
            .maybeSingle(),
        ]);
        setEstado((s) => ({
          ...s,
          // foto só entra se nenhum evento da lista chegou enquanto a consulta estava no ar
          operacoes:
            ops.data && vOps === versaoOperacoes
              ? ordenarOperacoes(ops.data as OperacaoPublica[])
              : s.operacoes,
          posicoes: pos.data && vPos === versaoPosicoes ? (pos.data as PosicaoPublica[]) : s.posicoes,
          ultimoHeartbeatEm:
            (robo.data?.ultimo_heartbeat_em as string | null | undefined) ?? s.ultimoHeartbeatEm,
          // sem linha (data null, sem erro) é "ainda sem medição hoje"; erro (view ausente) mantém o que há
          exposicaoHoje: exposicao.error ? s.exposicaoHoje : ((exposicao.data as unknown as ExposicaoHoje | null) ?? null),
        }));
      } catch (e) {
        console.warn("[realtime] falha ao ressincronizar robô", e);
      }
    }

    // A série do saldo pela rota (23/09/2026): a foto inteira do dia, fundida por instante com o que os
    // eventos já trouxeram. Um pedido por vez; sem `forcar`, no máximo um por minuto (o vigia e a volta
    // do segundo plano podem pedir seguidos). A resposta troca `carregado` para true, e só então a tela
    // desenha a série. Falha (rede, 503 do banco, corpo estranho) fica em `erro` para o vigia tentar de
    // novo; o que já foi desenhado continua na tela. pedirSaldo faz as conferências síncronas e diz se o
    // pedido saiu (os contadores do vigia só contam pedido que saiu); carregarSaldo é o pedido em si.
    async function carregarSaldo(controle: AbortController) {
      const falhar = (erro: string) => setEstado((s) => ({ ...s, saldoHoje: { ...s.saldoHoje, erro } }));
      try {
        const resposta = await fetch(`/api/robos/${encodeURIComponent(slug)}/saldo/${inicial.dia}`, { signal: controle.signal });
        if (controle.signal.aborted) return;
        if (!resposta.ok) {
          falhar(`saldo: HTTP ${resposta.status}`);
          return;
        }
        const corpo: unknown = await resposta.json();
        if (controle.signal.aborted) return;
        // o JSON vem de fora: a forma é conferida antes de entrar no estado, como mesmoRecorte faz com a curva
        if (!ehCorpoSaldoDoDia(corpo) || corpo.dia !== inicial.dia) {
          falhar("saldo: resposta em formato inesperado");
          return;
        }
        // os `fechamentos` da rota não entram aqui: a tela já tem as operações do dia ao vivo (estado.operacoes)
        setEstado((s) => ({
          ...s,
          saldoHoje: {
            baldes: fundirBaldes(s.saldoHoje.baldes, corpo.baldes),
            aproximado: corpo.aproximado,
            bucketSeg: corpo.bucketSeg,
            carregado: true,
            erro: null,
            atualizadoEm: marcar(),
          },
        }));
        // a foto trouxe balde de dentro do buraco: fechado (se não trouxe, o EA não mediu ali ou a foto ainda
        // era velha, e o vigia insiste até o teto)
        if (buraco !== null) {
          const { de, ate } = buraco;
          if (corpo.baldes.some((b) => b[0] >= de && b[0] < ate)) buraco = null;
        }
      } catch (e) {
        if (controle.signal.aborted) return;
        falhar(`saldo: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (pedidoSaldo === controle) pedidoSaldo = null;
      }
    }

    // Voltar do segundo plano (aba escondida, tela do celular apagada): o navegador segura os eventos
    // enquanto a aba dorme e o broadcast não tem replay, então a série relê a foto (sem forçar: se a
    // última carga é de menos de um minuto, o buraco cabe nos 30 s do evento). Sem coletor, nada disto.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") pedirSaldo(false);
    };
    if (temColetor) document.addEventListener("visibilitychange", aoVoltar);

    // O vigia (23/09/2026): a cada 30 s, com o pregão aberto e o coletor em dia (heartbeat recente), relê a
    // rota se a última carga falhou ou se a série parou de andar há mais de um minuto (nenhum balde novo
    // chegou pelo evento: assinatura muda sem SUBSCRIBED novo, evento perdido). Fora do pregão ou com o
    // coletor parado não há balde novo a esperar, e o vigia fica quieto. Série ainda vazia (EA antigo)
    // também: não adianta pedir de novo o que não existe. Duas exceções, cada uma com teto de
    // TENTATIVAS_EXTRA pedidos (revisão de 23/09/2026): a PRIMEIRA carga que falhou (quem abre a página à noite
    // e pega um 503 ficava por fechamento até o F5, com a série inteira no banco) e o BURACO marcado pelos
    // handlers, que relê depois da janela do CDN. O limite de um pedido por minuto vale para as duas.
    let tentativasPrimeiraCarga = 0;
    const vigia = temColetor
      ? window.setInterval(() => {
          const saldo = saldoRef.current;
          // esgotadas as tentativas, cai no fluxo normal (que insiste enquanto o pregão estiver aberto e o coletor em dia)
          if (saldo.erro !== null && !saldo.carregado && tentativasPrimeiraCarga < TENTATIVAS_EXTRA) {
            if (pedirSaldo(false)) tentativasPrimeiraCarga++;
            return;
          }
          if (buraco !== null && Date.now() - buraco.desdeMs >= ESPERA_BURACO_MS) {
            if (buraco.tentativas >= TENTATIVAS_EXTRA) buraco = null;
            else if (pedirSaldo(false)) buraco.tentativas++;
            return;
          }
          if (!pregaoAbertoRef.current) return;
          if (coletaParada(heartbeatRef.current, new Date(), true)) return;
          // "Parou de andar" se mede pela hora de CHEGADA do último dado (atualizadoEm, relógio do navegador), não pelo
          // instante do último balde: o balde vem no relógio do servidor da corretora, que em 23/09/2026 estava ~45 s
          // atrás do relógio do banco; somado ao fechamento do balde e ao CDN, o instante do balde ficava sempre
          // "atrasado" mais de um minuto e o vigia relia a rota a cada minuto com a série em dia
          const n = saldo.baldes.length;
          const chegouHa = saldo.atualizadoEm === null ? null : Date.now() - new Date(saldo.atualizadoEm).getTime();
          const atrasada = n > 0 && chegouHa !== null && chegouHa > ATRASO_SALDO_SEG * 1000;
          if (saldo.erro !== null || atrasada) pedirSaldo(false);
        }, 30_000)
      : null;

    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      if (vigia !== null) window.clearInterval(vigia);
      pedidoSaldo?.abort();
      void sb.removeChannel(canal);
    };
  }, [slug, inicial.dia, temColetor]);

  return estado;
}
