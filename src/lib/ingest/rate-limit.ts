/**
 * Rate limit por conta, janela fixa de 1 minuto, em memória.
 * Best-effort: cada instância da function tem a própria contagem.
 * Suficiente pro "rate limit básico" da spec; pra algo distribuído, trocar
 * por Upstash/Redis mantendo esta interface.
 */

export const LIMITES_POR_MINUTO = {
  deal: 120,
  heartbeat: 60,
  history: 30,
  reconciliar: 5,
  ping: 30,
} as const;

export type EndpointIngest = keyof typeof LIMITES_POR_MINUTO;

interface Janela {
  inicio: number;
  n: number;
}

const janelas = new Map<string, Janela>();
const JANELA_MS = 60_000;
let ultimaLimpeza = 0;

export interface ResultadoLimite {
  ok: boolean;
  restante: number;
  reiniciaEmSeg: number;
}

export function permitir(
  chave: string,
  limite: number,
  agora: number = Date.now(),
): ResultadoLimite {
  limparExpiradas(agora);

  const j = janelas.get(chave);
  if (!j || agora - j.inicio >= JANELA_MS) {
    janelas.set(chave, { inicio: agora, n: 1 });
    return { ok: true, restante: limite - 1, reiniciaEmSeg: JANELA_MS / 1000 };
  }

  j.n += 1;
  return {
    ok: j.n <= limite,
    restante: Math.max(0, limite - j.n),
    reiniciaEmSeg: Math.max(1, Math.ceil((j.inicio + JANELA_MS - agora) / 1000)),
  };
}

export function permitirEndpoint(
  contaId: string,
  endpoint: EndpointIngest,
  agora: number = Date.now(),
): ResultadoLimite {
  return permitir(`${endpoint}:${contaId}`, LIMITES_POR_MINUTO[endpoint], agora);
}

function limparExpiradas(agora: number) {
  if (agora - ultimaLimpeza < JANELA_MS) return;
  ultimaLimpeza = agora;
  for (const [chave, j] of janelas) {
    if (agora - j.inicio >= JANELA_MS) janelas.delete(chave);
  }
}

/** Só pra testes. */
export function zerarLimites() {
  janelas.clear();
  ultimaLimpeza = 0;
}
