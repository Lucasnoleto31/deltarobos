# Delta Robôs

Site público de performance ao vivo dos robôs da Delta Robôs (hoje Apollo e Orion, mas o sistema suporta quantos forem), com dados vindos do MT5, mais área do cliente e admin.

**Leia `docs/SPEC.md` antes de qualquer tarefa.** A spec manda. Se algo não estiver lá, pergunte antes de decidir.

## Stack
Next.js (App Router, TypeScript strict), Tailwind, shadcn/ui, Supabase (Postgres, Auth, Realtime), Recharts, lightweight-charts. Deploy na Vercel.

## Convenções
- UI em pt-BR, timezone America/Sao_Paulo, moeda BRL.
- Tabelas e colunas do banco em português, snake_case (ver spec, seção 6).
- Toda mudança de schema via migration em `supabase/migrations`. Nunca alterar o banco na mão.
- RLS em toda tabela. O anon só lê as views `*_publico`.
- Número de conta da matriz nunca aparece em view pública, API pública ou frontend.
- Todo valor de performance é normalizado por 1 contrato.
- Nunca hardcodar nome, slug ou quantidade de robôs. Tudo vem da tabela `robos`. Cadastrar um robô novo não pode exigir deploy.
- Nunca commitar `.env.local` nem chaves. Nunca pedir chaves no chat.
- Componentes em `src/components`, lógica de cálculo em `src/lib/stats` com testes.
- O EA do MT5 fica em `mt5/DeltaReporter.mq5`.

## Fluxo de trabalho
- Uma fase da spec por vez (seção 11). Apresentar plano antes de implementar.
- Rodar `npm run build` e os testes antes de considerar uma tarefa concluída.
- Commits pequenos, mensagem em português.
