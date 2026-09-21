-- =============================================================================
-- 0019 · A duração mínima (0018) só vale para operação coletada do MT5.
--   O histórico importado do projeto antigo (origem manual, fev–jun/2026) não
--   tem horário de fechamento: abertura_em = fechamento_em e duracao_seg = 0 em
--   todas as linhas. Com a regra valendo para o histórico inteiro, esse período
--   sumia por completo. Importação manual passa a ignorar a duração mínima;
--   a hora mínima continua igual para todas as origens.
-- =============================================================================

comment on column public.robos.duracao_minima_seg is
  'Operações do MT5 com duracao_seg menor que isto ficam fora do site e das estatísticas. Importação manual não tem duração e ignora a regra. Nulo = sem corte.';

create or replace function public.operacao_e_publica(
  p_origem public.origem_operacao,
  p_dia date,
  p_conta_id uuid,
  p_conta_principal_id uuid,
  p_robo_id uuid,
  p_abertura_em timestamptz,
  p_duracao_seg integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (case
       when p_origem = 'manual' then true
       else (p_conta_id is not null
             and p_conta_id = p_conta_principal_id
             and not public.dia_tem_importacao(p_robo_id, p_dia))
     end)
    and not exists (
      select 1 from public.robos r
       where r.id = p_robo_id
         and (
           (r.hora_minima_operacao is not null
            and p_abertura_em is not null
            and (p_abertura_em at time zone 'America/Sao_Paulo')::time < r.hora_minima_operacao)
           or
           (p_origem <> 'manual'
            and r.duracao_minima_seg is not null
            and coalesce(p_duracao_seg, 0) < r.duracao_minima_seg
            and (r.duracao_minima_desde is null or p_dia >= r.duracao_minima_desde))
         )
    );
$$;

create or replace view public.operacoes_publico
with (security_invoker = false)
as
select
  o.id, o.robo_id, r.slug, o.simbolo, o.prefixo_simbolo, o.lado,
  o.abertura_em, o.fechamento_em, o.duracao_seg, o.preco_entrada, o.preco_saida,
  o.pontos_por_contrato, o.resultado_brl_por_contrato, o.custos_brl_por_contrato,
  o.versao_robo, o.dia_pregao,
  (o.resultado_brl_por_contrato - o.custos_brl_por_contrato) as resultado_liquido_por_contrato,
  o.origem
from public.operacoes o
join public.robos r on r.id = o.robo_id
where (
        o.origem = 'manual'
        or (o.conta_id is not null
            and o.conta_id = r.conta_principal_id
            and not exists (
              select 1 from public.operacoes m
               where m.robo_id = o.robo_id and m.dia_pregao = o.dia_pregao and m.origem = 'manual'))
      )
  and (r.hora_minima_operacao is null
       or (o.abertura_em at time zone 'America/Sao_Paulo')::time >= r.hora_minima_operacao)
  and (o.origem = 'manual'
       or r.duracao_minima_seg is null
       or o.duracao_seg >= r.duracao_minima_seg
       or (r.duracao_minima_desde is not null and o.dia_pregao < r.duracao_minima_desde));

grant select on public.operacoes_publico to anon, authenticated;
