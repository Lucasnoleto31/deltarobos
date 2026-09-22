-- =============================================================================
-- 0022 · Candles M1 do índice enviados pelo EA (DeltaReporter 1.1.0)
--   Pedido (22/09/2026): base para "regimes de volatilidade" do site. O EA,
--   quando InpEnviaCandles = true, manda as barras M1 FECHADAS do símbolo
--   (páginas de 200) em POST /api/ingest/candles; o servidor só guarda.
--   Regras:
--   - Dado de mercado, não de conta: a tabela não tem conta_id nem volume da
--     matriz. É pública (candles_publico) porque não revela nada da casa.
--   - Idempotente por (símbolo, timeframe, abertura da barra): on conflict do
--     nothing. Reenviar é seguro; o EA não tem fila para candles, releitura
--     (backfill a partir de g_candle_ok) é o reenvio.
--   - prefixo_simbolo (WIN, WDO) vem de multiplicadores, como em cotacoes: o
--     símbolo muda a cada vencimento (WINV26, WINZ26...) e o site junta as
--     séries pelo prefixo. Símbolo sem multiplicador é recusado sem erro.
--   - Barra inválida (mínima acima da abertura/fechamento, máxima abaixo)
--     é descartada na função, não derruba o lote; a tabela ainda tem o
--     check para ninguém gravar lixo por outro caminho.
--   - Retenção: ~400 dias. A limpeza roda dentro do próprio gravar_candles
--     com probabilidade de 1% por chamada (sem cron na Vercel).
-- =============================================================================

create table public.candles (
  simbolo          text not null,
  prefixo_simbolo  text not null references public.multiplicadores (prefixo_simbolo),
  timeframe        text not null default 'M1',
  abre_em          timestamptz not null,
  abertura         numeric(14, 3) not null,
  maxima           numeric(14, 3) not null,
  minima           numeric(14, 3) not null,
  fechamento       numeric(14, 3) not null,
  volume_ticks     bigint not null default 0,
  volume_real      numeric,
  primary key (simbolo, timeframe, abre_em),
  check (minima <= least(abertura, fechamento) and maxima >= greatest(abertura, fechamento))
);
create index candles_prefixo_abre_em_idx on public.candles (prefixo_simbolo, timeframe, abre_em desc);
-- a limpeza por idade (gravar_candles) filtra só por abre_em: sem este índice era seq scan
create index candles_abre_em_idx on public.candles (abre_em);

comment on table public.candles is
  'Barras fechadas do índice (M1 por padrão) enviadas pelo EA 1.1.0. Dado de mercado, sem conta nem volume da matriz; base dos regimes de volatilidade.';
comment on column public.candles.abre_em is 'Abertura da barra (iTime), em UTC.';
comment on column public.candles.volume_ticks is 'tick_volume da barra (negócios).';
comment on column public.candles.volume_real is 'real_volume da barra (contratos negociados no mercado), quando a corretora fornece.';

-- -----------------------------------------------------------------------------
-- gravar_candles(conta, corpo): insere o que não existe, descarta o inválido
--    p = { ea_versao, simbolo, timeframe, candles: [{t, o, h, l, c, v, vr}] }
--    p_conta_id é a conta autenticada que mandou (assinatura igual às outras
--    funções de ingest); candles não têm dono, então serve só para recusar
--    chamada sem conta. Devolve {ok, simbolo, prefixo_simbolo, timeframe,
--    recebidos, gravados, ultimo}.
-- -----------------------------------------------------------------------------
create or replace function public.gravar_candles(p_conta_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_simbolo    text  := nullif(upper(trim(p ->> 'simbolo')), '');
  v_prefixo    text  := public.prefixo_de_simbolo(p ->> 'simbolo');
  v_timeframe  text  := coalesce(nullif(upper(trim(p ->> 'timeframe')), ''), 'M1');
  v_candles    jsonb := case when jsonb_typeof(p -> 'candles') = 'array'
                             then p -> 'candles' else '[]'::jsonb end;
  v_n          integer := 0;
  v_ultimo     timestamptz;
begin
  if p_conta_id is null or v_simbolo is null then
    return jsonb_build_object('ok', false, 'motivo', 'conta ou simbolo ausente', 'recebidos', jsonb_array_length(v_candles), 'gravados', 0);
  end if;

  if v_prefixo is null then
    return jsonb_build_object('ok', false, 'motivo', 'simbolo sem multiplicador', 'simbolo', v_simbolo, 'recebidos', jsonb_array_length(v_candles), 'gravados', 0);
  end if;

  insert into public.candles
    (simbolo, prefixo_simbolo, timeframe, abre_em, abertura, maxima, minima, fechamento, volume_ticks, volume_real)
  select
    v_simbolo, v_prefixo, v_timeframe,
    i.t, i.o, i.h, i.l, i.c, i.v, i.vr
  from (
    -- distinct on: a mesma barra duas vezes no lote fica uma só
    select distinct on (t)
      nullif(x ->> 't', '')::timestamptz          as t,
      (x ->> 'o')::numeric                        as o,
      (x ->> 'h')::numeric                        as h,
      (x ->> 'l')::numeric                        as l,
      (x ->> 'c')::numeric                        as c,
      coalesce((x ->> 'v')::numeric, 0)::bigint   as v,
      nullif(x ->> 'vr', '')::numeric             as vr
    from jsonb_array_elements(v_candles) x
    where jsonb_typeof(x) = 'object'
      and (x ? 't') and (x ? 'o') and (x ? 'h') and (x ? 'l') and (x ? 'c')
    order by t
  ) i
  where i.t is not null
    and i.l <= least(i.o, i.c)
    and i.h >= greatest(i.o, i.c)
  on conflict (simbolo, timeframe, abre_em) do nothing;

  get diagnostics v_n = row_count;

  select max(nullif(x ->> 't', '')::timestamptz) into v_ultimo
    from jsonb_array_elements(v_candles) x
   where jsonb_typeof(x) = 'object' and (x ? 't');

  -- retenção: ~400 dias, sem cron (1% das chamadas limpa)
  if random() < 0.01 then
    delete from public.candles where abre_em < now() - interval '400 days';
  end if;

  return jsonb_build_object(
    'ok', true,
    'simbolo', v_simbolo,
    'prefixo_simbolo', v_prefixo,
    'timeframe', v_timeframe,
    'recebidos', jsonb_array_length(v_candles),
    'gravados', v_n,
    'ultimo', v_ultimo
  );
end;
$$;

revoke all on function public.gravar_candles(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.gravar_candles(uuid, jsonb) to service_role;

comment on function public.gravar_candles(uuid, jsonb) is
  'Grava as barras fechadas enviadas pelo EA (on conflict do nothing; barra inválida é descartada; símbolo sem multiplicador é recusado sem erro). Limpa barras com mais de 400 dias em 1% das chamadas. Só service_role.';

-- -----------------------------------------------------------------------------
-- candles_publico: a tabela inteira (é dado de mercado). anon só lê a view.
-- -----------------------------------------------------------------------------
create view public.candles_publico
with (security_invoker = false)
as
select
  c.simbolo,
  c.prefixo_simbolo,
  c.timeframe,
  c.abre_em,
  c.abertura,
  c.maxima,
  c.minima,
  c.fechamento,
  c.volume_ticks,
  c.volume_real
from public.candles c;

grant select on public.candles_publico to anon, authenticated;

comment on view public.candles_publico is
  'Barras fechadas do índice enviadas pelo EA 1.1.0 (M1 por padrão), por símbolo e prefixo. Dado de mercado; sem conta nem volume da matriz.';

-- -----------------------------------------------------------------------------
-- RLS e grants (padrão da 0009)
-- -----------------------------------------------------------------------------
alter table public.candles enable row level security;
create policy "admin tudo" on public.candles for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.candles to authenticated;
grant all on public.candles to service_role;
