# Plano da Fase 1 (MVP ao vivo)

Status: **aprovado em 12/09/2026 e implementado** (código, migrations, EA e testes no repositório; ver README para operar). Itens marcados com **(+)** não estavam na spec e foram aprovados junto com as respostas da seção 6. Ajustes feitos na implementação em relação ao plano: `conta_principal_id` ficou em `robos` (em vez de flag por magic) e é definida no primeiro mapeamento; `operacoes` ganhou `ciclo` para reversões dentro do mesmo `posicao_id`; `cotacoes_publico` virou `mercado_publico` (inclui horário de pregão e valor do ponto); criadas `feriados_publico` e `parametros_publico`; o cliente ressincroniza com as views ao conectar no Realtime para cobrir o intervalo do cache de 60s.

Escopo da Fase 1 (spec §11): migrations do schema, API de ingest, EA `DeltaReporter.mq5`, home (barra, hero, cards, comunidade, 3 passos, rodapé), página do robô (cabeçalho, hoje ao vivo, KPIs básicos, curva, operações do dia).

---

## 1. Estrutura de pastas

```
deltarobos/
├─ CLAUDE.md
├─ docs/
│  ├─ SPEC.md
│  └─ PLANO-FASE-1.md
├─ mt5/
│  └─ DeltaReporter.mq5              # EA coletor (só lê, não opera)
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                    # uma migration por assunto, ordem na seção 2.2
│  └─ seed.sql                       # multiplicadores, feriados, parâmetros, robôs iniciais
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                  # html lang=pt-BR, fontes, ThemeProvider
│  │  ├─ globals.css
│  │  ├─ (site)/                     # grupo com cabeçalho + rodapé
│  │  │  ├─ layout.tsx
│  │  │  ├─ page.tsx                 # home
│  │  │  └─ robos/[slug]/
│  │  │     ├─ page.tsx              # página do robô (dynamicParams, sem lista fixa de slugs)
│  │  │     ├─ loading.tsx           # skeletons
│  │  │     └─ not-found.tsx
│  │  └─ api/ingest/
│  │     ├─ ping/route.ts            # (+) GET: EA testa URL + token na configuração
│  │     ├─ deal/route.ts
│  │     ├─ heartbeat/route.ts
│  │     └─ history/route.ts
│  ├─ components/
│  │  ├─ ui/                         # shadcn/ui
│  │  ├─ layout/                     # Cabecalho, Rodape, AlternadorTema
│  │  ├─ home/                       # BarraAoVivo, Hero, GradeRobos, CardRobo, Comunidade, ComoComecar
│  │  ├─ robo/                       # CabecalhoRobo, PainelHoje, PosicaoAberta, OperacoesDoDia, KpisRobo, CardKpi, Transparencia, Disclaimer
│  │  ├─ graficos/                   # MiniCurva (Recharts), CurvaCapital (lightweight-charts)
│  │  └─ compartilhados/             # Valor, AtualizadoHa, BadgeStatusRobo, AvisoSemAtualizacao, Skeletons
│  ├─ hooks/
│  │  ├─ useRoboAoVivo.ts            # assina topic realtime do robô
│  │  ├─ useCasaAoVivo.ts            # assina topic da casa (barra da home)
│  │  └─ useAgora.ts                 # relógio de 1s pro "atualizado há Xs"
│  └─ lib/
│     ├─ supabase/
│     │  ├─ cliente.ts               # browser (anon)
│     │  ├─ servidor.ts              # RSC/route handlers (anon, cookies)
│     │  ├─ admin.ts                 # service role, só em route handlers de ingest
│     │  └─ database.types.ts        # gerado por `supabase gen types`
│     ├─ stats/                      # cálculo puro + testes
│     │  ├─ normalizacao.ts          # por contrato, pontos -> R$
│     │  ├─ serie.ts                 # curva acumulada, drawdown, recuperação
│     │  ├─ kpis.ts                  # acerto, fator de lucro, payoff, sequências...
│     │  ├─ periodos.ts              # 7d, 30d, 3m, 12m, ano, tudo (America/Sao_Paulo)
│     │  ├─ pregao.ts                # dia de pregão, pregão aberto, feriados
│     │  ├─ status-robo.ts           # operando | posicionado | parado | fora_do_horario | em_breve | desconhecido
│     │  └─ *.test.ts
│     ├─ ingest/
│     │  ├─ auth.ts                  # bearer -> sha256 -> conta (cache 60s)
│     │  ├─ rate-limit.ts            # janela por conta (best-effort em memória)
│     │  ├─ schemas.ts               # zod dos 3 payloads
│     │  ├─ parear.ts                # deals -> operação (função pura, testada)
│     │  ├─ processar-deal.ts        # orquestra upsert + pareamento + posições
│     │  └─ *.test.ts
│     ├─ consultas/                  # leitura das views públicas (home, robô), com cache 60s
│     ├─ formato.ts                  # BRL, pontos, datas, "há X min" em pt-BR
│     └─ youtube.ts                  # RSS do canal, cache 1h
├─ .env.example                      # só nomes das variáveis
├─ vercel.json                       # regions: ["gru1"]
├─ vitest.config.ts
└─ package.json, tsconfig.json, tailwind.config.ts, next.config.ts, components.json
```

---

## 2. Schema e migrations

### 2.1 Convenções
- Tabelas e colunas em português, snake_case. Enums em Postgres para listas fechadas.
- `uuid` nas tabelas de cadastro (robos, contas, usuários). `bigint identity` nas de volume (operacoes, snapshots, rejeições).
- Horários em `timestamptz` (UTC no banco). Exibição sempre em America/Sao_Paulo. Coluna `dia_pregao date` (+) em operacoes e estatisticas pra agrupar sem converter fuso em toda query.
- Preços em `numeric(14,3)` (WDO tem 3 decimais), dinheiro em `numeric(14,2)`, volume em `numeric(10,2)`.
- Toda tabela tem `criado_em` e `atualizado_em` (trigger).
- RLS ligado em tudo. `anon` e `authenticated` sem grant nas tabelas. Só views `*_publico`.

### 2.2 Ordem das migrations (`supabase/migrations/`)

| # | Arquivo | Conteúdo |
|---|---|---|
| 1 | `20260912000001_extensoes_tipos.sql` | `pg_cron` (reservado), enums `robo_status`, `lado_operacao`, `origem_operacao`, `role_perfil`, `canal_alerta`, `status_licenca`; função `set_atualizado_em()` |
| 2 | `20260912000002_cadastro.sql` | `robos`, `contas_matriz`, `robo_conta_magic`, `multiplicadores`, `feriados_b3`, `parametros` (+) |
| 3 | `20260912000003_coleta.sql` | `deals`, `posicoes_abertas`, `snapshots_conta`, `coleta_status`, `coleta_rejeicoes` (+), `cotacoes` (+) |
| 4 | `20260912000004_operacoes_estatisticas.sql` | `operacoes`, `estatisticas_diarias` + trigger de recálculo do dia, `estatisticas_cache` |
| 5 | `20260912000005_usuarios.sql` | `perfis` (+ trigger em `auth.users`), `contas_cliente`, `licencas`, `comunicados`, `alertas_inscricoes` |
| 6 | `20260912000006_funcoes.sql` | `is_admin()`, `gerar_token_coletor(conta_id)`, `robo_por_magic(conta_id, magic)`, `atualizar_heartbeat(conta_id, payload)`, `recalcular_estatisticas_dia(robo_id, dia)` |
| 7 | `20260912000007_views_publicas.sql` | `robos_publico`, `operacoes_publico`, `posicoes_abertas_publico`, `estatisticas_publico`, `comunicados_publico`, `cotacoes_publico` (+) |
| 8 | `20260912000008_realtime.sql` | triggers de broadcast + políticas em `realtime.messages` |
| 9 | `20260912000009_rls.sql` | enable RLS em tudo, revoke de `anon`/`authenticated`, políticas admin/cliente, grant select nas views |
| — | `seed.sql` | multiplicadores WIN/WDO, feriados B3 2026, parâmetros, Apollo e Orion como `em_breve` |

### 2.3 Tabelas

**robos**
`id uuid pk`, `slug text unique` (check `^[a-z0-9-]+$`), `nome`, `ativo text fk multiplicadores.prefixo_simbolo` (WIN/WDO), `descricao_publica`, `horario_inicio time`, `horario_fim time`, `contratos_padrao int`, `custo_por_contrato numeric`, `capital_referencia numeric`, `atraso_publico_segundos int default 0`, `status robo_status default 'em_breve'`, `versao_atual text`, `ordem int`, `conta_real_desde date` (+, pro cabeçalho da página; se nulo usa a 1ª operação).

**contas_matriz**
`id uuid pk`, `apelido`, `corretora`, `numero_conta text` (**privado, nunca sai**), `token_hash text unique` (sha256 hex), `ativa bool`.

**robo_conta_magic**
`conta_id`, `magic bigint`, `robo_id`, `principal bool default true` (+, qual conta alimenta as estatísticas públicas do robô), `versao_robo text null` (+, sobrescreve `robos.versao_atual`). PK `(conta_id, magic)`.

**multiplicadores**
`prefixo_simbolo text pk` (WIN, WDO), `nome` (+), `valor_ponto_brl numeric`, `margem_referencia numeric`, `pregao_inicio time` (+), `pregao_fim time` (+).

**feriados_b3**: `dia date pk`, `descricao`.

**parametros** (+): `chave text pk`, `valor jsonb`, `descricao`. Guarda `fator_seguranca` (1,5), links da comunidade, link BTG, texto do disclaimer, id do canal do YouTube. Editável sem deploy.

**deals**
`conta_id`, `ticket bigint`, **PK `(conta_id, ticket)`** (spec diz só `ticket`; tickets podem colidir entre corretoras), `robo_id uuid null` (null = não atribuído), `posicao_id bigint` (+, `DEAL_POSITION_ID`, base do pareamento), `ordem bigint` (+), `simbolo`, `tipo text` (buy/sell/...), `entry text` (in/out/inout/out_by), `volume`, `preco`, `lucro`, `comissao`, `swap`, `executado_em timestamptz`, `magic bigint`, `comentario` (+), `raw jsonb`, `recebido_em`. Índices `(conta_id, posicao_id)`, `(robo_id, executado_em)`.

**operacoes**
`id bigint identity`, `robo_id uuid null`, `conta_id`, `posicao_id bigint` (+), `simbolo`, `prefixo_simbolo` (+), `lado lado_operacao`, `contratos`, `preco_entrada`, `preco_saida`, `abertura_em`, `fechamento_em`, `duracao_seg int`, `pontos`, `pontos_por_contrato`, `resultado_brl` (bruto, do MT5), `resultado_brl_por_contrato`, `custos_brl`, `custos_brl_por_contrato` (+), `versao_robo`, `origem origem_operacao`, `dia_pregao date` (+). Unique `(conta_id, posicao_id)` para origem mt5. Índices `(robo_id, dia_pregao)`, `(robo_id, fechamento_em desc)`.

**posicoes_abertas**
`conta_id`, `ticket bigint` (posição), PK `(conta_id, ticket)`, `robo_id null`, `magic` (+), `simbolo`, `lado`, `volume`, `preco_abertura`, `lucro_flutuante`, `aberta_em` (+, necessário pro atraso público), `atualizado_em`.

**snapshots_conta**
`id`, `conta_id`, `balance`, `equity`, `em timestamptz`, `minuto timestamptz` (= `date_trunc('minute', em)`), unique `(conta_id, minuto)`. Garante 1 por minuto.

**coleta_status**
`conta_id pk`, `ultimo_heartbeat`, `ultimo_deal`, `versao_ea`, `balance` (+), `equity` (+), `n_posicoes` (+).

**coleta_rejeicoes** (+): `id`, `conta_id null`, `endpoint`, `status_http`, `motivo`, `ip`, `payload jsonb` (truncado), `em`. Spec §10 pede "log de rejeições".

**cotacoes** (+): `simbolo text pk`, `prefixo_simbolo`, `preco`, `fechamento_anterior`, `em`. Alimenta "WIN e WDO agora" da barra (spec §8.1 item 1 precisa disso e não havia tabela).

**estatisticas_diarias**
`robo_id`, `dia date`, PK `(robo_id, dia)`, `pontos_por_contrato`, `resultado_brl_por_contrato` (bruto), `custos_brl_por_contrato` (+), `n_operacoes`, `n_gain`, `n_loss`, `soma_gain_brl_por_contrato` (+), `soma_loss_brl_por_contrato` (+), `maior_gain_brl_por_contrato` (+), `maior_loss_brl_por_contrato` (+). Os (+) são o mínimo pra calcular fator de lucro e payoff sem varrer operações. Mantida por trigger em `operacoes` (insert/update/delete recalcula a linha do dia), considerando só a conta principal do robô.

**estatisticas_cache**: `robo_id`, `periodo text`, `payload jsonb`, `calculado_em`. PK `(robo_id, periodo)`. Criada agora, usada a partir da Fase 2 (ver 3.4).

**perfis**: `user_id uuid pk fk auth.users`, `nome`, `telefone`, `role role_perfil default 'cliente'`. Trigger cria perfil no signup.
**contas_cliente**: `id`, `user_id`, `corretora`, `numero_conta`, `apelido`.
**licencas**: `id`, `user_id`, `robo_id`, `conta_cliente_id`, `chave text unique`, `status status_licenca`, `valida_ate date`.
**comunicados**: `id`, `titulo`, `corpo`, `publico bool`, `publicado_em`.
**alertas_inscricoes**: `id`, `contato`, `canal canal_alerta`, `robo_id null`, `tipo text`.

### 2.4 Views públicas (`anon` e `authenticated` só têm SELECT nelas)
- `robos_publico`: campos públicos de `robos` (sem `atraso_publico_segundos`) + `conta_real_desde` efetivo + `ultimo_heartbeat_em` (max das contas principais) + `ultima_operacao_em` + `posicionado bool`. Inclui `arquivado` (a home filtra, a URL continua acessível).
- `operacoes_publico`: `id, robo_id, slug, simbolo, lado, abertura_em, fechamento_em, duracao_seg, preco_entrada, preco_saida, pontos_por_contrato, resultado_brl_por_contrato, custos_brl_por_contrato, versao_robo, dia_pregao`. Só conta principal, só `robo_id not null`. **Sem conta, sem contratos reais.**
- `posicoes_abertas_publico`: `robo_id, slug, simbolo, lado, preco_abertura, lucro_flutuante_por_contrato, aberta_em, atualizado_em`. Filtra `now() >= aberta_em + atraso_publico_segundos`. Só conta principal.
- `estatisticas_publico`: `estatisticas_diarias` + `slug`.
- `comunicados_publico`: `publico = true and publicado_em <= now()`.
- `cotacoes_publico` (+): `simbolo, prefixo_simbolo, preco, variacao_pct, em`.

As views rodam como dono (padrão do Postgres), por isso `anon` lê a view sem ter acesso à tabela. O advisor do Supabase vai apontar "security definer view"; é intencional e fica documentado.

### 2.5 Realtime (decisão importante, ver dúvida A)
O Realtime do Supabase (`postgres_changes`) **não assina views**, só tabelas. Assinar as tabelas privadas exporia colunas que a spec proíbe. Proposta: **Broadcast disparado por trigger no banco**.
- Trigger em `operacoes` → `realtime.send(payload, 'operacao', 'robo:<slug>')` com exatamente as colunas de `operacoes_publico`, e `realtime.send(..., 'resumo', 'casa')` com o resultado do dia somado.
- Trigger em `posicoes_abertas` → evento `posicao` (upsert/remocao) no topic `robo:<slug>`.
- Trigger em `coleta_status` → evento `coleta` no topic `robo:<slug>`, **limitado a 1 por 15s por robô** (heartbeat é a cada 3s; mandar todos estoura a cota de mensagens do Realtime).
- Trigger em `cotacoes` → evento `cotacao` no topic `casa`, limitado a 1 por 5s.
- Política em `realtime.messages`: `anon` pode SELECT (receber) em topics `robo:%` e `casa`. Sem política de INSERT, então ninguém consegue injetar mensagem falsa no canal.
- Cliente: `useRoboAoVivo(slug)` começa com os dados do SSR e aplica os eventos. "Atualizado há Xs" usa o timestamp da última mensagem recebida; passou de 2 min em horário de pregão, mostra o aviso e o status vira `desconhecido`.
- `atraso_publico_segundos > 0`: a view já respeita; o broadcast atrasado fica pra Fase 2 (hoje padrão é 0).

### 2.6 RLS e grants
- `alter default privileges ... revoke` + `revoke all on all tables in schema public from anon, authenticated`.
- Ingest escreve com service role (server only). Nenhum token do coletor vai pro banco em claro.
- Admin: `is_admin()` lê `perfis.role`; política ALL nas tabelas de cadastro, coleta e operações.
- Cliente: `perfis` (próprio), `contas_cliente` (próprias), `licencas` (próprias, só leitura).
- `numero_conta` de `contas_matriz`: nunca entra em view, função pública ou payload de broadcast. Teste automatizado garante que nenhuma view pública tem coluna com esse nome.

### 2.7 Seed
- `multiplicadores`: WIN R$ 0,20/ponto, WDO R$ 10,00/ponto; margem de referência e horários de pregão a confirmar.
- `feriados_b3` 2026 pelo calendário oficial da B3 (confirmar).
- `parametros`: `fator_seguranca = 1.5`, links vazios.
- `robos`: Apollo e Orion com `status = 'em_breve'` e campos da seção 13 a preencher. Aparecem na home como "em breve" até você completar.

---

## 3. API de ingest

### 3.1 Comum aos endpoints
- Route Handlers em Node.js (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`), região `gru1` (São Paulo), pra latência baixa do MT5 no Brasil.
- Auth: `Authorization: Bearer <token>` → sha256 hex → `contas_matriz.token_hash` com `ativa = true`. Cache em memória de 60s pra não consultar o banco a cada heartbeat de 3s.
- Token gerado por `gerar_token_coletor(conta_id)` (SQL, só admin): retorna o token em claro **uma vez** e grava só o hash.
- Rate limit por conta: 60 req/min em `deal` e `heartbeat`, 10/min em `history`. Janela em memória (best-effort, suficiente pro "básico" da spec).
- Validação com zod. Corpo inválido → 400; token inválido → 401; limite → 429. Todos logados em `coleta_rejeicoes`.
- Respostas curtas em JSON (o `WebRequest` do MT5 lida melhor com corpo pequeno).
- Todo request atualiza `coleta_status.versao_ea`.

### 3.2 Endpoints

**GET `/api/ingest/ping`** (+)
Resposta `{ ok, conta_apelido, servidor_em }`. Serve pra validar URL e token na hora de configurar o EA.

**POST `/api/ingest/deal`**
```json
{ "ea_versao": "1.0.0",
  "deal": { "ticket": 123, "posicao_id": 456, "ordem": 789, "simbolo": "WINV26",
            "tipo": "buy", "entry": "in", "volume": 2, "preco": 135000,
            "lucro": 0, "comissao": -0.5, "swap": 0, "magic": 1001,
            "executado_em": "2026-09-12T13:05:22.512Z", "comentario": "" } }
```
Fluxo: auth → rate limit → zod → `robo_por_magic` (null = não atribuído) → upsert em `deals` (conflito em `(conta_id, ticket)` = no-op, idempotente) → se `entry` é `in`: upsert em `posicoes_abertas`; se `out`/`inout`/`out_by`: repareia a posição (3.3) e, se fechou, upsert em `operacoes` e remove de `posicoes_abertas` → `coleta_status.ultimo_deal`. Resposta `{ ok, operacao_id? }`.

**POST `/api/ingest/heartbeat`**
```json
{ "ea_versao": "1.0.0", "em": "2026-09-12T13:05:25Z",
  "balance": 100000.00, "equity": 100250.50,
  "posicoes": [ { "ticket": 456, "simbolo": "WINV26", "lado": "compra", "volume": 2,
                  "preco_abertura": 135000, "lucro_flutuante": 250.50, "magic": 1001,
                  "aberta_em": "2026-09-12T13:04:58Z" } ],
  "cotacoes": [ { "simbolo": "WINV26", "preco": 135125, "fechamento_anterior": 134800 } ] }
```
Fluxo: auth → rate limit → zod → RPC `atualizar_heartbeat(conta_id, payload)` numa única transação: `coleta_status` upsert; `posicoes_abertas` sincroniza (remove as que sumiram, upsert as presentes com mapeamento de magic); `snapshots_conta` insere se mudou o minuto; `cotacoes` upsert. Resposta `{ ok, servidor_em }`.

**POST `/api/ingest/history`**
```json
{ "ea_versao": "1.0.0", "de": "...", "ate": "...", "pagina": 1, "total_paginas": 3,
  "deals": [ { "...": "mesmo formato do deal" } ] }
```
Até 500 deals por request. Upsert em lote, repareia todas as `posicao_id` afetadas, atualiza `ultimo_deal`. Resposta `{ ok, recebidos, inseridos, atualizados, nao_atribuidos }`. `maxDuration = 30`.

### 3.3 Pareamento deals → operações (`src/lib/ingest/parear.ts`, função pura com testes)
Conta B3 no MT5 é netting: uma posição por símbolo, identificada por `DEAL_POSITION_ID`.
- Junta todos os deals de `(conta_id, posicao_id)` ordenados por `executado_em, ticket`.
- `entradas` = entry `in` (e a parte de abertura de um `inout`); `saídas` = `out`, `out_by` (e a parte de fechamento de um `inout`).
- Se `soma(saídas.volume) < soma(entradas.volume)`: posição ainda aberta, não gera operação.
- Se fechou, **uma operação por posição**: `lado` pelo tipo da 1ª entrada; `contratos` = soma das entradas; `preco_entrada` e `preco_saida` = preço médio ponderado (VWAP); `abertura_em` = 1ª entrada; `fechamento_em` = última saída; `resultado_brl` = soma de `lucro` das saídas (valor do MT5, é o que precisa bater com o relatório); `pontos` = direção × (saída − entrada) × contratos; `custos_brl = robos.custo_por_contrato × contratos` fixado no momento do pareamento; `versao_robo` = `robo_conta_magic.versao_robo` ou `robos.versao_atual`; `dia_pregao` = data de `fechamento_em` em America/Sao_Paulo.
- Reprocessar a mesma posição (history) sobrescreve a operação pelo unique `(conta_id, posicao_id)`.
- Casos cobertos por teste: entrada/saída simples, saída parcial, múltiplas entradas, reversão (`inout`), deals fora de ordem, ticket duplicado, magic não mapeado.

### 3.4 Estatísticas (onde cada coisa é calculada)
- `estatisticas_diarias`: por trigger no banco, a cada operação. Agregação por dia é SQL simples e fica sempre igual às operações.
- Curva, drawdown, KPIs: em TypeScript (`src/lib/stats`, testado) a partir da série diária, que é pequena (1 linha por dia por robô). Calculado no servidor (RSC) com cache de 60s e no cliente pros toggles (pontos/R$, bruto/líquido) sem ida ao servidor.
- Isso substitui na Fase 1 o "job a cada 1 min" da spec §5. Motivos: o Vercel Cron no plano Hobby só roda 1x por dia, e a série diária dispensa pré-cálculo neste volume. `estatisticas_cache` fica criada pra Fase 2 (embed e OG precisam de payload pronto).

### 3.5 EA `mt5/DeltaReporter.mq5` (resumo)
- Inputs: `UrlBase`, `Token`, `IntervaloHeartbeatSeg = 3`, `DiasHistoricoInit = 7`.
- `OnInit`: `HistorySelect` dos últimos N dias → `POST /history` paginado.
- `OnTradeTransaction` (`TRADE_TRANSACTION_DEAL_ADD`): monta JSON do deal → `POST /deal`. Horário convertido pra UTC com `TimeGMT() - TimeCurrent()`.
- `OnTimer`: `POST /heartbeat` com balance, equity, posições (`PositionGetTicket`, lado, volume, preço, lucro, magic, hora) e `SYMBOL_LAST` + `SYMBOL_SESSION_CLOSE` dos símbolos em uso.
- Fila em memória: falhou o POST, guarda e reenvia no próximo timer (limite de tamanho, descarta heartbeats velhos, nunca descarta deal).
- Não opera, não abre ordem, só lê.

---

## 4. Páginas e componentes

### 4.1 Home `/` (itens 1, 2, 3, 8, 13 e 15 da spec §8.1)
`page.tsx` é Server Component com `revalidate = 60`. Busca `robos_publico`, `estatisticas_publico` (últimos 30 dias + acumulado por robô), `operacoes_publico` de hoje, `posicoes_abertas_publico`, `cotacoes_publico`, `parametros` públicos (links).

| Componente | Tipo | O que faz |
|---|---|---|
| `layout/Cabecalho` | server | logo, links, `AlternadorTema` |
| `home/BarraAoVivo` | client | pregão aberto/fechado, WIN e WDO agora com variação, nº de robôs posicionados, resultado do dia da casa por contrato, `AtualizadoHa`. Assina topic `casa`. |
| `home/Hero` | server + filho client | frase curta, `NumeroGrande` com resultado do dia somado por contrato (ao vivo), botões "ver os robôs" e "entrar na comunidade" |
| `home/GradeRobos` | client | grid responsivo ordenado pelo mês; com mais de 6 robôs mostra filtro por ativo e busca. Zero robôs hardcoded. |
| `home/CardRobo` | client | nome, ativo, `BadgeStatusRobo`, dia, mês, acumulado, drawdown máximo, `MiniCurva` 30d. Link pra `/robos/[slug]`. `em_breve` vem sem números. |
| `graficos/MiniCurva` | client | sparkline Recharts, verde/vermelho pelo sinal |
| `home/Comunidade` | server | card WhatsApp com botão, 3 últimos vídeos do YouTube via RSS (cache 1h), Instagram, Sala ao Vivo. Links de `parametros`. |
| `home/ComoComecar` | server | 3 passos: conta no BTG pelo link, escolhe o robô, libera a licença |
| `layout/Rodape` | server | app, contato, redes, aviso legal |
| `compartilhados/AtualizadoHa` | client | "atualizado há Xs", relógio de 1s, vira aviso depois de 2 min em pregão |
| `compartilhados/Valor` | server/client | formata R$ e pontos em pt-BR, `tabular-nums`, cor pelo sinal |
| `compartilhados/Skeletons` | server | skeleton de card, barra, KPI, curva |

Acima da dobra no celular: barra, hero, cards e comunidade.

### 4.2 Página do robô `/robos/[slug]` (spec §8.2, parte da Fase 1)
`page.tsx` com `dynamicParams = true` (slug novo funciona sem deploy), `generateMetadata` (título e descrição do robô), `notFound()` se o slug não existir. Busca tudo da view pública filtrando pelo slug.

| Componente | Tipo | O que faz |
|---|---|---|
| `robo/CabecalhoRobo` | server + `BadgeStatusRobo` client | nome, ativo, descrição pública, horário, contratos padrão, "conta real desde", status ao vivo, "última operação há X min" |
| `robo/PainelHoje` | client | resultado do dia em pontos e R$ por contrato, `PosicaoAberta` (lado, preço, flutuante por contrato), `OperacoesDoDia` entrando na hora. Assina `robo:<slug>`. |
| `robo/KpisRobo` + `CardKpi` | server | Fase 1: acumulado, mês, média mensal, drawdown máximo (R$ e %), taxa de acerto, fator de lucro, payoff, nº de operações, melhor e pior dia, dias positivos x negativos, maior sequência de perdas |
| `graficos/CurvaCapital` | client | lightweight-charts, curva acumulada por contrato com drawdown embaixo. Fase 1: filtro de período (7d, 30d, 3m, 12m, ano, tudo), toggle pontos/R$ e bruto/líquido. Seletor de contratos fica pra Fase 2. |
| `robo/OperacoesDoDia` | client | lista das operações de hoje (hora, lado, preços, pontos, R$). Lista completa com paginação é Fase 2. |
| `robo/Transparencia` | server | como o dado é coletado, custos considerados |
| `robo/Disclaimer` + CTA | server | texto do compliance (de `parametros`) e botão "quero esse robô" |
| `compartilhados/AvisoSemAtualizacao` | client | "sem atualização há X min" quando o coletor para em horário de pregão |

Regra de status (em `lib/stats/status-robo.ts`, testada): `em_breve`/`pausado`/`arquivado` pelo cadastro; senão `desconhecido` se heartbeat > 2 min em pregão; senão `posicionado` se tem posição aberta; senão `operando` dentro do horário do robô; senão `fora_do_horario`.

### 4.3 Design na Fase 1
Sem identidade definida: tema escuro padrão do shadcn com tema claro, fonte Geist (tabular-nums nos números), verde/vermelho/cinza conforme spec. Tokens em CSS variables pra trocar pela identidade Delta depois sem mexer em componente.

---

## 5. Testes e qualidade
- `vitest` em `src/lib/stats` e `src/lib/ingest` (pareamento, normalização, drawdown, períodos, pregão, status).
- Teste de segurança do schema: nenhuma view `*_publico` contém coluna `numero_conta`, `token_hash`, `conta_id` ou `volume`.
- `npm run build`, `npm run test`, `npm run lint` e `tsc --noEmit` antes de fechar qualquer tarefa.
- Tipos do banco gerados por `supabase gen types typescript` em `src/lib/supabase/database.types.ts`.
- Critérios da spec §12 verificados em dia de teste com o EA rodando numa conta da matriz.

---

## 6. Dúvidas

### Bloqueantes (preciso antes de começar)
1. **Supabase**: você cria o projeto (região São Paulo) e coloca `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`. Pra aplicar migrations eu uso a Supabase CLI; você roda `supabase login` uma vez no seu terminal e me diz o `project ref`.
2. **Vercel**: plano Hobby ou Pro? Muda cron e região. Quem cria o projeto na Vercel?
3. **Plano do Supabase**: Free ou Pro? Free tem cota de 2 milhões de mensagens Realtime por mês. Com muitos visitantes simultâneos e heartbeat de 3s, estoura. A proposta 2.5 já limita, mas precisa saber o plano.
4. **Várias contas por robô**: quando Apollo roda em 2 contas, a mesma operação chega duas vezes. Proposta: uma conta é `principal` e alimenta as estatísticas públicas; as outras ficam pra reconciliação e admin. Alternativa: média por contrato entre as contas. Qual?
5. **Corretora e fuso do servidor MT5**: qual corretora das contas da matriz? O EA converte pra UTC com `TimeGMT()`, mas quero confirmar em teste.
6. **Horário de pregão de WIN e WDO** pra barra "pregão aberto/fechado" e pro health-check. Fica em `multiplicadores.pregao_inicio/fim`. Quais valores?
7. **Pendências da seção 13**: posso começar com Apollo e Orion em `em_breve` e placeholder nos textos. Quando você preencher (SQL ou eu insiro), eles viram `ativo`.

### Propostas (sigo assim se você não objetar)
A. Realtime via **Broadcast de trigger** no lugar de "assinar as views" (tecnicamente impossível). Detalhe em 2.5.
B. Sem job de 1 min na Fase 1: série diária por trigger + cálculo em TS com cache de 60s (3.4).
C. Acréscimos ao schema marcados com (+): `parametros`, `cotacoes`, `coleta_rejeicoes`, `posicao_id`, `dia_pregao`, `principal`, colunas extras em `estatisticas_diarias`, `aberta_em`, `conta_real_desde`, `pregao_inicio/fim`.
D. PK de `deals` = `(conta_id, ticket)` em vez de só `ticket`.
E. Uma operação por posição MT5, VWAP em parciais, `resultado_brl` bruto do MT5, `custos = custo_por_contrato × contratos` fixado no pareamento, líquido = bruto − custos, gain/loss classificado pelo líquido.
F. `versao_robo` = `robos.versao_atual` no pareamento, com sobrescrita opcional por magic.
G. Criar **todas** as tabelas agora (inclusive as de cliente/admin), porque a spec diz "migrations do schema". Lógica delas fica pra Fase 3.
H. "Cadastrar robô pelo admin" na Fase 1 = inserir em `robos` pelo Supabase Studio. O critério que importa é "sem deploy", e isso fica garantido.
I. Endpoint extra `GET /api/ingest/ping` pra configurar o EA.
J. Functions na região `gru1`.
K. Curva na Fase 1 com período, pontos/R$ e bruto/líquido. Seletor de contratos na Fase 2.
L. "Próxima live" do YouTube: o RSS não informa agendamento de live com confiabilidade. Fase 1 mostra os 3 últimos vídeos; próxima live vem de `parametros` (link manual) até a agenda da Fase 4.
M. Design neutro (shadcn escuro, Geist) até ter cores e logo.

---

## 7. Fora da Fase 1 (adiado de propósito)
Lista completa de operações, tela ao vivo, calendário, heatmap, distribuições, risco, metodologia, OG image, embed, auth, área do cliente, admin, importação CSV, carteira, simulador, ranking, CDI/IBOV, agenda, alertas, comunicados públicos, PWA, broadcast com atraso.
