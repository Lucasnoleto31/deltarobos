-- =============================================================================
-- 0010 · Ajustes após a primeira carga real
--
-- 1. Conta hedging abre várias posições no mesmo símbolo. A view pública
--    passa a agregar por (robô, símbolo, lado): preço médio ponderado,
--    flutuante por contrato e abertura mais antiga. Nada de volume.
-- 2. Broadcast de operação só quando a operação é de HOJE: carga de
--    histórico não pode disparar milhares de mensagens realtime.
-- 3. Broadcast de posição segue a view agregada.
-- =============================================================================

drop view if exists public.posicoes_abertas_publico;

create view public.posicoes_abertas_publico
with (security_invoker = false)
as
select
  pa.robo_id,
  r.slug,
  pa.simbolo,
  pa.lado,
  round(sum(pa.volume * pa.preco_abertura) / nullif(sum(pa.volume), 0), 3) as preco_abertura,
  round(sum(pa.lucro_flutuante) / nullif(sum(pa.volume), 0), 2)            as lucro_flutuante_por_contrato,
  min(pa.aberta_em)                                                         as aberta_em,
  max(pa.atualizado_em)                                                     as atualizado_em
from public.posicoes_abertas pa
join public.robos r on r.id = pa.robo_id and r.conta_principal_id = pa.conta_id
where now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos)
group by pa.robo_id, r.slug, pa.simbolo, pa.lado;

grant select on public.posicoes_abertas_publico to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Operações: só as de hoje viram evento
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
  v_dia     date := coalesce(new.dia_pregao, old.dia_pregao);
begin
  if v_dia is distinct from public.dia_pregao_de(now()) then
    return null;  -- histórico: sem broadcast
  end if;

  select r.slug into v_slug
    from public.robos r
   where r.id = coalesce(new.robo_id, old.robo_id)
     and r.conta_principal_id = coalesce(new.conta_id, old.conta_id);

  if v_slug is null then
    return null;
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

-- -----------------------------------------------------------------------------
-- Posições: evento com o agregado de (símbolo, lado); some quando zera
-- -----------------------------------------------------------------------------
create or replace function public.broadcast_posicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug     text;
  v_atraso   integer;
  v_simbolo  text := coalesce(new.simbolo, old.simbolo);
  v_lado     public.lado_operacao := coalesce(new.lado, old.lado);
  v_payload  jsonb;
begin
  select r.slug, r.atraso_publico_segundos into v_slug, v_atraso
    from public.robos r
   where r.id = coalesce(new.robo_id, old.robo_id)
     and r.conta_principal_id = coalesce(new.conta_id, old.conta_id);

  if v_slug is null then
    return null;
  end if;

  -- só o flutuante mudou: limita a frequência
  if tg_op = 'UPDATE'
     and new.lado = old.lado
     and new.volume = old.volume
     and new.preco_abertura = old.preco_abertura
  then
    if not public.pode_transmitir('posicao:' || v_slug || ':' || v_simbolo || ':' || v_lado::text,
                                  interval '10 seconds') then
      return null;
    end if;
  end if;

  select to_jsonb(p) into v_payload
    from public.posicoes_abertas_publico p
   where p.slug = v_slug and p.simbolo = v_simbolo and p.lado = v_lado;

  if v_payload is null then
    -- nada aberto nesse símbolo/lado (ou ainda dentro do atraso público)
    if tg_op = 'DELETE' then
      perform realtime.send(
        jsonb_build_object('slug', v_slug, 'simbolo', v_simbolo, 'lado', v_lado),
        'posicao_fechada', 'robo:' || v_slug, true);
      perform realtime.send(public.resumo_casa_hoje(), 'resumo', 'casa', true);
    end if;
    return null;
  end if;

  perform realtime.send(v_payload, 'posicao', 'robo:' || v_slug, true);
  if tg_op <> 'UPDATE' then
    perform realtime.send(public.resumo_casa_hoje(), 'resumo', 'casa', true);
  end if;
  return null;
end;
$$;
