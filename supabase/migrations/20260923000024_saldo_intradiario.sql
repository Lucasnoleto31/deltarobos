-- =============================================================================
-- 0024 · Série do saldo do dia medida pelo EA (DeltaReporter 1.1.2)
--   Pedido (23/09/2026): o site vai desenhar a CURVA REAL do dia do robô (o
--   "calor" que ele passou com a posição aberta, não só o degrau de cada
--   fechamento). O MEP/MEN da 0021/0023 dá os dois extremos; falta o caminho.
--   O EA 1.1.2 passa a gravar a série: a cada InpSaldoBucketSeg (padrão 5 s)
--   fecha um BALDE com o mínimo, o máximo e o último valor do saldo do dia do
--   magic (realizado + flutuante, EXATAMENTE o valor que já alimenta o MEP/MEN
--   da 1.1.1, com as regras públicas aplicadas) e manda os baldes fechados e
--   ainda não confirmados no heartbeat:
--     "saldo_dia": [{"magic": 1001, "dia": "2026-09-23", "regras_aplicadas": true,
--                    "baldes": [[t_epoch_utc_s, min, max, ultimo], ...]}]
--   Em 2xx o EA marca os baldes como enviados; em falha mantém e o próximo
--   heartbeat reenvia (aqui é upsert, então reenvio é seguro). O balde corrente
--   (ainda aberto) nunca vem.
--   Regras:
--   - Tabela saldo_intradiario por (conta, magic, em = início do balde), em
--     R$ BRUTOS por contrato com 4 casas. dia é o do servidor do MT5 (Brasília)
--     e só entram dias entre ontem e amanhã, como em exposicao_dia.
--   - gravar_saldo_intradiario(conta, saldo_dia): tolerante a lixo (item que
--     não é objeto, magic/dia fora do formato, balde que não é [n, n, n, n],
--     t absurdo, valor que não cabe em numeric(14,4) depois de arredondado a
--     4 casas) descartado sem erro. Além disso a chamada no heartbeat (passo
--     0c) roda numa subtransação própria: erro inesperado (trigger, lock,
--     estouro) vira WARNING e o resto do heartbeat (status, posições,
--     cotações) é gravado. O heartbeat nunca cai por causa da série. Teto de
--     2000 baldes por chamada (o EA manda no máximo 720 por magic); ficam os
--     mais antigos. Retenção de ~400 dias em 1% das chamadas, sem cron
--     (padrão da 0022).
--   - Upsert por balde: min = least, max = greatest, último = o que chegou,
--     regras_aplicadas = e OR excluded (grudenta, como na 0023). Refinamento
--     no padrão da 0023: balde COM regras chegando numa linha SEM regras
--     SUBSTITUI min/max/último (o saldo sem regras inclui operação escondida
--     e não pode contaminar o mínimo/máximo público); balde SEM regras sobre
--     linha COM regras é ignorado. Mesma marca: least/greatest/último. Reenvio
--     igual não escreve (atualizado_em só muda com escrita real).
--   - View saldo_dia_publico: só conta principal, só regras_aplicadas = true
--     e só dia sem importação manual (mesmo predicado da exposicao_dia_publico).
--     Robô com UM magic medindo o dia (o caso hoje): min/max/último do balde.
--     Robô com MAIS de um magic: soma dos "último" dos magics no mesmo balde,
--     com min = max = essa soma (APROXIMAÇÃO documentada: a soma dos mínimos
--     não é o mínimo da soma, então o extremo intra-balde não é publicado);
--     n_magics avisa o front. Colunas do contrato (robo_id, slug, dia, em,
--     min/max/ultimo_brl_por_contrato) e, no FIM, n_magics e atualizado_em
--     (o evento "saldo" filtra por ele; o front pode usar para refetch).
--   - Evento realtime "saldo" no topic robo:<slug> (privado, como os demais),
--     emitido por trigger em saldo_intradiario POR COMANDO (transition table)
--     AFTER INSERT e AFTER UPDATE (balde que vira público pelo ON CONFLICT
--     também avisa): o heartbeat insere N baldes num INSERT só e um trigger
--     por linha chamaria pode_transmitir N vezes (até 720 numa reconexão).
--     Payload {slug, dia, baldes: [{em, min, max, ultimo}]} com os baldes
--     públicos de HOJE gravados nos últimos 30 s E com início nos últimos 2 min
--     (consulta à view: `em` é coluna de agrupamento e desce até o índice; sem
--     esse corte o banco agregaria o dia inteiro a cada evento, e o payload de
--     uma reconexão levaria a fila inteira). Só quando algum balde novo de hoje
--     tem regras_aplicadas = true e a view devolve algo; o throttle de 5 s por
--     slug (pode_transmitir('saldo:'||slug)) é consumido só então. Reconexão
--     longa (buraco maior que 2 min) é caso do front: refaz a leitura da view.
--   - Nunca conta, magic ou volume no público. Nada hardcoded por robô.
--   - Compatibilidade: EA <= 1.1.1 (sem saldo_dia) continua aceito e nada muda.
--   - Regra pública alterada no admin com o dia em andamento: o balde é medição
--     pontual do flutuante daquele instante e não pode ser refeito (não há
--     regras_versao aqui). Quando o item de exposicao_dia COM regras chega com
--     regras_versao diferente da gravada COM regras (o mesmo sinal que faz o
--     passo 0 substituir o MEP/MEN), o passo 0a apaga os baldes do (conta,
--     magic, dia): buraco honesto no lugar de curva mista. O EA 1.1.2 descarta
--     a fila no mesmo instante em que aplica a regra nova, então o que chega
--     depois foi medido com ela.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. saldo_intradiario: um balde por (conta, magic, início do balde)
-- -----------------------------------------------------------------------------
create table public.saldo_intradiario (
  conta_id                 uuid not null references public.contas_matriz (id) on delete cascade,
  magic                    bigint not null,
  dia                      date not null,
  em                       timestamptz not null,
  min_brl_por_contrato     numeric(14, 4) not null,
  max_brl_por_contrato     numeric(14, 4) not null,
  ultimo_brl_por_contrato  numeric(14, 4) not null,
  regras_aplicadas         boolean not null default false,
  atualizado_em            timestamptz not null default now(),
  primary key (conta_id, magic, em),
  constraint saldo_intradiario_min_ultimo_max_check
    check (min_brl_por_contrato <= ultimo_brl_por_contrato and ultimo_brl_por_contrato <= max_brl_por_contrato)
);
create index saldo_intradiario_conta_magic_dia_idx on public.saldo_intradiario (conta_id, magic, dia);
-- a limpeza por idade (gravar_saldo_intradiario) filtra só por dia: sem este índice era seq scan
create index saldo_intradiario_dia_idx on public.saldo_intradiario (dia);

comment on table public.saldo_intradiario is
  'Série do saldo do dia por (conta, magic): um balde de InpSaldoBucketSeg (padrão 5 s) com mínimo, máximo e último do saldo do dia do magic (realizado + flutuante), em R$ BRUTOS por contrato, medido pelo EA 1.1.2. Privada; o público vem de saldo_dia_publico.';
comment on column public.saldo_intradiario.em is 'Início do balde (UTC), alinhado ao múltiplo de InpSaldoBucketSeg no relógio do servidor do MT5.';
comment on column public.saldo_intradiario.dia is 'Dia de pregão do balde, o do servidor do MT5 (Brasília).';
comment on column public.saldo_intradiario.min_brl_por_contrato is 'Menor valor do saldo do dia dentro do balde (R$ brutos por contrato).';
comment on column public.saldo_intradiario.max_brl_por_contrato is 'Maior valor do saldo do dia dentro do balde (R$ brutos por contrato).';
comment on column public.saldo_intradiario.ultimo_brl_por_contrato is 'Último valor do saldo do dia dentro do balde (R$ brutos por contrato).';
comment on column public.saldo_intradiario.regras_aplicadas is
  'true = o EA mediu o balde já aplicando a regra pública do magic recebida do servidor (hora mínima, duração mínima): o saldo é o público. false = saldo real do magic (EA sem as regras no momento). Grudenta: um balde sem regras não a apaga. Só true é publicado.';
comment on column public.saldo_intradiario.atualizado_em is 'Última escrita real (balde novo, extremo ampliado, último diferente ou regras marcadas). Reenvio igual não escreve.';

-- -----------------------------------------------------------------------------
-- 2. gravar_saldo_intradiario(conta, saldo_dia): upsert idempotente dos baldes
--    p = [{magic, dia, regras_aplicadas, baldes: [[t, min, max, ultimo], ...]}]
--    (t = epoch UTC em segundos; valores em R$ brutos por contrato).
--    Devolve {ok, recebidos, aceitos, gravados, por_magic: [{magic, dia,
--    aceitos, gravados}]}: "aceitos" passaram na validação e no teto;
--    "gravados" escreveram de verdade (reenvio igual não conta). Só service_role.
-- -----------------------------------------------------------------------------
create or replace function public.gravar_saldo_intradiario(p_conta_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje      date := public.dia_pregao_de(now());
  v_vazio     jsonb := jsonb_build_object('ok', true, 'recebidos', 0, 'aceitos', 0, 'gravados', 0, 'por_magic', '[]'::jsonb);
  v_resultado jsonb;
begin
  -- EA <= 1.1.1 (sem o campo), lista que não é lista ou conta ausente: nada a fazer
  if p_conta_id is null or coalesce(jsonb_typeof(p), '') <> 'array' then
    return v_vazio;
  end if;
  if jsonb_array_length(p) = 0 then
    return v_vazio;
  end if;

  with brutos as (
    -- um balde por linha; só o que tem a forma [n, n, n, n] dentro de um item objeto
    -- (b -> 3 é nulo, e jsonb_typeof(nulo) é nulo, quando o balde tem menos de 4 posições).
    -- ordem = posição no lote (item, balde), pelo WITH ORDINALITY: decide "o último do
    -- lote" quando o mesmo (magic, em) vem duas vezes
    select it.i, bd.b, it.oi, bd.ob
      from jsonb_array_elements(p) with ordinality as it(i, oi)
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(it.i -> 'baldes') = 'array' then it.i -> 'baldes' else '[]'::jsonb end)
        with ordinality as bd(b, ob)
     where jsonb_typeof(it.i) = 'object'
       and jsonb_typeof(bd.b) = 'array'
       and jsonb_typeof(bd.b -> 0) = 'number'
       and jsonb_typeof(bd.b -> 1) = 'number'
       and jsonb_typeof(bd.b -> 2) = 'number'
       and jsonb_typeof(bd.b -> 3) = 'number'
  ),
  itens as (
    select
      case when (i ->> 'magic') ~ '^[0-9]{1,18}$' then (i ->> 'magic')::bigint end          as magic,
      case when (i ->> 'dia') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (i ->> 'dia')::date end as dia,
      case when jsonb_typeof(i -> 'regras_aplicadas') = 'boolean'
           then (i ->> 'regras_aplicadas')::boolean else false end                          as regras_aplicadas,
      (b ->> 0)::numeric                                                                    as t,
      -- arredondado a 4 casas AQUI, como a coluna numeric(14,4) faria: o teste de
      -- "cabe" abaixo vale para o valor que seria gravado (9999999999.99995 passa
      -- em abs(x) < 1e10 mas estoura ao arredondar)
      round((b ->> 1)::numeric, 4)                                                          as minimo,
      round((b ->> 2)::numeric, 4)                                                          as maximo,
      round((b ->> 3)::numeric, 4)                                                          as ultimo,
      oi, ob
    from brutos
  ),
  validos as (
    -- t plausível (epoch em segundos, não em ms nem lixo) e valores que cabem em
    -- numeric(14,4); min/max normalizados para conter o último (o check da tabela)
    select magic, dia, regras_aplicadas,
           to_timestamp(trunc(t))   as em,
           least(minimo, ultimo)    as minimo,
           greatest(maximo, ultimo) as maximo,
           ultimo,
           oi, ob
      from itens
     where magic is not null
       and dia is not null
       and dia between v_hoje - 1 and v_hoje + 1
       and t > 0 and t < 100000000000
       and abs(minimo) < 10000000000 and abs(maximo) < 10000000000 and abs(ultimo) < 10000000000
  ),
  lote as (
    -- o mesmo (magic, em) duas vezes no lote derrubaria o ON CONFLICT DO UPDATE
    -- ("cannot affect row a second time"): fica o balde com regras e, entre
    -- iguais, o último do lote (o EA nunca repete t0 dentro de um magic; é só
    -- rede de segurança). O balde tem de cair no dia declarado (±1 na virada).
    select distinct on (magic, em) *
      from validos
     where public.dia_pregao_de(em) between dia - 1 and dia + 1
     order by magic, em, regras_aplicadas desc, oi desc, ob desc
  ),
  limitado as (
    -- teto por chamada: 2000 baldes (o EA manda no máximo 720 por magic); ficam os mais antigos
    select * from lote order by em, magic limit 2000
  ),
  gravados as (
    insert into public.saldo_intradiario as s
      (conta_id, magic, dia, em, min_brl_por_contrato, max_brl_por_contrato,
       ultimo_brl_por_contrato, regras_aplicadas, atualizado_em)
    select p_conta_id, magic, dia, em, minimo, maximo, ultimo, regras_aplicadas, now()
      from limitado
    on conflict (conta_id, magic, em) do update set
      -- balde COM regras numa linha SEM regras substitui; mesma marca: mínimo só
      -- desce, máximo só sobe, último é o que chegou
      min_brl_por_contrato    = case when excluded.regras_aplicadas and not s.regras_aplicadas
                                     then excluded.min_brl_por_contrato
                                     else least(s.min_brl_por_contrato, excluded.min_brl_por_contrato) end,
      max_brl_por_contrato    = case when excluded.regras_aplicadas and not s.regras_aplicadas
                                     then excluded.max_brl_por_contrato
                                     else greatest(s.max_brl_por_contrato, excluded.max_brl_por_contrato) end,
      ultimo_brl_por_contrato = excluded.ultimo_brl_por_contrato,
      regras_aplicadas        = s.regras_aplicadas or excluded.regras_aplicadas,
      atualizado_em           = now()
    where (excluded.regras_aplicadas and not s.regras_aplicadas)
       or (excluded.regras_aplicadas = s.regras_aplicadas
           and (excluded.min_brl_por_contrato < s.min_brl_por_contrato
             or excluded.max_brl_por_contrato > s.max_brl_por_contrato
             or excluded.ultimo_brl_por_contrato is distinct from s.ultimo_brl_por_contrato))
    -- balde SEM regras sobre linha COM regras não casa com nenhum ramo: ignorado
    returning magic, dia
  )
  select jsonb_build_object(
           'ok', true,
           'recebidos', (select count(*) from brutos),
           'aceitos',   (select count(*) from limitado),
           'gravados',  (select count(*) from gravados),
           'por_magic', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'magic', l.magic, 'dia', l.dia, 'aceitos', l.n, 'gravados', coalesce(g.n, 0))
                      order by l.magic, l.dia), '[]'::jsonb)
               from (select magic, dia, count(*) as n from limitado group by magic, dia) l
               left join (select magic, dia, count(*) as n from gravados group by magic, dia) g
                 on g.magic = l.magic and g.dia = l.dia))
    into v_resultado;

  -- retenção: ~400 dias, sem cron (1% das chamadas limpa)
  if random() < 0.01 then
    delete from public.saldo_intradiario where dia < v_hoje - 400;
  end if;

  return v_resultado;
end;
$$;

revoke all on function public.gravar_saldo_intradiario(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.gravar_saldo_intradiario(uuid, jsonb) to service_role;

comment on function public.gravar_saldo_intradiario(uuid, jsonb) is
  'Upsert idempotente dos baldes do saldo do dia enviados pelo EA 1.1.2 em saldo_dia do heartbeat (least/greatest/último; regras_aplicadas grudenta; balde com regras substitui linha sem regras; sem regras sobre com regras é ignorado). Só dias entre ontem e amanhã, teto de 2000 baldes por chamada, lixo descartado sem erro. Limpa baldes com mais de 400 dias em 1% das chamadas. Só service_role.';

-- -----------------------------------------------------------------------------
-- 3. atualizar_heartbeat: definição da 0023 INTEIRA + passo 0a (regra pública
--    trocada apaga os baldes do dia) + passo 0c (série do saldo do dia, em
--    subtransação própria). Passos 0, 1 a 5 iguais.
--    p = { ea_versao, em, balance, equity, posicoes: [...], cotacoes: [...],
--          exposicao_dia: [{magic, dia, realizado, flutuante, n_saidas, mep,
--          mep_em, mep_n_saidas, men, men_em, men_n_saidas, parcial,
--          regras_aplicadas, regras_versao}],
--          saldo_dia: [{magic, dia, regras_aplicadas, baldes: [[t, min, max, ultimo], ...]}] }
-- -----------------------------------------------------------------------------
create or replace function public.atualizar_heartbeat(p_conta_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_em         timestamptz := coalesce(nullif(p ->> 'em', '')::timestamptz, now());
  v_posicoes   jsonb := coalesce(p -> 'posicoes', '[]'::jsonb);
  v_cotacoes   jsonb := coalesce(p -> 'cotacoes', '[]'::jsonb);
  v_exposicao  jsonb := case when jsonb_typeof(p -> 'exposicao_dia') = 'array'
                             then p -> 'exposicao_dia' else '[]'::jsonb end;
  v_hoje       date := public.dia_pregao_de(now());
begin
  -- 0a. Regra pública trocada com o dia em andamento: item de exposicao_dia COM
  --     regras chegando com regras_versao diferente da linha gravada COM regras
  --     (o mesmo sinal que faz o passo 0 substituir o MEP/MEN). Os baldes de
  --     saldo_intradiario do (magic, dia) foram medidos com a regra anterior e
  --     não podem ser refeitos: apaga (buraco honesto em vez de curva mista com
  --     o MEP/MEN novo). O EA 1.1.2 descarta a fila ao aplicar a regra nova,
  --     então o saldo_dia deste heartbeat em diante já é da regra nova. Sem
  --     regras (EA 1.1.0) ou linha sem regras nada é apagado (não publicado).
  --     Em subtransação própria: a série nunca derruba o heartbeat.
  begin
    delete from public.saldo_intradiario s
     using public.exposicao_dia e,
           (select distinct
                   case when (x ->> 'magic') ~ '^[0-9]{1,18}$' then (x ->> 'magic')::bigint end         as magic,
                   case when (x ->> 'dia') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (x ->> 'dia')::date end as dia,
                   nullif(x ->> 'regras_versao', '')                                                       as regras_versao
              from jsonb_array_elements(v_exposicao) x
             where jsonb_typeof(x) = 'object'
               and coalesce((x ->> 'regras_aplicadas')::boolean, false)) i
     where e.conta_id = p_conta_id
       and e.magic = i.magic
       and e.dia = i.dia
       and e.regras_aplicadas
       and e.regras_versao is distinct from i.regras_versao
       and s.conta_id = e.conta_id
       and s.magic = e.magic
       and s.dia = e.dia;
  exception when others then
    raise warning '[atualizar_heartbeat] passo 0a (baldes da regra anterior) ignorado: %', sqlerrm;
  end;

  -- 0. MEP/MEN do dia por magic (EA 1.1.0+). Só dias em volta de hoje: o dia é
  --    o do servidor do MT5 e pode diferir de Brasília na virada.
  insert into public.exposicao_dia as e
    (conta_id, magic, dia, mep_brl_por_contrato, men_brl_por_contrato,
     mep_em, men_em, mep_n_saidas, men_n_saidas, n_saidas,
     realizado_brl_por_contrato, parcial, regras_aplicadas, regras_versao, atualizado_em)
  select
    p_conta_id,
    i.magic,
    i.dia,
    i.mep,
    i.men,
    case when i.mep > 0 then i.mep_em end,
    case when i.men < 0 then i.men_em end,
    case when i.mep > 0 then i.mep_n_saidas end,
    case when i.men < 0 then i.men_n_saidas end,
    i.n_saidas,
    i.realizado,
    i.parcial,
    i.regras_aplicadas,
    case when i.regras_aplicadas then i.regras_versao end,
    now()
  from (
    -- distinct on: o mesmo (magic, dia) duas vezes no lote derrubaria o
    -- ON CONFLICT DO UPDATE; fica o item com regras e, entre iguais, o de
    -- maior MEP (empate: menor MEN).
    select distinct on (magic, dia)
      case when (x ->> 'magic') ~ '^[0-9]{1,18}$' then (x ->> 'magic')::bigint end          as magic,
      case when (x ->> 'dia') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (x ->> 'dia')::date end  as dia,
      greatest(0, coalesce((x ->> 'mep')::numeric, 0))                                        as mep,
      least(0, coalesce((x ->> 'men')::numeric, 0))                                           as men,
      nullif(x ->> 'mep_em', '')::timestamptz                                                 as mep_em,
      nullif(x ->> 'men_em', '')::timestamptz                                                 as men_em,
      (x ->> 'mep_n_saidas')::integer                                                          as mep_n_saidas,
      (x ->> 'men_n_saidas')::integer                                                          as men_n_saidas,
      coalesce((x ->> 'n_saidas')::integer, 0)                                                 as n_saidas,
      coalesce((x ->> 'realizado')::numeric, 0)                                                as realizado,
      coalesce((x ->> 'parcial')::boolean, false)                                              as parcial,
      coalesce((x ->> 'regras_aplicadas')::boolean, false)                                     as regras_aplicadas,
      nullif(x ->> 'regras_versao', '')                                                        as regras_versao
    from jsonb_array_elements(v_exposicao) x
    where jsonb_typeof(x) = 'object'
    order by magic, dia, regras_aplicadas desc, mep desc, men asc
  ) i
  where i.magic is not null
    and i.dia is not null
    and i.dia between v_hoje - 1 and v_hoje + 1
  on conflict (conta_id, magic, dia) do update set
    -- substitui tudo quando o item COM regras chega numa linha SEM regras ou
    -- medida com outra versão da regra; senão, monotônico como na 0021
    mep_em                     = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.mep_em
                                   when excluded.mep_brl_por_contrato > e.mep_brl_por_contrato then excluded.mep_em
                                   when excluded.mep_brl_por_contrato = e.mep_brl_por_contrato then coalesce(e.mep_em, excluded.mep_em)
                                   else e.mep_em
                                 end,
    mep_n_saidas               = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.mep_n_saidas
                                   when excluded.mep_brl_por_contrato > e.mep_brl_por_contrato then excluded.mep_n_saidas
                                   when excluded.mep_brl_por_contrato = e.mep_brl_por_contrato then coalesce(e.mep_n_saidas, excluded.mep_n_saidas)
                                   else e.mep_n_saidas
                                 end,
    men_em                     = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.men_em
                                   when excluded.men_brl_por_contrato < e.men_brl_por_contrato then excluded.men_em
                                   when excluded.men_brl_por_contrato = e.men_brl_por_contrato then coalesce(e.men_em, excluded.men_em)
                                   else e.men_em
                                 end,
    men_n_saidas               = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.men_n_saidas
                                   when excluded.men_brl_por_contrato < e.men_brl_por_contrato then excluded.men_n_saidas
                                   when excluded.men_brl_por_contrato = e.men_brl_por_contrato then coalesce(e.men_n_saidas, excluded.men_n_saidas)
                                   else e.men_n_saidas
                                 end,
    mep_brl_por_contrato       = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.mep_brl_por_contrato
                                   else greatest(e.mep_brl_por_contrato, excluded.mep_brl_por_contrato)
                                 end,
    men_brl_por_contrato       = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.men_brl_por_contrato
                                   else least(e.men_brl_por_contrato, excluded.men_brl_por_contrato)
                                 end,
    n_saidas                   = excluded.n_saidas,
    realizado_brl_por_contrato = excluded.realizado_brl_por_contrato,
    parcial                    = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.parcial
                                   else e.parcial or excluded.parcial
                                 end,
    regras_aplicadas           = e.regras_aplicadas or excluded.regras_aplicadas,
    regras_versao              = case
                                   when excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao) then excluded.regras_versao
                                   else e.regras_versao
                                 end,
    atualizado_em              = now()
  where (excluded.regras_aplicadas and (not e.regras_aplicadas or excluded.regras_versao is distinct from e.regras_versao))
     or (excluded.regras_aplicadas = e.regras_aplicadas
         and excluded.regras_versao is not distinct from e.regras_versao
         and (
            excluded.mep_brl_por_contrato > e.mep_brl_por_contrato
         or excluded.men_brl_por_contrato < e.men_brl_por_contrato
         or excluded.n_saidas is distinct from e.n_saidas
         or excluded.realizado_brl_por_contrato is distinct from e.realizado_brl_por_contrato
         or (not e.parcial and excluded.parcial)
         or (e.mep_em is null and excluded.mep_em is not null and excluded.mep_brl_por_contrato = e.mep_brl_por_contrato)
         or (e.men_em is null and excluded.men_em is not null and excluded.men_brl_por_contrato = e.men_brl_por_contrato)
         or (e.mep_n_saidas is null and excluded.mep_n_saidas is not null and excluded.mep_brl_por_contrato = e.mep_brl_por_contrato)
         or (e.men_n_saidas is null and excluded.men_n_saidas is not null and excluded.men_brl_por_contrato = e.men_brl_por_contrato)));
     -- item SEM regras sobre linha COM regras não casa com nenhum ramo: ignorado

  -- 0c. Série do saldo do dia por magic (EA 1.1.2): baldes de InpSaldoBucketSeg
  --     fechados e ainda não confirmados, upsert idempotente em
  --     saldo_intradiario; o trigger da tabela emite o evento "saldo". Campo
  --     ausente (EA <= 1.1.1) ou malformado: nada acontece. Em subtransação
  --     própria: erro inesperado (trigger, lock em broadcast_controle, estouro
  --     que escapou da validação) vira WARNING e o resto do heartbeat (status,
  --     posições, cotações) é gravado; o EA marca o lote como enviado no 2xx,
  --     então os baldes desse lote ficam de fora (o aviso no log do banco diz
  --     qual foi o erro).
  begin
    perform public.gravar_saldo_intradiario(p_conta_id, p -> 'saldo_dia');
  exception when others then
    raise warning '[atualizar_heartbeat] saldo_dia ignorado: %', sqlerrm;
  end;

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

  -- 3b. excursões das posições abertas (EA 1.1.0: itens com mfe_pontos ou
  --     mae_pontos; um malformado não perde o outro). O item traz ticket e,
  --     quando o EA sabe, posicao_id e ciclo; o registrar_excursoes usa
  --     posicao_id e cai no ticket se faltar.
  perform public.registrar_excursoes(
    p_conta_id,
    (select coalesce(jsonb_agg(x), '[]'::jsonb)
       from jsonb_array_elements(v_posicoes) x
      where jsonb_typeof(x) = 'object' and ((x ? 'mfe_pontos') or (x ? 'mae_pontos')))
  );

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

revoke all on function public.atualizar_heartbeat(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.atualizar_heartbeat(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 4. saldo_dia_publico: a série do dia por robô. Só conta principal, só balde
--    medido com as regras públicas (regras_aplicadas) e só dia sem importação
--    manual (mesmo predicado da exposicao_dia_publico: a curva pública do dia
--    é a importada). Um magic (o caso hoje): min/max/último do balde. Mais de
--    um magic: soma dos "último" no mesmo balde e min = max = essa soma
--    (aproximação: a soma dos mínimos não é o mínimo da soma); n_magics avisa
--    o front. Sem conta, sem magic, sem volume.
-- -----------------------------------------------------------------------------
create view public.saldo_dia_publico
with (security_invoker = false)
as
with por_magic as (
  select
    r.id as robo_id,
    r.slug,
    s.dia,
    s.em,
    s.magic,
    s.min_brl_por_contrato,
    s.max_brl_por_contrato,
    s.ultimo_brl_por_contrato,
    s.atualizado_em
  from public.saldo_intradiario s
  join public.robo_conta_magic m on m.conta_id = s.conta_id and m.magic = s.magic
  join public.robos r on r.id = m.robo_id and r.conta_principal_id = s.conta_id
  where s.regras_aplicadas
    and not exists (
      -- importação manual no dia: a curva pública é a importada, para todos
      select 1 from public.operacoes o
       where o.robo_id = r.id
         and o.dia_pregao = s.dia
         and o.origem = 'manual'
    )
)
select
  robo_id,
  slug,
  dia,
  em,
  case when count(*) = 1 then min(min_brl_por_contrato) else sum(ultimo_brl_por_contrato) end as min_brl_por_contrato,
  case when count(*) = 1 then max(max_brl_por_contrato) else sum(ultimo_brl_por_contrato) end as max_brl_por_contrato,
  sum(ultimo_brl_por_contrato)                                                                as ultimo_brl_por_contrato,
  count(*)::integer                                                                           as n_magics,
  max(atualizado_em)                                                                          as atualizado_em
from por_magic
group by robo_id, slug, dia, em;

grant select on public.saldo_dia_publico to anon, authenticated;

comment on view public.saldo_dia_publico is
  'Série do saldo do dia por robô, um ponto por balde de InpSaldoBucketSeg (padrão 5 s): mínimo, máximo e último do saldo do dia (realizado + flutuante) em R$ BRUTOS por contrato, medidos pelo EA 1.1.2 já com as regras públicas aplicadas. Só conta principal e só dia sem importação manual. Com n_magics > 1 os três valores são a soma dos "último" dos magics (aproximação: o extremo dentro do balde não é publicado). Sem conta, magic ou volume.';
comment on column public.saldo_dia_publico.em is 'Início do balde (UTC).';
comment on column public.saldo_dia_publico.min_brl_por_contrato is 'Menor saldo do dia dentro do balde (R$ brutos por contrato). Com n_magics > 1, igual a ultimo_brl_por_contrato.';
comment on column public.saldo_dia_publico.max_brl_por_contrato is 'Maior saldo do dia dentro do balde (R$ brutos por contrato). Com n_magics > 1, igual a ultimo_brl_por_contrato.';
comment on column public.saldo_dia_publico.ultimo_brl_por_contrato is 'Último saldo do dia dentro do balde (R$ brutos por contrato); soma dos magics quando n_magics > 1.';
comment on column public.saldo_dia_publico.n_magics is 'Quantos magics do robô mediram o balde. Com mais de um, min = max = soma dos últimos (aproximação).';
comment on column public.saldo_dia_publico.atualizado_em is 'Última escrita real do balde (a mais recente entre os magics). O evento "saldo" traz os baldes com atualizado_em nos últimos 30 s.';

-- -----------------------------------------------------------------------------
-- 5. Evento "saldo" no topic robo:<slug>: trigger POR COMANDO em
--    saldo_intradiario, AFTER INSERT (transition table "novos" = as linhas
--    inseridas) e AFTER UPDATE ("novos" = as linhas que o ON CONFLICT mudou:
--    balde sem regras que virou público, extremo ampliado). Um heartbeat
--    insere N baldes num comando só, então há uma verificação de throttle por
--    robô e não N. Payload {slug, dia, baldes: [{em, min, max, ultimo}]} com
--    os baldes públicos de hoje gravados nos últimos 30 s e com início nos
--    últimos 2 min (`em` é coluna de agrupamento da view e desce até o índice;
--    `atualizado_em` é max() e não desce: sem o corte em `em` cada evento
--    agregaria o dia inteiro do robô). Só quando algum balde novo é de hoje,
--    tem regras_aplicadas = true e a view devolve algo; o throttle de 5 s por
--    slug é consumido só então (dia com importação manual, conta secundária ou
--    magic não atribuído não gasta broadcast_controle). Reconexão com buraco
--    maior que 2 min é caso do front: refaz a leitura da view.
-- -----------------------------------------------------------------------------
create or replace function public.broadcast_saldo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_hoje   date := public.dia_pregao_de(now());
  v_baldes jsonb;
begin
  for r in
    select distinct rb.id, rb.slug
      from novos n
      join public.robo_conta_magic m on m.conta_id = n.conta_id and m.magic = n.magic
      join public.robos rb on rb.id = m.robo_id and rb.conta_principal_id = n.conta_id
     where n.regras_aplicadas
       and n.dia = v_hoje
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'em',     v.em,
             'min',    v.min_brl_por_contrato,
             'max',    v.max_brl_por_contrato,
             'ultimo', v.ultimo_brl_por_contrato) order by v.em), '[]'::jsonb)
      into v_baldes
      from public.saldo_dia_publico v
     where v.robo_id = r.id
       and v.dia = v_hoje
       and v.em >= now() - interval '2 minutes'
       and v.atualizado_em >= now() - interval '30 seconds';

    if jsonb_array_length(v_baldes) = 0 then
      continue;
    end if;
    if not public.pode_transmitir('saldo:' || r.slug, interval '5 seconds') then
      continue;
    end if;

    perform realtime.send(
      jsonb_build_object('slug', r.slug, 'dia', v_hoje, 'baldes', v_baldes),
      'saldo', 'robo:' || r.slug, true);
  end loop;
  return null;
end;
$$;

create trigger saldo_intradiario_broadcast
  after insert on public.saldo_intradiario
  referencing new table as novos
  for each statement
  execute function public.broadcast_saldo();

create trigger saldo_intradiario_broadcast_update
  after update on public.saldo_intradiario
  referencing new table as novos
  for each statement
  execute function public.broadcast_saldo();

-- -----------------------------------------------------------------------------
-- 6. RLS e grants (padrão da 0009): anon nada na tabela; admin tudo;
--    service_role (ingest) ignora RLS.
-- -----------------------------------------------------------------------------
alter table public.saldo_intradiario enable row level security;
create policy "admin tudo" on public.saldo_intradiario for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.saldo_intradiario to authenticated;
grant all on public.saldo_intradiario to service_role;
