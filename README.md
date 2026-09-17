# Delta Robôs

Site público de performance ao vivo dos robôs de day trade da Delta Robôs, com dados vindos do
MetaTrader 5 das contas da matriz. Spec completa em [docs/SPEC.md](docs/SPEC.md); plano da Fase 1
em [docs/PLANO-FASE-1.md](docs/PLANO-FASE-1.md).

Stack: Next.js 16 (App Router, TypeScript strict), Tailwind 4, shadcn/ui, Supabase (Postgres,
Realtime), Recharts, lightweight-charts. Deploy na Vercel.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha as chaves do Supabase
npm run dev
```

Scripts:

| comando             | o que faz                                        |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | servidor de desenvolvimento                      |
| `npm run build`     | build de produção                                |
| `npm run test`      | testes unitários (vitest) de `src/lib`           |
| `npm run lint`      | eslint                                           |
| `npm run typecheck` | `tsc --noEmit`                                   |
| `npm run db:types`  | gera `src/lib/supabase/database.types.ts` do banco linkado |

## Banco (Supabase)

Toda mudança de schema é migration em `supabase/migrations`. Nunca alterar o banco na mão.

```bash
npx supabase login                         # uma vez, abre o navegador
npx supabase link --project-ref <ref>      # ref = subdomínio do projeto
npx supabase db push                       # aplica as migrations pendentes
npx supabase db push --include-seed        # primeira vez: também roda supabase/seed.sql
```

O seed cria os multiplicadores (WIN R$ 0,20/pt, WDO R$ 10,00/pt, pregão 09:00–18:00), os feriados
da B3 de 2026, os parâmetros públicos (links, textos, fator de segurança) e os robôs Apollo e
Orion como `em_breve`.

### Colocar um robô no ar (sem deploy)

Tudo pelo SQL editor do Supabase (ou pelo admin, a partir da Fase 3):

```sql
-- 1. conta da matriz (numero_conta nunca sai do banco)
insert into contas_matriz (apelido, corretora, numero_conta)
values ('XP principal', 'XP', '123456') returning id;

-- 2. token do coletor: aparece UMA vez, cole no EA
select gerar_token_coletor('<id da conta>');

-- 3. mapear (conta, magic) -> robô. O primeiro mapeamento define a conta principal do robô.
insert into robo_conta_magic (conta_id, magic, robo_id)
values ('<id da conta>', 1001, (select id from robos where slug = 'apollo'));

-- 4. completar o cadastro e ativar
update robos set
  ativo = 'WIN', horario_inicio = '09:05', horario_fim = '17:30',
  contratos_padrao = 1, custo_por_contrato = 1.50, capital_referencia = 5000,
  descricao_publica = '...', versao_atual = '1', status = 'ativo'
where slug = 'apollo';
```

Um robô novo é só mais um `insert into robos` + mapeamento de magic: ele aparece na home e ganha
`/robos/<slug>` sem deploy.

Se o magic já tinha deals antes do mapeamento: `select reatribuir_magic('<conta>', 1001);`.

### Histórico importado (origem manual) e fonte por dia

O histórico anterior ao coletor veio do projeto antigo (Quantsrobos, tabela `trades`) por
`scripts/importar-antigo.py`, que lê pela CLI (`--project-ref`) e grava em `operacoes` com
`origem = 'manual'` e `id_externo` (idempotente). Sem preços de entrada/saída, só resultado.

A fonte é decidida por dia (migration 0014): se um (robô, dia) tem operação manual, o site
mostra só ela; se não tem, vale o MT5 da conta principal. Importar um dia substitui o MT5 daquele
dia inteiro, então importe o dia completo. `robos.historico_manual_ate` não tem mais efeito.

Operações do Profit (Nelogica) entram por `scripts/importar-profit.py`, que lê o CSV da aba
Operações do Relatório de Performance ou o CSV da Lista de Ordens (casa as ordens executadas
no modelo netting), normaliza por contrato e grava com `id_externo` (repetir é seguro):

```bash
python scripts/importar-profit.py operacoes.csv --slug apollo --dry-run   # confere sem gravar
python scripts/importar-profit.py operacoes.csv --slug apollo             # grava
python scripts/importar-profit.py operacoes.csv --slug apollo --substituir  # refaz os dias do arquivo
```

```bash
python scripts/importar-antigo.py --dry-run   # só conta na origem
python scripts/importar-antigo.py             # carga (repetir é seguro)
python scripts/importar-antigo.py --robo "alaska-&-square" --slug alaska-square --corte 2026-09-13 --sem-lote
```

Alaska & Square vem com `--sem-lote`: o "lote" da origem (4 a 16) não é contrato a normalizar, e
a curva certa é a soma direta dos resultados (+R$ 14.269,60 até 11/09/2026). Esse robô não tem
conta nem coletor: `custo_por_contrato = 0`, `capital_referencia = 25000`, corte em 2026-09-12.

Robô só com histórico importado (sem conta principal, como o Alaska & Square) aparece com status
"Histórico" e sem painel ao vivo; `robos_publico.tem_coletor` diz isso ao front.

### Relatórios mensais

`/robos/<slug>/relatorios` lista os meses com operação; `/api/relatorios/<slug>/<YYYY-MM>/pdf`
gera o PDF (`@react-pdf/renderer`, resumo + por dia + por série + todas as operações) e
`/api/relatorios/<slug>/<YYYY-MM>/csv` o CSV, ambos a partir de `operacoes_publico`. Meses
fechados ficam em cache por um dia.

### Regras de segurança do schema

- RLS em toda tabela. `anon` só lê as views `*_publico` e chama `resumo_casa_hoje()`.
- Views públicas nunca expõem conta, número de conta, volume real nem token.
- Realtime é por **broadcast disparado no banco** (topics `robo:<slug>` e `casa`), com payload
  idêntico às views. Clientes só recebem; não há política de INSERT em `realtime.messages`.
- A chave pública do site precisa ser a **anon (JWT legada)** do projeto, porque os canais
  privados do Realtime validam o JWT. Se preferir a chave `publishable`, habilite "anonymous
  sign-ins" e ajuste `src/lib/supabase/cliente.ts`.

## Coletor do MT5 (`mt5/DeltaReporter.mq5`)

1. Copie o arquivo para `MQL5/Experts/` do terminal e compile no MetaEditor.
2. No MT5: Ferramentas > Opções > Expert Advisors > marque "Permitir WebRequest para as URLs
   listadas" e adicione a URL do site (ex.: `https://deltarobos.com.br`).
3. Arraste o EA para um gráfico qualquer (ele não opera) e preencha:
   - `InpUrlBase`: URL do site, sem barra no final
   - `InpToken`: token gerado por `gerar_token_coletor`
   - `InpHeartbeatSeg`: 3
   - `InpDiasHistorico`: 7
   - `InpSimbolos`: símbolos pra cotação na barra da home (ex.: `WINV26,WDOV26`)
4. Na aba Especialistas deve aparecer `ping ok` e o resumo do histórico enviado.

O EA envia cada deal assim que fecha (`/api/ingest/deal`), um heartbeat a cada 3 s com
balance, equity, posições e cotações (`/api/ingest/heartbeat`) e, no init, os últimos dias de
deals pra reconciliação (`/api/ingest/history`). Se a API falhar, os deals ficam numa fila e são
reenviados no próximo timer.

## Deploy (Vercel)

Variáveis de ambiente no projeto da Vercel:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
```

`vercel.json` fixa a região `gru1` (São Paulo) pras functions de ingest.

## Estrutura

```
mt5/                      EA coletor
supabase/migrations/      schema (9 migrations, ordem numérica)
supabase/seed.sql         dados iniciais
src/app/(site)/           home e /robos/[slug]
src/app/api/ingest/       ping, deal, heartbeat, history
src/components/           ui (shadcn), layout, home, robo, graficos, compartilhados
src/hooks/                realtime (useRoboAoVivo, useCasaAoVivo), relógio
src/lib/stats/            cálculo puro + testes (curva, drawdown, KPIs, períodos, pregão, status)
src/lib/ingest/           auth por token, rate limit, schemas zod, pareamento deals -> operações
src/lib/consultas/        leitura das views públicas
```
