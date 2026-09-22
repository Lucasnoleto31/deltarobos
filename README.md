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

Cada robô pode ter `robos.hora_minima_operacao` (migration 0016): operação aberta antes dessa hora
(Brasília) não aparece no site nem nas estatísticas, mas continua no banco. Apollo e Orion usam
`09:10`; Alaska & Square fica nulo porque o histórico importado não tem hora real. Mudar a hora
recalcula a série pelo trigger; `update robos set hora_minima_operacao = null where slug = 'apollo'`
volta atrás.

Também por robô, `robos.duracao_minima_seg` e `robos.duracao_minima_desde` (migrations 0018 e 0019): operação
do MT5 com `duracao_seg` menor que a mínima, em pregão igual ou posterior a `desde`, fica fora do site e das
estatísticas (`desde` nulo = histórico inteiro). Importação manual ignora a regra: o histórico antigo não tem
horário de fechamento e toda linha dele tem duração 0. Existe porque a conta demo preenche a ordem a mercado num
preço defasado e o take-profit bate milissegundos depois: centenas de "operações" de 0 s ganhando exatamente
o alvo. Apollo e Orion usam `2` segundos no histórico inteiro (`desde` nulo);
`update robos set duracao_minima_seg = null where slug = 'apollo'` volta atrás.

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

### Operações em aberto (ao vivo)

O site mostra quantas operações cada robô tem abertas agora (barra e cards da home, "Hoje ao vivo" e
`/robos/<slug>/ao-vivo`). Conta-se **entradas abertas**: cada ticket (posição) aberto no MT5 vale 1; nunca
volume nem contratos. A regra é uma só, em todo lugar (migration 0020): só a conta principal do robô e só
tickets que já passaram de `robos.atraso_publico_segundos`. É a mesma expressão do booleano `posicionado`,
que continua existindo. `coleta_status.n_posicoes` não serve para isso (é por conta e sem atraso).

| onde                                  | campo                              | o que é                                              |
| ------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `posicoes_abertas_publico`            | `n_abertas`                        | tickets abertos no grupo (robô, símbolo, lado)       |
| `robos_publico`                       | `n_posicoes_abertas`               | tickets abertos do robô; `posicionado` = `> 0`       |
| `resumo_casa_hoje()`                  | `robos[].n_posicoes_abertas`, raiz `n_posicoes_abertas` | por robô e soma da casa; `n_robos_posicionados` continua |
| evento `coleta` (topics `casa`, `robo:<slug>`) | `n_posicoes_abertas`      | junto de `slug`, `ultimo_heartbeat_em`, `posicionado` |
| evento `posicao`                      | `n_abertas`                        | é a linha da view; `posicao_fechada` remove o grupo  |

Abertura e fechamento (INSERT/DELETE em `posicoes_abertas`) disparam `posicao`/`posicao_fechada` e o
`resumo` da casa na hora; o throttle de 10 s vale só para UPDATE de flutuante. Um ticket que acaba de passar
do atraso público conta como abertura; um ticket ainda dentro do atraso não transmite nada (nem um `posicao`
fora do ritmo, que denunciaria a entrada antes da hora). O evento `coleta` é throttled a 30 s por robô e
conta antes da sincronização do próprio heartbeat, então na home o `resumo` (imediato) é fundido no mapa de
coleta ao chegar, e na página do robô a `coleta` serve de corretor: se o número dela diverge do que a tela
soma, o hook ressincroniza. No front vale a regra de sempre: sem heartbeat há mais de 2 min em pregão o
contador some ou vira "sem atualização", fora do pregão ele não aparece, e sem relógio (HTML do servidor e
hidratação) também não, como o selo Posicionado.

### Relatórios mensais

`/robos/<slug>/relatorios` lista os meses com operação; `/api/relatorios/<slug>/<YYYY-MM>/pdf`
gera o PDF (`@react-pdf/renderer`, resumo + por dia + por série + todas as operações) e
`/api/relatorios/<slug>/<YYYY-MM>/csv` o CSV, ambos a partir de `operacoes_publico`. Meses
fechados ficam em cache por um dia.

### Curva de capital por operação

Na curva de capital, a aba "Por operação" liga um ponto a cada operação fechada, até 20 mil operações
no período (`PONTOS_FIEL` em `src/components/graficos/series-da-curva.ts`); acima disso o site agrupa
operações vizinhas. A Visão geral do robô chega com a série leve de 240 pontos (`PONTOS_LEVE`), que
pinta na hora, e quando o visitante abre "Por operação" busca a série completa em
`/api/robos/<slug>/curva/<periodo>` (`periodo` em `PERIODOS_FECHADOS`, hoje `semana`, `mes`, `ano` e
`tudo`): JSON só com dados públicos, montado com as mesmas funções da página, em cache por 60 s
(404 para robô inexistente, 400 para período inválido). A aba Desempenho e o calendário já têm as
operações no navegador e desenham na resolução fiel direto.

### Excursões medidas pelo EA (MFE/MAE, MEP/MEN) e candles

O EA 1.1.0 mede no terminal, tick a tick, o que o servidor não consegue ver (migrations 0021 e 0022).
Nada disso é obrigatório: o EA 1.0.0 pode continuar em alguma conta e, sem os campos novos, nada
muda. Perder uma excursão nunca perde um deal: as medições são paralelas às operações e entram por
`left join`.

| tabela privada      | chave                          | o que guarda                                                                                                   |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `excursoes_posicao` | (conta, posição, ciclo)        | MFE e MAE em pontos por contrato, horário de cada extremo, `parcial` (o EA subiu com a posição já aberta)       |
| `exposicao_dia`     | (conta, magic, dia)            | MEP e MEN do dia em R$ brutos por contrato, horários, quantas operações (ciclos fechados, não deals) já tinham fechado no extremo, `parcial` |
| `candles`           | (símbolo, timeframe, abertura) | barras fechadas do índice (M1 por padrão): OHLC, `tick_volume`, `real_volume`; retenção de ~400 dias           |

O upsert é monotônico: MFE e MEP só sobem, MAE e MEN só descem (`greatest`/`least`), então heartbeat,
deal e reenvio podem chegar em qualquer ordem e repetidos; o horário do extremo troca junto com o valor
e, com valor igual, só preenche se estava vazio (o heartbeat não manda horário, o deal manda). MEP nunca
fica negativo nem MEN positivo (spec §7: saldo que nunca ficou positivo tem MEP = 0 e sem horário).
`parcial` é grudento (`OR`): a linha agrega várias vidas do EA e todo reinício tem um buraco de ticks,
então um `false` nunca corrige um `true` anterior (o EA guarda o parcial nas GlobalVariables e o traz de
volta no init). Item de excursão sem `ciclo` é ignorado (o default 1 fundiria a medição do ciclo 2 de uma
posição revertida na linha do ciclo 1). Reenvio igual não escreve nada (e não dispara trigger).

Funções, todas só `service_role` (chamadas pelo ingest):

- `registrar_excursoes(conta, itens)`: `itens` é um objeto ou lista com as chaves do deal
  (`posicao_id, ciclo, magic, simbolo, mfe_pontos, mae_pontos, mfe_em, mae_em, excursao_parcial`) ou da
  posição do heartbeat (`ticket` no lugar de `posicao_id`, sem horários). O ingest do deal chama antes
  do upsert de `operacoes`, para a operação nascer com o join preenchido. Devolve quantas linhas escreveu.
- `atualizar_heartbeat(conta, corpo)`: o passo 0 grava `exposicao_dia` a partir de
  `corpo.exposicao_dia[]` (`magic, dia, realizado, n_saidas, mep, mep_em, mep_n_saidas, men, men_em,
  men_n_saidas, parcial`; só dias entre ontem e amanhã), antes do `coleta_status`, para o evento
  `coleta` já sair com o MEP/MEN novo; o passo 3b registra as excursões das posições abertas que
  trouxerem `mfe_pontos`.
- `gravar_candles(conta, corpo)`: `POST /api/ingest/candles` com
  `{simbolo, timeframe, candles: [{t, o, h, l, c, v, vr}]}`; `on conflict do nothing`, barra inválida
  descartada (e barra fora do minuto cheio é 400 no schema), símbolo sem multiplicador recusado sem erro
  de banco, e aí a rota responde 422 e registra em `coleta_rejeicoes` (o EA loga a cada barra nova e relê
  as mesmas barras: cadastrado o multiplicador, nada se perdeu); limpa barras com mais de 400 dias em 1%
  das chamadas (sem cron; índice em `abre_em`).

O que fica público (nunca conta, magic, volume nem número de conta; colunas novas sempre no fim):

| onde                       | o que                                                                                                                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operacoes_publico`        | `mfe_pontos_por_contrato`, `mae_pontos_por_contrato`, `mfe_em`, `mae_em`, `excursao_parcial` (nulos = não medido: EA antigo ou histórico importado)                                                                                                                              |
| `posicoes_abertas_publico` | `mfe_pontos_por_contrato` (maior do grupo) e `mae_pontos_por_contrato` (menor do grupo), do ciclo em curso de cada ticket                                                                                                                                                      |
| `exposicao_dia_publico`    | `robo_id, slug, dia, mep_ea, men_ea, mep_ea_em, men_ea_em, mep_ea_n_saidas, men_ea_n_saidas, excursao_ea_parcial, n_magics`; só a conta principal e só dias sem importação manual e sem operação do robô fora de `operacoes_publico` (hora/duração mínima: o saldo medido não bateria com a curva); existe linha só para dia que o EA mediu (sem linha, o site calcula por fechamento). Líquido = bruto − `n_saidas × custo_por_contrato` (`n_saidas` = ciclos fechados); pontos = ÷ `valor_ponto_brl` |
| `candles_publico`          | a tabela inteira                                                                                                                                                                                                                                                              |
| evento `coleta`            | ganha `mep_ea, men_ea, mep_ea_em, men_ea_em, mep_ea_n_saidas, men_ea_n_saidas, excursao_ea_parcial` de hoje (nulos quando o EA não mediu)                                                                                                                                       |
| evento `posicao`           | é a linha de `posicoes_abertas_publico`, então já traz o MFE/MAE do grupo                                                                                                                                                                                                     |
| evento `operacao`          | é a linha de `operacoes_publico`, então já traz MFE/MAE; excursão que chegar depois da operação de hoje (reconciliação, reenvio) reemite o evento                                                                                                                              |

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
   - `InpExcursao` (1.1.0): `true` mede MFE/MAE por operação e MEP/MEN do dia tick a tick
   - `InpAmostraMs` (1.1.0): 100 (50..1000), intervalo em que o EA lê os ticks novos em memória
   - `InpEnviaCandles` (1.1.0): `true` em UM terminal só, envia as barras M1 fechadas do índice
   - `InpCandlesSimbolo` (1.1.0): símbolo dos candles (vazio = o do gráfico onde o EA está)
   - `InpCandlesBackfillMin` (1.1.0): 600, minutos de candles reenviados no init (o servidor ignora repetida)
4. Na aba Especialistas deve aparecer `ping ok` e o resumo do histórico enviado.

O EA envia cada deal assim que fecha (`/api/ingest/deal`), um heartbeat a cada 3 s com
balance, equity, posições e cotações (`/api/ingest/heartbeat`) e, no init, os últimos dias de
deals pra reconciliação (`/api/ingest/history`). Se a API falhar, os deals ficam numa fila e são
reenviados no próximo timer.

Na 1.1.0 o timer roda a cada `InpAmostraMs` só em memória (ticks dos símbolos com posição aberta:
MFE/MAE por ciclo de posição, MEP/MEN por magic) e a rede continua num único slot a cada
`InpHeartbeatSeg` (heartbeat, um item da fila, candles), porque `WebRequest` é síncrono. O deal sai
com o MFE/MAE do ciclo e o heartbeat leva as posições abertas com a excursão até ali e o
`exposicao_dia` por magic. O estado sobrevive a reinício do EA/terminal pelas GlobalVariables
`DR_<posição>_<ciclo>_{mfe,mae,mfe_t,mae_t,t,p}` (`t` = até onde os ticks foram aplicados, `p` = já
era parcial): no init o EA reaplica a lacuna pela base de ticks do terminal; sem GV a posição fica
`parcial`, e as saídas de hoje anteriores ao init entram no realizado com o dia marcado `parcial`.
Instalar a 1.1.0 no lugar da 1.0.0: substituir o `.mq5`, recompilar, e o EA sobe com os mesmos
`InpUrlBase`/`InpToken` (o servidor aceita as duas versões; as migrations 0021 e 0022 precisam estar
aplicadas para os campos novos serem guardados).

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
supabase/migrations/      schema (22 migrations, ordem numérica)
supabase/seed.sql         dados iniciais
src/app/(site)/           home e /robos/[slug]
src/app/api/ingest/       ping, deal, heartbeat, history, candles, reconciliar
src/app/api/robos/        curva por operação de cada período (JSON público, cache 60 s)
src/components/           ui (shadcn), layout, home, robo, graficos, compartilhados
src/hooks/                realtime (useRoboAoVivo, useCasaAoVivo), relógio
src/lib/stats/            cálculo puro + testes (curva, drawdown, KPIs, períodos, pregão, status)
src/lib/ingest/           auth por token, rate limit, schemas zod, pareamento deals -> operações
src/lib/consultas/        leitura das views públicas
```
