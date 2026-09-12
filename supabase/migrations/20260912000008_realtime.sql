-- =============================================================================
-- 0008 · Realtime por broadcast disparado no banco
--
-- O Realtime do Supabase não assina views. Em vez de expor tabelas privadas,
-- triggers mandam mensagens com EXATAMENTE as colunas das views públicas.
--
-- Topics:  robo:<slug>  eventos: operacao, operacao_removida, posicao,
--                                posicao_fechada, coleta
--          casa         eventos: resumo, coleta, cotacao
--
-- Clientes só recebem (SELECT em realtime.messages). Sem política de INSERT,
-- ninguém injeta mensagem falsa no canal.
-- =============================================================================

create policy "publico recebe broadcasts"
  on realtime.messages
  for select
  to anon, authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      realtime.topic() like 'robo:%'
      or realtime.topic() = 'casa'
    )
  );

-- -----------------------------------------------------------------------------
-- Operações: toda mudança vira evento no topic do robô + resumo da casa
-- -----------------------------------------------------------------------------
create or replace function public.broadcast_operacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug    text;
  v_payload jsonb;
begin
  select r.slug into v_slug
    from public.robos r
   where r.id = coalesce(new.robo_id, old.robo_id)
     and r.conta_principal_id = coalesce(new.conta_id, old.conta_id);

  if v_slug is null then
    return null;  -- conta secundária ou magic não atribuído: nada público
  end if;

  if tg_op = 'DELETE' then
    perform realtime.send(
      jsonb_build_object('id', old.id, 'slug', v_slug),
      'operacao_removida', 'robo:' || v_slug, true);
  else
    select to_jsonb(op) into v_payload
      from public.operacoes_publico op
     where op.id = new.id;
    if v_payload is not null then
      perform realtime.send(v_payload, 'operacao', 'robo:' || v_slug, true);
    end if;
  end if;

  perform realtime.send(public.resumo_casa_hoje(), 'resumo', 'casa', true);
  return null;
end;
$$;

-- Nome com "z" pra disparar DEPOIS de operacoes_estatisticas (ordem alfabética),
-- senão o resumo da casa sairia com a série diária ainda velha.
create trigger operacoes_z_broadcast
  after insert or update or delete on public.operacoes
  for each row execute function public.broadcast_operacao();

-- -----------------------------------------------------------------------------
-- Posições abertas: abertura/fechamento imediatos; flutuante limitado a 1/10s
-- -----------------------------------------------------------------------------
create or replace function public.broadcast_posicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug    text;
  v_atraso  integer;
  v_payload jsonb;
begin
  select r.slug, r.atraso_publico_segundos into v_slug, v_atraso
    from public.robos r
   where r.id = coalesce(new.robo_id, old.robo_id)
     and r.conta_principal_id = coalesce(new.conta_id, old.conta_id);

  if v_slug is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform realtime.send(
      jsonb_build_object('slug', v_slug, 'simbolo', old.simbolo),
      'posicao_fechada', 'robo:' || v_slug, true);
    perform realtime.send(public.resumo_casa_hoje(), 'resumo', 'casa', true);
    return null;
  end if;

  -- respeita o atraso público configurado no robô
  if now() < new.aberta_em + make_interval(secs => v_atraso) then
    return null;
  end if;

  -- só o flutuante mudou: limita a frequência
  if tg_op = 'UPDATE'
     and new.lado = old.lado
     and new.volume = old.volume
     and new.preco_abertura = old.preco_abertura
  then
    if not public.pode_transmitir('posicao:' || v_slug || ':' || new.simbolo, interval '10 seconds') then
      return null;
    end if;
  end if;

  select to_jsonb(p) into v_payload
    from public.posicoes_abertas_publico p
   where p.slug = v_slug and p.simbolo = new.simbolo;

  if v_payload is not null then
    perform realtime.send(v_payload, 'posicao', 'robo:' || v_slug, true);
    if tg_op = 'INSERT' then
      perform realtime.send(public.resumo_casa_hoje(), 'resumo', 'casa', true);
    end if;
  end if;

  return null;
end;
$$;

create trigger posicoes_abertas_broadcast
  after insert or update or delete on public.posicoes_abertas
  for each row execute function public.broadcast_posicao();

-- -----------------------------------------------------------------------------
-- Saúde do coletor: 1 mensagem a cada 30s por robô (o heartbeat é 3s)
-- -----------------------------------------------------------------------------
create or replace function public.broadcast_coleta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_payload jsonb;
begin
  for r in
    select rb.slug, rb.id
      from public.robos rb
     where rb.conta_principal_id = new.conta_id
  loop
    if public.pode_transmitir('coleta:' || r.slug, interval '30 seconds') then
      v_payload := jsonb_build_object(
        'slug', r.slug,
        'ultimo_heartbeat_em', new.ultimo_heartbeat,
        'posicionado', exists (
          select 1 from public.posicoes_abertas_publico p where p.slug = r.slug
        )
      );
      perform realtime.send(v_payload, 'coleta', 'robo:' || r.slug, true);
      perform realtime.send(v_payload, 'coleta', 'casa', true);
    end if;
  end loop;
  return null;
end;
$$;

create trigger coleta_status_broadcast
  after insert or update on public.coleta_status
  for each row execute function public.broadcast_coleta();

-- -----------------------------------------------------------------------------
-- Cotações: 1 mensagem a cada 15s com o mercado inteiro
-- -----------------------------------------------------------------------------
create or replace function public.broadcast_cotacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  if not public.pode_transmitir('cotacao', interval '15 seconds') then
    return null;
  end if;

  select jsonb_build_object('mercado', coalesce(jsonb_agg(to_jsonb(mp)), '[]'::jsonb))
    into v_payload
    from public.mercado_publico mp;

  perform realtime.send(v_payload, 'cotacao', 'casa', true);
  return null;
end;
$$;

create trigger cotacoes_broadcast
  after insert or update on public.cotacoes
  for each row execute function public.broadcast_cotacao();
