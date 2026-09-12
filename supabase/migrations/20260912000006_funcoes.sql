-- =============================================================================
-- 0006 · Funções de apoio (auth, tokens, ingest, resumo)
-- =============================================================================

-- Usuário logado é admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
     where user_id = auth.uid() and role = 'admin'
  );
$$;

-- Role do usuário logado (usado nas políticas pra impedir auto-promoção)
create or replace function public.role_atual()
returns public.role_perfil
language sql
stable
security definer
set search_path = public
as $$
  select role from public.perfis where user_id = auth.uid();
$$;

-- Gera um token novo pro coletor de uma conta. Devolve o token em claro UMA vez
-- e grava só o hash. Só service_role/postgres executam (ver grants na 0009).
create or replace function public.gerar_token_coletor(p_conta_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_hash  text;
begin
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  update public.contas_matriz
     set token_hash = v_hash
   where id = p_conta_id;

  if not found then
    raise exception 'conta % não encontrada', p_conta_id;
  end if;

  return v_token;
end;
$$;

-- Prefixo (WIN, WDO) de um símbolo (WINV26, WDOZ26...). Prefixo mais longo vence.
create or replace function public.prefixo_de_simbolo(p_simbolo text)
returns text
language sql
stable
as $$
  select m.prefixo_simbolo
    from public.multiplicadores m
   where upper(p_simbolo) like m.prefixo_simbolo || '%'
   order by length(m.prefixo_simbolo) desc
   limit 1;
$$;

-- Robô de um (conta, magic). Nulo = não atribuído.
create or replace function public.robo_por_magic(p_conta_id uuid, p_magic bigint)
returns uuid
language sql
stable
as $$
  select robo_id from public.robo_conta_magic
   where conta_id = p_conta_id and magic = p_magic;
$$;

-- Throttle de broadcast: devolve true se passou o intervalo desde a última vez
create or replace function public.pode_transmitir(p_chave text, p_intervalo interval)
returns boolean
language plpgsql
as $$
declare
  v_ultimo timestamptz;
begin
  select ultimo_em into v_ultimo
    from public.broadcast_controle
   where chave = p_chave
     for update;

  if v_ultimo is not null and now() - v_ultimo < p_intervalo then
    return false;
  end if;

  insert into public.broadcast_controle (chave, ultimo_em)
  values (p_chave, now())
  on conflict (chave) do update set ultimo_em = now();

  return true;
end;
$$;

-- Heartbeat do EA: tudo numa transação só.
-- p = { ea_versao, em, balance, equity, posicoes: [...], cotacoes: [...] }
create or replace function public.atualizar_heartbeat(p_conta_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_em        timestamptz := coalesce(nullif(p ->> 'em', '')::timestamptz, now());
  v_posicoes  jsonb := coalesce(p -> 'posicoes', '[]'::jsonb);
  v_cotacoes  jsonb := coalesce(p -> 'cotacoes', '[]'::jsonb);
begin
  -- 1. status do coletor
  insert into public.coleta_status as cs
    (conta_id, ultimo_heartbeat, versao_ea, balance, equity, n_posicoes, atualizado_em)
  values (
    p_conta_id, now(), nullif(p ->> 'ea_versao', ''),
    nullif(p ->> 'balance', '')::numeric, nullif(p ->> 'equity', '')::numeric,
    jsonb_array_length(v_posicoes), now()
  )
  on conflict (conta_id) do update set
    ultimo_heartbeat = now(),
    versao_ea        = coalesce(excluded.versao_ea, cs.versao_ea),
    balance          = coalesce(excluded.balance, cs.balance),
    equity           = coalesce(excluded.equity, cs.equity),
    n_posicoes       = excluded.n_posicoes,
    atualizado_em    = now();

  -- 2. posições: remove as que sumiram
  delete from public.posicoes_abertas pa
   where pa.conta_id = p_conta_id
     and not exists (
       select 1 from jsonb_array_elements(v_posicoes) x
        where (x ->> 'ticket')::bigint = pa.ticket
     );

  -- 3. posições: upsert das presentes
  insert into public.posicoes_abertas as pa
    (conta_id, ticket, robo_id, magic, simbolo, lado, volume, preco_abertura,
     lucro_flutuante, aberta_em, atualizado_em)
  select
    p_conta_id,
    (x ->> 'ticket')::bigint,
    public.robo_por_magic(p_conta_id, coalesce((x ->> 'magic')::bigint, 0)),
    coalesce((x ->> 'magic')::bigint, 0),
    x ->> 'simbolo',
    (x ->> 'lado')::public.lado_operacao,
    (x ->> 'volume')::numeric,
    (x ->> 'preco_abertura')::numeric,
    coalesce((x ->> 'lucro_flutuante')::numeric, 0),
    coalesce(nullif(x ->> 'aberta_em', '')::timestamptz, now()),
    now()
  from jsonb_array_elements(v_posicoes) x
  on conflict (conta_id, ticket) do update set
    robo_id          = excluded.robo_id,
    magic            = excluded.magic,
    simbolo          = excluded.simbolo,
    lado             = excluded.lado,
    volume           = excluded.volume,
    preco_abertura   = excluded.preco_abertura,
    lucro_flutuante  = excluded.lucro_flutuante,
    aberta_em        = least(pa.aberta_em, excluded.aberta_em),
    atualizado_em    = now();

  -- 4. snapshot: 1 por minuto
  if (p ? 'balance') and (p ? 'equity') then
    insert into public.snapshots_conta (conta_id, balance, equity, em, minuto)
    values (p_conta_id, (p ->> 'balance')::numeric, (p ->> 'equity')::numeric,
            v_em, date_trunc('minute', v_em))
    on conflict (conta_id, minuto) do nothing;
  end if;

  -- 5. cotações
  insert into public.cotacoes as c (simbolo, prefixo_simbolo, preco, fechamento_anterior, em)
  select
    upper(x ->> 'simbolo'),
    public.prefixo_de_simbolo(x ->> 'simbolo'),
    (x ->> 'preco')::numeric,
    nullif(x ->> 'fechamento_anterior', '')::numeric,
    now()
  from jsonb_array_elements(v_cotacoes) x
  where public.prefixo_de_simbolo(x ->> 'simbolo') is not null
    and (x ->> 'preco')::numeric > 0
  on conflict (simbolo) do update set
    preco               = excluded.preco,
    fechamento_anterior = coalesce(excluded.fechamento_anterior, c.fechamento_anterior),
    em                  = now();

  return jsonb_build_object('ok', true, 'servidor_em', now());
end;
$$;

-- Depois de mapear um magic novo no admin, atribui deals/operações antigas
-- daquele (conta, magic) ao robô.
create or replace function public.reatribuir_magic(p_conta_id uuid, p_magic bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_robo uuid;
  v_n    integer;
begin
  select robo_id into v_robo
    from public.robo_conta_magic
   where conta_id = p_conta_id and magic = p_magic;

  update public.deals set robo_id = v_robo
   where conta_id = p_conta_id and magic = p_magic
     and robo_id is distinct from v_robo;
  get diagnostics v_n = row_count;

  update public.operacoes o set robo_id = v_robo
   where o.conta_id = p_conta_id
     and o.robo_id is distinct from v_robo
     and exists (
       select 1 from public.deals d
        where d.conta_id = o.conta_id and d.posicao_id = o.posicao_id and d.magic = p_magic
     );

  update public.posicoes_abertas set robo_id = v_robo
   where conta_id = p_conta_id and magic = p_magic;

  return v_n;
end;
$$;

-- Resumo público do dia da casa (usado na home e no broadcast do topic "casa").
-- Só dados públicos: nada de conta, volume ou token.
create or replace function public.resumo_casa_hoje()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (
    select public.dia_pregao_de(now()) as dia
  ),
  por_robo as (
    select
      r.slug,
      r.nome,
      r.status,
      coalesce(e.resultado_brl_por_contrato, 0)                                   as resultado_bruto_por_contrato,
      coalesce(e.resultado_brl_por_contrato, 0) - coalesce(e.custos_brl_por_contrato, 0) as resultado_liquido_por_contrato,
      coalesce(e.pontos_por_contrato, 0)                                          as pontos_por_contrato,
      coalesce(e.n_operacoes, 0)                                                  as n_operacoes,
      coalesce(e.n_gain, 0)                                                       as n_gain,
      exists (
        select 1 from public.posicoes_abertas pa
         where pa.robo_id = r.id
           and pa.conta_id = r.conta_principal_id
           and now() >= pa.aberta_em + make_interval(secs => r.atraso_publico_segundos)
      ) as posicionado
    from public.robos r
    cross join hoje h
    left join public.estatisticas_diarias e on e.robo_id = r.id and e.dia = h.dia
    where r.status in ('ativo', 'pausado')
  )
  select jsonb_build_object(
    'dia', (select dia from hoje),
    'resultado_bruto_por_contrato',   coalesce(sum(resultado_bruto_por_contrato), 0),
    'resultado_liquido_por_contrato', coalesce(sum(resultado_liquido_por_contrato), 0),
    'n_operacoes',                    coalesce(sum(n_operacoes), 0),
    'n_gain',                         coalesce(sum(n_gain), 0),
    'n_robos_posicionados',           count(*) filter (where posicionado),
    'robos', coalesce(jsonb_agg(jsonb_build_object(
      'slug', slug,
      'nome', nome,
      'status', status,
      'resultado_bruto_por_contrato', resultado_bruto_por_contrato,
      'resultado_liquido_por_contrato', resultado_liquido_por_contrato,
      'pontos_por_contrato', pontos_por_contrato,
      'n_operacoes', n_operacoes,
      'n_gain', n_gain,
      'posicionado', posicionado
    ) order by resultado_liquido_por_contrato desc), '[]'::jsonb),
    'gerado_em', now()
  )
  from por_robo;
$$;
