-- =============================================================================
-- 0009 · RLS, grants e políticas
--
-- Regras (spec §10):
--   - RLS em toda tabela.
--   - anon: nada nas tabelas; só SELECT nas views *_publico e execute em
--     resumo_casa_hoje().
--   - authenticated: acesso às tabelas só pelo que as políticas liberam
--     (cliente vê o que é dele; admin vê tudo).
--   - service_role (ingest): bypass de RLS, como sempre no Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Zera os grants padrão em tabelas, sequências e funções
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- service_role continua podendo tudo (perdeu o execute implícito de PUBLIC)
grant execute on all functions in schema public to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- -----------------------------------------------------------------------------
-- 2. RLS ligado em tudo
-- -----------------------------------------------------------------------------
alter table public.multiplicadores      enable row level security;
alter table public.contas_matriz        enable row level security;
alter table public.robos                enable row level security;
alter table public.robo_conta_magic     enable row level security;
alter table public.feriados_b3          enable row level security;
alter table public.parametros           enable row level security;
alter table public.deals                enable row level security;
alter table public.posicoes_abertas     enable row level security;
alter table public.snapshots_conta      enable row level security;
alter table public.coleta_status        enable row level security;
alter table public.coleta_rejeicoes     enable row level security;
alter table public.cotacoes             enable row level security;
alter table public.broadcast_controle   enable row level security;
alter table public.operacoes            enable row level security;
alter table public.estatisticas_diarias enable row level security;
alter table public.estatisticas_cache   enable row level security;
alter table public.perfis               enable row level security;
alter table public.contas_cliente       enable row level security;
alter table public.licencas             enable row level security;
alter table public.comunicados          enable row level security;
alter table public.alertas_inscricoes   enable row level security;

-- -----------------------------------------------------------------------------
-- 3. Grants pra authenticated (as políticas filtram as linhas)
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.is_admin()   to authenticated;
grant execute on function public.role_atual() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Views e RPC públicas
-- -----------------------------------------------------------------------------
grant select on public.robos_publico            to anon, authenticated;
grant select on public.operacoes_publico        to anon, authenticated;
grant select on public.posicoes_abertas_publico to anon, authenticated;
grant select on public.estatisticas_publico     to anon, authenticated;
grant select on public.comunicados_publico      to anon, authenticated;
grant select on public.mercado_publico          to anon, authenticated;
grant select on public.feriados_publico         to anon, authenticated;
grant select on public.parametros_publico       to anon, authenticated;
grant execute on function public.resumo_casa_hoje()           to anon, authenticated;
grant execute on function public.dia_pregao_de(timestamptz)   to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Políticas: admin faz tudo nas tabelas operacionais
-- -----------------------------------------------------------------------------
create policy "admin tudo" on public.multiplicadores      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.contas_matriz        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.robos                for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.robo_conta_magic     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.feriados_b3          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.parametros           for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.deals                for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.posicoes_abertas     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.snapshots_conta      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.coleta_status        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.coleta_rejeicoes     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.cotacoes             for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.broadcast_controle   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.operacoes            for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.estatisticas_diarias for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.estatisticas_cache   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.comunicados          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin tudo" on public.alertas_inscricoes   for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 6. Políticas: cliente vê e edita só o que é dele
-- -----------------------------------------------------------------------------
create policy "perfil: ler o proprio ou admin" on public.perfis
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "perfil: editar o proprio sem mudar role" on public.perfis
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and role = public.role_atual());

create policy "perfil: admin edita tudo" on public.perfis
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "contas cliente: proprias" on public.contas_cliente
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "licencas: ler as proprias" on public.licencas
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "licencas: admin gerencia" on public.licencas
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
