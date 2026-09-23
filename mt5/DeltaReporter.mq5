//+------------------------------------------------------------------+
//|                                                DeltaReporter.mq5 |
//|                                     Coletor da Delta Robôs (MT5) |
//|                                                                  |
//|  SÓ LÊ. Não abre, não fecha, não modifica ordem nenhuma.         |
//|  Roda num gráfico próprio em cada terminal da matriz e envia:    |
//|    - cada deal fechado (+ MFE/MAE)  -> POST /api/ingest/deal     |
//|    - balance/equity/posições/       -> POST /api/ingest/heartbeat|
//|      cotações/MEP-MEN/série do saldo do dia a cada N segundos    |
//|    - últimos N dias no init         -> POST /api/ingest/history  |
//|    - candles M1 fechados (opcional) -> POST /api/ingest/candles  |
//|                                                                  |
//|  v1.1.0 mede tick a tick, só em memória: entre um heartbeat e o  |
//|  outro o timer lê os ticks novos dos símbolos com posição aberta |
//|  e guarda a máxima excursão a favor/contra de cada posição (MFE/ |
//|  MAE, em pontos por contrato) e o máximo/mínimo do saldo do dia  |
//|  por magic (MEP/MEN, R$ brutos por contrato). WebRequest é       |
//|  síncrono, então rede só no slot do heartbeat.                   |
//|                                                                  |
//|  v1.1.1 aplica na exposição do dia (e SÓ nela) as regras que o   |
//|  site usa pra esconder operação (hora mínima e duração mínima    |
//|  por robô), recebidas do servidor no ping (init, virada do dia e |
//|  a cada 10 min): o MEP/MEN segue a mesma curva pública do dia.   |
//|  Cada item de exposicao_dia leva a "versão" da regra aplicada, e |
//|  o banco só publica a linha cuja versão bate com a regra atual   |
//|  do robô; regra que muda no meio do pregão refaz o dia pelo      |
//|  histórico (parcial). MFE/MAE medem todas as posições.           |
//|                                                                  |
//|  v1.1.2 grava a série do saldo público do dia (a curva real que  |
//|  o site desenha): a cada InpSaldoBucketSeg (5 s) fecha um balde  |
//|  por magic com o mínimo, o máximo e o último valor do MESMO      |
//|  saldo que alimenta o MEP/MEN (realizado + flutuante, regras     |
//|  públicas aplicadas), amostrado a cada tick e a cada Medir().    |
//|  O balde é o do instante do tick (não o do relógio na hora de    |
//|  processar), então tick lido com atraso e replay de lacuna caem  |
//|  no balde certo; a série de um magic só anda pra frente. Os      |
//|  baldes fechados vão no heartbeat (saldo_dia) e esperam numa     |
//|  fila de até 720 até o servidor aceitar (2xx). Regra pública que |
//|  muda no meio do dia descarta a fila (o servidor apaga os baldes |
//|  do dia medidos com a regra anterior).                           |
//|                                                                  |
//|  Configuração no MT5: Ferramentas > Opções > Expert Advisors >   |
//|  "Permitir WebRequest para as URLs listadas" e adicionar a URL.  |
//+------------------------------------------------------------------+
#property copyright   "Delta Robôs"
#property version     "1.12"
#property description "Envia deals, posições, heartbeat, MFE/MAE, MEP/MEN, série do saldo do dia e candles da conta para o site da Delta Robôs. Não opera."
#property strict

//--- inputs
input string InpUrlBase       = "https://deltarobos-mu.vercel.app"; // URL base da API (sem barra no final)
input string InpToken         = "";                           // Token da conta (gerado no banco/admin)
input int    InpHeartbeatSeg  = 3;                            // Intervalo do heartbeat (segundos)
input int    InpDiasHistorico = 7;                            // Dias de histórico reenviados no init
input int    InpTimeoutMs     = 3000;                         // Timeout HTTP (ms)
input int    InpTimeoutHistMs = 20000;                        // Timeout HTTP do histórico (ms)
input string InpSimbolos      = "";                           // Símbolos extras pra cotação (ex.: WINV26,WDOV26)
input bool   InpLog           = true;                         // Log na aba Especialistas
input bool   InpExcursao      = true;                         // Mede MFE/MAE e MEP/MEN tick a tick
input int    InpAmostraMs     = 100;                          // Amostragem dos ticks (ms, 50..1000)
input int    InpSaldoBucketSeg = 5;                           // Balde da série do saldo do dia (s, 1..60)
input bool   InpEnviaCandles  = false;                        // Envia candles M1 fechados (ligar em UM terminal só)
input string InpCandlesSimbolo = "";                          // Símbolo dos candles (vazio = o do gráfico)
input int    InpCandlesBackfillMin = 600;                     // Minutos de candles reenviados no init

#define EA_VERSAO         "1.1.2"
#define FILA_MAX          500
#define BALDES_MAX        720      // baldes da série do saldo à espera de envio (1 h a 5 s com UM magic; a fila é compartilhada); cheia descarta o mais antigo
// tetos do servidor pro saldo_dia de UM heartbeat (schemas.ts e gravar_saldo_intradiario): o que passar
// disso fica na fila pro próximo heartbeat (SaldoDiaJson), nunca é enviado pra ser descartado com 2xx
#define ENVIO_ITENS_MAX   50       // itens (magic, dia, regras) por heartbeat
#define ENVIO_BALDES_ITEM 720      // baldes por item
#define ENVIO_BALDES_MAX  2000     // baldes por heartbeat
#define PAGINA_HIST       100
#define TICKS_PAGINA      4096     // ticks por CopyTicks
#define TICKS_PAGINAS_MAX 4        // páginas por amostra (só o replay de posição restaurada chega nisso)
#define SUMIDA_MS         120000   // posição fora do PositionsTotal espera o DEAL_ADD por 120 s
#define CANDLES_PAGINA    200
#define GV_PREFIXO        "DR_"
#define REGRAS_RETRY_MS   60000    // ping falhou por rede/5xx: tenta as regras de novo em 60 s (limite do ping é 30/min)
#define REGRAS_REFRESH_MS 600000   // ping ok: confere as regras de novo a cada 10 min (admin pode alterá-las no meio do pregão)
#define BRASILIA_OFFSET_SEG (-10800) // America/Sao_Paulo = UTC-3, sem horário de verão desde 2019

//--- fila de reenvio (só deals; heartbeat velho não tem valor)
string g_fila_caminho[];
string g_fila_corpo[];
int    g_fila_n = 0;

//--- depois que a fila do histórico esvazia, pede uma reconciliação ao servidor
bool   g_reconciliar_pendente = false;

//--- símbolos vistos (posições + deals + gráfico + extras) pra cotação
string g_simbolos[];

//--- último código HTTP (Http devolve true também nos 4xx que saem da fila)
int    g_http_codigo = 0;

//--- medição tick a tick: uma Excursao por ciclo de posição aberta
struct Excursao
  {
   ulong  posicao_id;      // POSITION_IDENTIFIER (não muda na reversão; o ticket muda)
   int    ciclo;           // 1 + reversões (INOUT) da posição, igual ao pareamento do site
   long   magic;
   string simbolo;
   int    sim_idx;         // índice em g_tick_sim
   int    lado;            // 0 compra, 1 venda
   double preco_abertura;  // média das entradas do ciclo
   double vol_entradas;    // soma das entradas do ciclo (normaliza por 1 contrato)
   double vol_viva;        // volume ainda aberto
   double atual;           // excursão no último tick (pontos)
   double mfe;             // >= 0, pontos por contrato
   double mae;             // <= 0
   long   mfe_msc;
   long   mae_msc;
   long   abertura_msc;    // tick anterior à abertura não conta
   long   fim_msc;         // saída já conhecida: tick posterior não conta (0 = viva)
   bool   parcial;         // o EA não viu a posição desde a abertura
   bool   visto;           // uso interno da sincronização
   bool   gv_sujo;         // extremo novo ainda não gravado nas GlobalVariables
   ulong  sumiu_ms;        // GetTickCount64 de quando saiu do PositionsTotal (0 = viva)
   long   ultimo_msc;      // último tick aplicado: o DealAntes rebobina daqui (tick lido com a posição sumida/virada não se perde)
   ulong  gv_ms;           // GetTickCount64 da última gravação nas GlobalVariables
   double real_pc;         // quanto deste ciclo já entrou no realizado do dia (a regra da duração devolve se o ciclo fecha curto)
   double pend_pc;         // saída parcial feita antes de a posição completar a duração mínima: entra no realizado quando ela completa; some se o ciclo fecha curto
  };

//--- MEP/MEN do dia por magic (saldo = realizado do dia + flutuante das posições do magic)
struct ExposicaoDia
  {
   long   magic;
   int    dia;             // dias desde 1970 no relógio do servidor
   int    n_saidas;
   int    mep_n;
   int    men_n;
   double realizado_pc;    // R$ brutos por contrato das saídas do dia
   double flut_pc;         // idem, posições vivas
   double mep;
   double men;
   long   mep_msc;
   long   men_msc;
   bool   parcial;         // já havia deal (ou posição) antes do EA subir
   bool   regras;          // o magic tinha regra do servidor quando o dia foi calculado (regras_aplicadas; o item leva a versão dela)
   long   bal_t0;          // série do saldo: início do balde corrente (segundos do relógio do servidor, múltiplo de g_balde_seg);
                           // com bal_n == 0 é o do último balde fechado (piso do próximo: a série nunca volta), 0 = nenhum
   double bal_min;         // mínimo, máximo e último saldo amostrado no balde corrente
   double bal_max;
   double bal_ult;
   int    bal_n;           // amostras no balde corrente (0 = vazio)
  };

//--- balde fechado da série do saldo do dia, à espera de um heartbeat que o servidor aceite
struct Balde
  {
   long   magic;
   long   t0;              // início do balde, segundos do relógio do servidor (vira epoch UTC no JSON)
   double minimo;          // R$ brutos por contrato
   double maximo;
   double ultimo;
   bool   regras;          // regras_aplicadas do magic quando o balde foi medido
  };

//--- regra pública de um magic (robos.hora_minima_operacao / duracao_minima_seg / duracao_minima_desde),
//--- como o servidor manda no ping. Vale SÓ pra exposição do dia; MFE/MAE medem todas as posições.
struct RegraMagic
  {
   long magic;
   int  hora_min_seg;      // segundo do dia (Brasília) da hora mínima; -1 = sem hora mínima
   int  dur_min_seg;       // duração mínima do ciclo (s); 0 = sem duração mínima
   int  desde_dia;         // yyyymmdd a partir do qual a duração mínima vale; 0 = sempre
   string versao;          // "versão" da regra calculada pelo servidor (opaca; ecoada em exposicao_dia.regras_versao pra view conferir)
  };

//--- ciclo (operação do site) reconstruído das saídas de hoje na semeadura
struct CicloSemente
  {
   ulong  pos;
   int    ciclo;
   long   magic;
   double lucro_pc;        // soma de lucro / volume de entradas das saídas do ciclo
   long   abertura_msc;    // 0 = desconhecida (sem histórico da posição)
   long   fim_msc;         // última saída vista
   bool   fechado;
  };

Excursao     g_exc[];
ExposicaoDia g_exp[];
RegraMagic   g_regras[];
bool         g_regras_ok      = false; // já recebeu "regras" do servidor (lista vazia também conta)
ulong        g_regras_prox_ms = 0;     // GetTickCount64 do próximo ping pelas regras (0 = nenhum agendado)
string       g_tick_sim[];      // símbolos com leitura de ticks
long         g_tick_msc[];      // último tick lido por símbolo (0 = parado)
double       g_tick_vp[];       // R$ por ponto por contrato do símbolo
bool         g_tick_atras[];    // a leitura de ticks do símbolo ainda não alcançou o presente (replay em páginas): a amostra "agora" da série do saldo espera
MqlTick      g_ticks[];         // buffer reaproveitado do CopyTicks
int          g_dia = 0;         // dia do servidor da exposição corrente
long         g_inicio_msc = 0;  // tick anterior ao init não mexe no MEP/MEN (só no MFE/MAE)
ulong        g_ultimo_deal_contab = 0; // maior deal já somado na semeadura (não contar 2x)
int          g_amostra_ms = 100;
int          g_balde_seg  = 5;         // InpSaldoBucketSeg validado
Balde        g_baldes[BALDES_MAX];     // fila circular de baldes fechados ainda não enviados
int          g_baldes_ini = 0;         // índice do mais antigo
int          g_baldes_n   = 0;
int          g_baldes_enviando = 0;    // quantos foram no último heartbeat (saem da fila no 2xx)
bool         g_baldes_perda_avisada = false; // já logou descarte por fila cheia (loga de novo depois que a fila esvazia)
ulong        g_ultimo_hb_ms = 0;
bool         g_candle_ok = false;      // g_candle_ate já foi inicializado
datetime     g_candle_ate = 0;         // última barra M1 aceita pelo servidor
datetime     g_candle_t0 = 0;          // barra corrente na última tentativa
bool         g_candle_atrasado = false; // ficou página pra enviar no próximo slot

//+------------------------------------------------------------------+
//| Utilidades                                                       |
//+------------------------------------------------------------------+
void Log(string msg)
  {
   if(InpLog) Print("[DeltaReporter] ", msg);
  }

// Escapa uma string pra JSON
string JsonStr(string s)
  {
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   StringReplace(r, "\n", " ");
   StringReplace(r, "\r", " ");
   StringReplace(r, "\t", " ");
   return "\"" + r + "\"";
}

string Bool(bool v)
  {
   return (v ? "true" : "false");
  }

// Diferença (segundos) entre o relógio do servidor e o UTC. Os dois relógios são truncados ao
// segundo com fases diferentes, então a subtração crua oscila ±1 s (um candle sairia "13:40:01Z",
// minuto errado na chave de candles); fuso de servidor é sempre múltiplo de 15 min: arredonda.
long OffsetServidorSeg()
  {
   long d = (long)(TimeTradeServer() - TimeGMT());
   return (long)MathRound(d / 900.0) * 900;
  }

// datetime do servidor (+ms) -> ISO 8601 em UTC
string IsoUtc(datetime t_servidor, int ms = 0)
  {
   datetime utc = t_servidor - (datetime)OffsetServidorSeg();
   MqlDateTime d;
   TimeToStruct(utc, d);
   return StringFormat("\"%04d-%02d-%02dT%02d:%02d:%02d.%03dZ\"",
                       d.year, d.mon, d.day, d.hour, d.min, d.sec, ms);
  }

// ms desde epoch (servidor) -> ISO UTC
string IsoUtcMsc(long msc)
  {
   if(msc <= 0) return IsoUtc(TimeCurrent());
   return IsoUtc((datetime)(msc / 1000), (int)(msc % 1000));
  }

// Dia do servidor (dias desde 1970). O servidor da B3 está em Brasília, então é o dia do pregão.
int DiaServidor()
  {
   return (int)(TimeTradeServer() / 86400);
  }

// "2026-09-22" (com aspas) a partir do dia do servidor
string DiaIso(int dia)
  {
   MqlDateTime d;
   TimeToStruct((datetime)((long)dia * 86400), d);
   return StringFormat("\"%04d-%02d-%02d\"", d.year, d.mon, d.day);
  }

long MscServidor()
  {
   return (long)TimeTradeServer() * 1000;
  }

string Num(double v, int digitos)
  {
   return DoubleToString(v, digitos);
  }

int DigitosDe(string simbolo)
  {
   long d = SymbolInfoInteger(simbolo, SYMBOL_DIGITS);
   if(d <= 0 || d > 8) return 3;
   return (int)d;
  }

void LembrarSimbolo(string simbolo)
  {
   if(simbolo == "") return;
   for(int i = 0; i < ArraySize(g_simbolos); i++)
      if(g_simbolos[i] == simbolo) return;
   int n = ArraySize(g_simbolos);
   ArrayResize(g_simbolos, n + 1);
   g_simbolos[n] = simbolo;
  }

void LembrarMagic(long &lista[], long magic)
  {
   for(int i = 0; i < ArraySize(lista); i++)
      if(lista[i] == magic) return;
   int n = ArraySize(lista);
   ArrayResize(lista, n + 1);
   lista[n] = magic;
  }

// R$ por 1 ponto de preço por contrato. WIN: tick de 5 pontos vale R$ 1,00 -> 0,20/ponto.
// WDO: tick de 0,5 vale R$ 5,00 -> 10,00/ponto. "Ponto" aqui é unidade de preço, igual ao site.
double ValorPonto(string simbolo)
  {
   double tv = SymbolInfoDouble(simbolo, SYMBOL_TRADE_TICK_VALUE);
   double ts = SymbolInfoDouble(simbolo, SYMBOL_TRADE_TICK_SIZE);
   if(tv <= 0 || ts <= 0) return 0;
   return tv / ts;
  }

void LogValorPonto(string simbolo)
  {
   double tv = SymbolInfoDouble(simbolo, SYMBOL_TRADE_TICK_VALUE);
   double ts = SymbolInfoDouble(simbolo, SYMBOL_TRADE_TICK_SIZE);
   double vp = ValorPonto(simbolo);
   if(vp <= 0)
      Log(StringFormat("%s: valor por ponto desconhecido (tick_value %.4f, tick_size %.4f); MEP/MEN sem o flutuante deste símbolo",
                       simbolo, tv, ts));
   else
      Log(StringFormat("%s: R$ %.4f por ponto por contrato (tick de %s = R$ %.4f)",
                       simbolo, vp, DoubleToString(ts, DigitosDe(simbolo)), tv));
  }

//+------------------------------------------------------------------+
//| Regras públicas do servidor                                      |
//+------------------------------------------------------------------+
// O site esconde por regra algumas operações do robô: aberta (hora de Brasília) antes de
// robos.hora_minima_operacao, ou do MT5 com duracao_seg menor que robos.duracao_minima_seg a partir
// do pregão duracao_minima_desde. O MEP/MEN do dia tem que seguir a mesma curva pública, então o EA
// pede as regras ao servidor (GET /api/ingest/ping, campo "regras", um item por magic desta conta) no
// init, na virada do dia e a cada REGRAS_REFRESH_MS, e as aplica SÓ na exposição do dia: ciclo fora
// da regra não entra no realizado, no n_saidas nem no flutuante. MFE/MAE por posição continuam
// medindo TODAS as posições.
//
// Versão: cada item do ping traz "versao" (texto opaco que o banco calcula da regra do robô). O EA
// ecoa a versão em cada item de exposicao_dia (regras_versao) e a view só publica a linha cuja
// versão bate com a regra ATUAL do robô; se a lista de regras muda com o dia em andamento (admin
// alterou hora/duração/desde, magic mapeado depois do init, retentativa do ping depois de falhar no
// init), o dia é refeito pelo histórico com as regras novas e fica parcial. Um item com regras e
// versão diferente da gravada SUBSTITUI a linha no banco (o MEP medido com a regra velha não pode
// sobreviver num greatest).
//
// Hora: o site converte executado_em (que este EA manda como hora do servidor - offset, em UTC) para
// America/Sao_Paulo. O EA faz a mesma conta: hora do servidor - offset - 3 h. PREMISSA: servidor de
// negociação em Brasília (offset -10800 s), caso em que a hora de abertura é a própria hora do
// servidor (TimeTradeServer); com outro offset a conversão ainda vale e o log do init avisa.
// BRASILIA_OFFSET_SEG é fixo (UTC-3): se o horário de verão voltar, o site (tz database) e o EA
// divergem 1 h e o define precisa ser revisto (ou o offset passar a vir no ping).
// Duração: arredondada ao segundo, como o duracao_seg do pareamento (round(ms / 1000)): ciclo de
// 1,6 s vira 2 s e é público; a MESMA conta serve de idade da posição viva pro flutuante e pra
// saída parcial pendente (não "corrigir" pra 2,0 s cravados: desalinharia da regra do ciclo
// fechado). Um ciclo que dura 9 ms nunca entra.
// Abertura desconhecida (histórico da posição indisponível) com regra pro magic: o ciclo NÃO conta
// (o site também esconde operação do MT5 sem duração conhecida quando há duração mínima) e o dia do
// magic fica parcial, com log.
// Saída parcial antes de a posição completar a duração mínima: fica pendente (Excursao.pend_pc) e só
// entra no realizado quando a posição completa a duração (junto com o flutuante); se o ciclo fecha
// curto, some junto, e o MEP/MEN nunca vê a parcial de um ciclo que o site esconde.

// "09:10" ou "09:10:00" -> segundo do dia; vazio ou null -> -1
int HoraParaSeg(string s)
  {
   if(s == "" || s == "null") return -1;
   string p[];
   int n = StringSplit(s, ':', p);
   if(n < 2) return -1;
   int h  = (int)StringToInteger(p[0]);
   int m  = (int)StringToInteger(p[1]);
   int sg = (n > 2 ? (int)StringToInteger(p[2]) : 0);
   if(h < 0 || h > 23 || m < 0 || m > 59 || sg < 0 || sg > 59) return -1;
   return h * 3600 + m * 60 + sg;
  }

string HoraTexto(int seg)
  {
   if(seg % 60 == 0) return StringFormat("%02d:%02d", seg / 3600, (seg / 60) % 60);
   return StringFormat("%02d:%02d:%02d", seg / 3600, (seg / 60) % 60, seg % 60);
  }

// "2026-09-21" -> 20260921; vazio ou null -> 0
int DiaParaYmd(string s)
  {
   if(s == "" || s == "null") return 0;
   string p[];
   if(StringSplit(s, '-', p) < 3) return 0;
   int y = (int)StringToInteger(p[0]);
   int m = (int)StringToInteger(p[1]);
   int d = (int)StringToInteger(p[2]);
   if(y < 2000 || m < 1 || m > 12 || d < 1 || d > 31) return 0;
   return y * 10000 + m * 100 + d;
  }

string YmdTexto(int ymd)
  {
   return StringFormat("%04d-%02d-%02d", ymd / 10000, (ymd / 100) % 100, ymd % 100);
  }

// yyyymmdd do dia corrente do servidor (g_dia), com cache
int DiaYmdCorrente()
  {
   static int dia = 0;
   static int ymd = 0;
   if(dia != g_dia)
     {
      MqlDateTime d;
      TimeToStruct((datetime)((long)g_dia * 86400), d);
      dia = g_dia;
      ymd = d.year * 10000 + d.mon * 100 + d.day;
     }
   return ymd;
  }

// Segundo do dia em Brasília de um instante do servidor (ms), pela mesma conta que o site faz
int SegDoDiaBrasilia(long msc)
  {
   long seg = msc / 1000 - OffsetServidorSeg() + BRASILIA_OFFSET_SEG;
   seg %= 86400;
   if(seg < 0) seg += 86400;
   return (int)seg;
  }

// Posição do ':' que segue a chave num texto JSON. Anda pelo texto pulando cada string inteira, então
// um VALOR igual ao nome da chave (ex.: conta_apelido = "regras") não engana; e a chave só vale
// precedida de '{' ou ',' (fora de espaços) e seguida de ':'. -1 = não existe.
int JsonChave(const string json, const string chave)
  {
   int n   = StringLen(json);
   int len = StringLen(chave);
   int i   = 0;
   while(i < n)
     {
      if(StringGetCharacter(json, i) != '"') { i++; continue; }
      int j = i + 1;   // fim da string que começa em i
      while(j < n)
        {
         ushort c = StringGetCharacter(json, j);
         if(c == '\\') { j += 2; continue; }
         if(c == '"') break;
         j++;
        }
      if(j >= n) return -1;
      if(j - i - 1 == len && StringSubstr(json, i + 1, len) == chave)
        {
         int a = i - 1;
         while(a >= 0 && StringGetCharacter(json, a) <= ' ') a--;
         int b = j + 1;
         while(b < n && StringGetCharacter(json, b) <= ' ') b++;
         if(a >= 0 && b < n && StringGetCharacter(json, b) == ':'
            && (StringGetCharacter(json, a) == '{' || StringGetCharacter(json, a) == ','))
            return b;
        }
      i = j + 1;
     }
   return -1;
  }

// Valor bruto de uma chave num objeto JSON plano: string sem aspas; número, true/false e null como
// texto; "" se a chave não existe. Só o que o ping manda (sem objeto dentro de objeto).
string JsonValor(const string obj, const string chave)
  {
   int p = JsonChave(obj, chave);
   if(p < 0) return "";
   int n = StringLen(obj);
   p++;
   while(p < n && StringGetCharacter(obj, p) <= ' ') p++;
   if(p >= n) return "";
   if(StringGetCharacter(obj, p) == '"')
     {
      int q = p + 1;
      while(q < n)
        {
         ushort c = StringGetCharacter(obj, q);
         if(c == '\\') { q += 2; continue; }
         if(c == '"') break;
         q++;
        }
      return StringSubstr(obj, p + 1, q - p - 1);
     }
   int q = p;
   while(q < n)
     {
      ushort c = StringGetCharacter(obj, q);
      if(c == ',' || c == '}' || c == ']' || c <= ' ') break;
      q++;
     }
   return StringSubstr(obj, p, q - p);
  }

// Objetos de primeiro nível do array em "chave":[...]. false = a chave (ou o array) não existe.
bool JsonArrayObjetos(const string json, const string chave, string &itens[])
  {
   ArrayResize(itens, 0);
   int p = JsonChave(json, chave);
   if(p < 0) return false;
   int n = StringLen(json);
   p++;
   while(p < n && StringGetCharacter(json, p) <= ' ') p++;
   if(p >= n || StringGetCharacter(json, p) != '[') return false;
   int  prof   = 0;
   int  ini    = -1;
   bool em_str = false;
   for(int i = p + 1; i < n; i++)
     {
      ushort c = StringGetCharacter(json, i);
      if(em_str)
        {
         if(c == '\\') { i++; continue; }
         if(c == '"') em_str = false;
         continue;
        }
      if(c == '"') { em_str = true; continue; }
      if(c == '{')
        {
         if(prof == 0) ini = i;
         prof++;
         continue;
        }
      if(c == '}')
        {
         prof--;
         if(prof == 0 && ini >= 0)
           {
            int m = ArraySize(itens);
            ArrayResize(itens, m + 1);
            itens[m] = StringSubstr(json, ini, i - ini + 1);
            ini = -1;
           }
         continue;
        }
      if(c == ']' && prof == 0) break;
     }
   return true;
  }

// Mesmas regras, magic a magic (ordem não importa)
bool RegrasIguais(const RegraMagic &a[], const RegraMagic &b[])
  {
   if(ArraySize(a) != ArraySize(b)) return false;
   for(int i = 0; i < ArraySize(a); i++)
     {
      bool achou = false;
      for(int j = 0; j < ArraySize(b) && !achou; j++)
         if(b[j].magic == a[i].magic)
            achou = (b[j].hora_min_seg == a[i].hora_min_seg && b[j].dur_min_seg == a[i].dur_min_seg
                     && b[j].desde_dia == a[i].desde_dia && b[j].versao == a[i].versao);
      if(!achou) return false;
     }
   return true;
  }

// Extrai "regras" da resposta do ping pra g_regras. false = a resposta não tem a chave (servidor
// antigo) ou a lista veio ilegível (itens sem magic): g_regras fica como estava. mudaram = a lista
// nova difere da que valia até aqui.
bool LerRegras(const string json, bool &mudaram)
  {
   mudaram = false;
   string itens[];
   if(!JsonArrayObjetos(json, "regras", itens)) return false;
   RegraMagic novas[];
   ArrayResize(novas, 0);
   for(int i = 0; i < ArraySize(itens); i++)
     {
      string magic = JsonValor(itens[i], "magic");
      if(magic == "" || magic == "null") continue;
      RegraMagic r;
      r.magic        = StringToInteger(magic);
      r.hora_min_seg = HoraParaSeg(JsonValor(itens[i], "hora_minima"));
      string dur     = JsonValor(itens[i], "duracao_minima_seg");
      r.dur_min_seg  = ((dur == "" || dur == "null") ? 0 : (int)StringToInteger(dur));
      if(r.dur_min_seg < 0) r.dur_min_seg = 0;
      r.desde_dia    = DiaParaYmd(JsonValor(itens[i], "duracao_minima_desde"));
      string versao  = JsonValor(itens[i], "versao");
      r.versao       = (versao == "null" ? "" : versao);
      int n = ArraySize(novas);
      ArrayResize(novas, n + 1);
      novas[n] = r;
     }
   if(ArraySize(itens) > 0 && ArraySize(novas) == 0)
     {
      Log("ping com \"regras\" ilegíveis (nenhum item com magic): ficam as regras anteriores");
      return false;
     }
   mudaram = !RegrasIguais(g_regras, novas);
   ArrayResize(g_regras, ArraySize(novas));
   for(int i = 0; i < ArraySize(novas); i++) g_regras[i] = novas[i];
   return true;
  }

void LogRegras()
  {
   int n = ArraySize(g_regras);
   if(n == 0)
     {
      Log("regras do servidor: nenhuma (nenhum robô tem esta conta como principal); exposição do dia sem corte");
      return;
     }
   bool com_hora = false;
   for(int i = 0; i < n; i++)
     {
      string s = "regras do servidor: magic " + IntegerToString(g_regras[i].magic) + ": ";
      if(g_regras[i].hora_min_seg >= 0)
        {
         s += "hora mínima " + HoraTexto(g_regras[i].hora_min_seg);
         com_hora = true;
        }
      else
         s += "sem hora mínima";
      if(g_regras[i].dur_min_seg > 0)
        {
         s += StringFormat(", duração mínima %d s", g_regras[i].dur_min_seg);
         if(g_regras[i].desde_dia > 0) s += " desde " + YmdTexto(g_regras[i].desde_dia);
        }
      else
         s += ", sem duração mínima";
      s += (g_regras[i].versao != "" ? " [versão " + g_regras[i].versao + "]"
                                     : " [SEM versão: o banco não publica a exposição deste magic]");
      Log(s);
     }
   if(com_hora)
     {
      int off = (int)OffsetServidorSeg();
      Log(StringFormat("hora mínima comparada com a abertura em Brasília = hora do servidor de negociação - offset UTC (%d s) - 3 h%s",
                       off, (off == BRASILIA_OFFSET_SEG
                             ? ", ou seja, a própria hora do servidor"
                             : "; ATENÇÃO: servidor de negociação fora de Brasília, confira se a hora mínima bate com o site")));
     }
  }

int ProcurarRegra(long magic)
  {
   for(int i = 0; i < ArraySize(g_regras); i++)
      if(g_regras[i].magic == magic) return i;
   return -1;
  }

// Duração "do site": arredondada ao segundo (duracao_seg = round(ms / 1000))
int DuracaoSeg(long de_msc, long ate_msc)
  {
   if(ate_msc <= de_msc) return 0;
   return (int)MathRound((ate_msc - de_msc) / 1000.0);
  }

// A duração mínima da regra r vale hoje?
bool RegraDuracaoVigente(int r)
  {
   return (g_regras[r].dur_min_seg > 0
           && (g_regras[r].desde_dia == 0 || DiaYmdCorrente() >= g_regras[r].desde_dia));
  }

// O ciclo/posição aberto em abertura_msc já tem a duração mínima da regra r até ate_msc? (<= 0 = não
// avalia a duração)
bool RegraDuracaoOk(int r, long abertura_msc, long ate_msc)
  {
   if(ate_msc <= 0 || !RegraDuracaoVigente(r)) return true;
   return (DuracaoSeg(abertura_msc, ate_msc) >= g_regras[r].dur_min_seg);
  }

// O ciclo do magic aberto em abertura_msc entra na exposição do dia? ate_msc > 0 avalia também a
// duração até ali (saída que fecha o ciclo, ou idade da posição viva pro flutuante); <= 0 só a hora.
// Sem regra pro magic conta como na 1.1.0. Com regra e abertura desconhecida (sem histórico da
// posição) NÃO conta: o site também esconde operação sem duração conhecida quando há duração mínima;
// quem chama marca o dia do magic como parcial.
bool RegraConta(long magic, long abertura_msc, long ate_msc)
  {
   int r = ProcurarRegra(magic);
   if(r < 0) return true;
   if(abertura_msc <= 0) return false;
   if(g_regras[r].hora_min_seg >= 0 && SegDoDiaBrasilia(abertura_msc) < g_regras[r].hora_min_seg) return false;
   return RegraDuracaoOk(r, abertura_msc, ate_msc);
  }

// As regras mudaram com o dia em andamento (ping do init falhou e a retentativa passou; admin alterou
// hora/duração/desde no meio do pregão; magic mapeado depois do init): refaz o dia pelo histórico com
// as regras novas. O caminho tick a tick medido até aqui é descartado, então todo magic que já tinha
// linha ou posição acompanhada fica parcial, mesmo sem saída hoje (só flutuante): o extremo público
// pode ter passado sem ser visto. Os itens seguintes levam a versão nova e substituem a linha no banco.
void AplicarRegrasNovas()
  {
   if(!InpExcursao || g_dia == 0) return;
   long magics[];
   ArrayResize(magics, 0);
   for(int x = 0; x < ArraySize(g_exp); x++) LembrarMagic(magics, g_exp[x].magic);
   for(int i = 0; i < ArraySize(g_exc); i++) LembrarMagic(magics, g_exc[i].magic);
   Log(StringFormat("regras do servidor mudaram com o dia em andamento: MEP/MEN de %d magics refeitos pelo histórico com as regras novas (parcial)",
                    ArraySize(magics)));
   ArrayResize(g_exp, 0);   // o balde corrente da série do saldo vai junto
   // os fechados também: foram medidos com a regra anterior e o servidor apaga os do dia já gravados
   // quando o item de exposicao_dia chega com a versão nova (o que sai daqui em diante é da regra nova)
   ZerarBaldes("regras do servidor mudaram: baldes medidos com a regra anterior");
   for(int i = 0; i < ArraySize(g_exc); i++)
     {
      g_exc[i].real_pc = 0;   // a semeadura recalcula o que cada ciclo aberto já realizou
      g_exc[i].pend_pc = 0;
     }
   SemearDia();
   for(int m = 0; m < ArraySize(magics); m++)
     {
      int x = ProcurarExp(magics[m], true);
      g_exp[x].parcial = true;
     }
   for(int x = 0; x < ArraySize(g_exp); x++) g_exp[x].parcial = true;
  }

//+------------------------------------------------------------------+
//| HTTP                                                             |
//+------------------------------------------------------------------+
// Devolve true se a API respondeu 2xx (ou um 4xx que não adianta repetir; veja o fim).
// Em -1 explica a liberação de URL. O código fica em g_http_codigo.
bool Http(string metodo, string caminho, string corpo, string &resposta, int timeout_ms = 0)
  {
   string url = InpUrlBase + caminho;
   int    timeout = (timeout_ms > 0 ? timeout_ms : InpTimeoutMs);
   string cabecalhos = "Content-Type: application/json\r\n"
                       "Accept: application/json\r\n"
                       "Authorization: Bearer " + InpToken + "\r\n";
   uchar dados[];
   uchar resultado[];
   string cabecalhos_resp;

   if(corpo != "")
     {
      StringToCharArray(corpo, dados, 0, StringLen(corpo), CP_UTF8);
      // StringToCharArray inclui o terminador nulo: remove
      int n = ArraySize(dados);
      if(n > 0 && dados[n - 1] == 0) ArrayResize(dados, n - 1);
     }

   ResetLastError();
   int codigo = WebRequest(metodo, url, cabecalhos, timeout, dados, resultado, cabecalhos_resp);
   g_http_codigo = codigo;

   if(codigo == -1)
     {
      int erro = GetLastError();
      if(erro == 4014)
         Log("WebRequest bloqueado. Libere a URL " + InpUrlBase +
             " em Ferramentas > Opções > Expert Advisors > Permitir WebRequest.");
      else
         Log(StringFormat("WebRequest falhou (%s %s): erro %d", metodo, caminho, erro));
      resposta = "";
      return false;
     }

   resposta = CharArrayToString(resultado, 0, WHOLE_ARRAY, CP_UTF8);

   if(codigo >= 200 && codigo < 300) return true;

   // 1001..1004 são códigos internos do MT5 (conexão/timeout), não HTTP
   if(codigo >= 1001 && codigo <= 1004)
      Log(StringFormat("falha de rede %d em %s %s (%d bytes, timeout %d ms)",
                       codigo, metodo, caminho, ArraySize(dados), timeout));
   else
      Log(StringFormat("HTTP %d em %s %s (%d bytes): %s",
                       codigo, metodo, caminho, ArraySize(dados), StringSubstr(resposta, 0, 300)));
   // 429 (limite por minuto): fica na fila e tenta no próximo timer.
   // 400/401/404/413/422: reenviar não resolve; sai da fila pra não travar (o log já avisou).
   if(codigo == 429) return false;
   return (codigo == 400 || codigo == 401 || codigo == 404 || codigo == 413 || codigo == 422);
  }

void Enfileirar(string caminho, string corpo)
  {
   if(g_fila_n >= FILA_MAX)
     {
      // descarta o mais antigo
      for(int i = 1; i < g_fila_n; i++)
        {
         g_fila_caminho[i - 1] = g_fila_caminho[i];
         g_fila_corpo[i - 1]   = g_fila_corpo[i];
        }
      g_fila_n--;
     }
   ArrayResize(g_fila_caminho, g_fila_n + 1);
   ArrayResize(g_fila_corpo, g_fila_n + 1);
   g_fila_caminho[g_fila_n] = caminho;
   g_fila_corpo[g_fila_n]   = corpo;
   g_fila_n++;
   Log(StringFormat("na fila: %d", g_fila_n));
  }

// Envia UM item da fila por chamada (o heartbeat nunca espera a fila inteira).
// Em falha o item fica na fila e tenta de novo no próximo timer.
void ReenviarUm()
  {
   if(g_fila_n == 0) return;

   string resp;
   bool historico = (StringFind(g_fila_caminho[0], "/history") >= 0);
   int  timeout   = (historico ? InpTimeoutHistMs : 0);
   if(!Http("POST", g_fila_caminho[0], g_fila_corpo[0], resp, timeout)) return;

   if(historico) Log(StringFormat("página de histórico ok, restam %d na fila", g_fila_n - 1));

   for(int i = 1; i < g_fila_n; i++)
     {
      g_fila_caminho[i - 1] = g_fila_caminho[i];
      g_fila_corpo[i - 1]   = g_fila_corpo[i];
     }
   g_fila_n--;
   ArrayResize(g_fila_caminho, g_fila_n);
   ArrayResize(g_fila_corpo, g_fila_n);

   // fila zerou depois de um histórico: fecha o que ficou pendurado
   if(g_fila_n == 0 && g_reconciliar_pendente)
     {
      g_reconciliar_pendente = false;
      Reconciliar();
     }
  }

//+------------------------------------------------------------------+
//| Excursões: estado em memória                                     |
//+------------------------------------------------------------------+
void ZerarExcursao(Excursao &e)
  {
   e.posicao_id = 0;
   e.ciclo = 1;
   e.magic = 0;
   e.simbolo = "";
   e.sim_idx = -1;
   e.lado = 0;
   e.preco_abertura = 0;
   e.vol_entradas = 0;
   e.vol_viva = 0;
   e.atual = 0;
   e.mfe = 0;
   e.mae = 0;
   e.mfe_msc = 0;
   e.mae_msc = 0;
   e.abertura_msc = 0;
   e.fim_msc = 0;
   e.parcial = false;
   e.visto = false;
   e.gv_sujo = false;
   e.sumiu_ms = 0;
   e.ultimo_msc = 0;
   e.gv_ms = 0;
   e.real_pc = 0;
   e.pend_pc = 0;
  }

int ProcurarExc(ulong posicao_id)
  {
   for(int i = 0; i < ArraySize(g_exc); i++)
      if(g_exc[i].posicao_id == posicao_id) return i;
   return -1;
  }

void RemoverExcursao(int i)
  {
   int n = ArraySize(g_exc);
   for(int j = i + 1; j < n; j++) g_exc[j - 1] = g_exc[j];
   ArrayResize(g_exc, n - 1);
  }

// Índice do símbolo na leitura de ticks (cria se não existe)
int TickSimboloIdx(string simbolo)
  {
   for(int i = 0; i < ArraySize(g_tick_sim); i++)
      if(g_tick_sim[i] == simbolo) return i;
   int n = ArraySize(g_tick_sim);
   ArrayResize(g_tick_sim, n + 1);
   ArrayResize(g_tick_msc, n + 1);
   ArrayResize(g_tick_vp, n + 1);
   ArrayResize(g_tick_atras, n + 1);
   SymbolSelect(simbolo, true);   // CopyTicks precisa do símbolo na Observação do Mercado
   g_tick_sim[n]   = simbolo;
   g_tick_msc[n]   = 0;
   g_tick_vp[n]    = ValorPonto(simbolo);
   g_tick_atras[n] = false;
   LogValorPonto(simbolo);
   return n;
  }

// Volta a leitura de ticks do símbolo até desde_msc (replay idempotente: max/min não mudam
// com tick repetido). desde_msc <= 0 = a partir do tick corrente.
void RebasearTicks(int s, long desde_msc)
  {
   if(s < 0) return;
   if(desde_msc <= 0)
     {
      MqlTick t;
      desde_msc = (SymbolInfoTick(g_tick_sim[s], t) ? t.time_msc : MscServidor());
     }
   if(g_tick_msc[s] == 0 || g_tick_msc[s] > desde_msc)
     {
      g_tick_msc[s]   = desde_msc;
      g_tick_atras[s] = true;   // até o LerTicks alcançar o presente (a lacuna pode levar várias amostras)
     }
  }

//--- GlobalVariables: DR_<posicao>_<ciclo>_{mfe,mae,mfe_t,mae_t,t,p}. Sobrevivem a reinício do
//--- EA/terminal (o MT5 guarda em disco); nome curto porque o limite é 63 caracteres.
//--- t = até onde (time_msc) os ticks foram aplicados; p = 1 se a medição já era parcial.
string GvNome(ulong posicao_id, int ciclo, string campo)
  {
   return StringFormat("%s%I64u_%d_%s", GV_PREFIXO, posicao_id, ciclo, campo);
  }

bool LerGv(Excursao &e)
  {
   string n = GvNome(e.posicao_id, e.ciclo, "mfe");
   if(!GlobalVariableCheck(n)) return false;
   e.mfe     = GlobalVariableGet(n);
   e.mae     = GlobalVariableGet(GvNome(e.posicao_id, e.ciclo, "mae"));
   e.mfe_msc = (long)GlobalVariableGet(GvNome(e.posicao_id, e.ciclo, "mfe_t"));
   e.mae_msc = (long)GlobalVariableGet(GvNome(e.posicao_id, e.ciclo, "mae_t"));
   e.parcial = (GlobalVariableGet(GvNome(e.posicao_id, e.ciclo, "p")) > 0.5);   // ausente = 0 = completa
   if(e.mfe < 0) e.mfe = 0;
   if(e.mae > 0) e.mae = 0;
   return true;
  }

void GravarGv(Excursao &e)
  {
   GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "mfe"),   e.mfe);
   GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "mae"),   e.mae);
   GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "mfe_t"), (double)e.mfe_msc);
   GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "mae_t"), (double)e.mae_msc);
   // até onde os ticks foram aplicados e se a medição é parcial: o próximo init continua daqui
   // (reaplica a lacuna pela base de ticks) sem esquecer que o começo não foi visto
   if(e.sim_idx >= 0) GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "t"), (double)g_tick_msc[e.sim_idx]);
   GlobalVariableSet(GvNome(e.posicao_id, e.ciclo, "p"), (e.parcial ? 1.0 : 0.0));
   e.gv_sujo = false;
   e.gv_ms   = GetTickCount64();
  }

void ApagarGv(ulong posicao_id, int ciclo)
  {
   GlobalVariableDel(GvNome(posicao_id, ciclo, "mfe"));
   GlobalVariableDel(GvNome(posicao_id, ciclo, "mae"));
   GlobalVariableDel(GvNome(posicao_id, ciclo, "mfe_t"));
   GlobalVariableDel(GvNome(posicao_id, ciclo, "mae_t"));
   GlobalVariableDel(GvNome(posicao_id, ciclo, "t"));
   GlobalVariableDel(GvNome(posicao_id, ciclo, "p"));
  }

// Uma gravação por amostra quando houve extremo novo, e pelo menos uma por segundo para o "t"
// (até onde os ticks foram aplicados) não envelhecer. todas = grava tudo (deinit).
void GravarGvSujas(bool todas = false)
  {
   ulong agora = GetTickCount64();
   for(int i = 0; i < ArraySize(g_exc); i++)
      if(todas || g_exc[i].gv_sujo || agora - g_exc[i].gv_ms >= 1000) GravarGv(g_exc[i]);
  }

// GV de posição que fechou enquanto o EA estava fora (ou de ciclo antigo)
void LimparGvOrfas()
  {
   int apagadas = 0;
   for(int i = GlobalVariablesTotal() - 1; i >= 0; i--)
     {
      string nome = GlobalVariableName(i);
      if(StringFind(nome, GV_PREFIXO) != 0) continue;
      string partes[];
      if(StringSplit(nome, '_', partes) < 4) continue;
      ulong pos   = (ulong)StringToInteger(partes[1]);
      int   ciclo = (int)StringToInteger(partes[2]);
      int   k     = ProcurarExc(pos);
      if(k >= 0 && g_exc[k].ciclo == ciclo) continue;
      GlobalVariableDel(nome);
      apagadas++;
     }
   if(apagadas > 0) Log(StringFormat("%d GlobalVariables órfãs apagadas", apagadas));
  }

// Reconstrói o ciclo corrente da posição pelos deals dela (HistorySelectByPosition troca o
// cache de histórico: quem chamou reseleciona o que precisar). ate_deal > 0 devolve o estado
// ANTES daquele deal (usado na semeadura do dia). vivo = volume ainda aberto.
bool LerPosicaoDoHistorico(ulong posicao_id, ulong ate_deal, Excursao &e, double &vivo)
  {
   vivo = 0;
   if(!HistorySelectByPosition((long)posicao_id)) return false;
   double soma_pv = 0;
   bool   magic_ok = false;
   int n = HistoryDealsTotal();
   for(int k = 0; k < n; k++)
     {
      ulong t = HistoryDealGetTicket(k);
      if(t == 0) continue;
      if(ate_deal > 0 && t == ate_deal) break;
      long tipo = HistoryDealGetInteger(t, DEAL_TYPE);
      if(tipo != DEAL_TYPE_BUY && tipo != DEAL_TYPE_SELL) continue;
      long   entry = HistoryDealGetInteger(t, DEAL_ENTRY);
      double v     = HistoryDealGetDouble(t, DEAL_VOLUME);
      double p     = HistoryDealGetDouble(t, DEAL_PRICE);
      if(!magic_ok)
        {
         // o magic da posição é o da abertura (fechamento manual vem com magic 0)
         e.magic   = HistoryDealGetInteger(t, DEAL_MAGIC);
         e.simbolo = HistoryDealGetString(t, DEAL_SYMBOL);
         magic_ok  = true;
        }
      if(entry == DEAL_ENTRY_IN)
        {
         if(e.vol_entradas <= 0)
           {
            e.lado = (tipo == DEAL_TYPE_BUY ? 0 : 1);
            e.abertura_msc = HistoryDealGetInteger(t, DEAL_TIME_MSC);
           }
         vivo += v;
         e.vol_entradas += v;
         soma_pv += p * v;
         e.preco_abertura = soma_pv / e.vol_entradas;
        }
      else if(entry == DEAL_ENTRY_INOUT)
        {
         // reversão: o que sobrou abre o ciclo seguinte no sentido oposto
         double novo = v - vivo;
         if(novo < 0) novo = 0;
         e.ciclo++;
         vivo = novo;
         e.vol_entradas = novo;
         soma_pv = p * novo;
         e.preco_abertura = p;
         e.lado = (tipo == DEAL_TYPE_BUY ? 0 : 1);
         e.abertura_msc = HistoryDealGetInteger(t, DEAL_TIME_MSC);
        }
      else
        {
         vivo -= v;
         if(vivo < 0) vivo = 0;
        }
     }
   return (e.vol_entradas > 0);
  }

// Começa a acompanhar uma posição. restaurada = já existia antes do EA subir: tenta continuar
// das GV; sem GV fica parcial. Devolve o índice em g_exc ou -1.
int CriarExcursao(ulong posicao_id, bool restaurada)
  {
   Excursao e;
   ZerarExcursao(e);
   double vivo = 0;
   if(!LerPosicaoDoHistorico(posicao_id, 0, e, vivo))
     {
      // sem deal no cache: usa a posição selecionada (o chamador acabou de selecionar, ou
      // o ticket ainda é o identificador, como em toda posição sem reversão)
      if(PositionGetInteger(POSITION_IDENTIFIER) != (long)posicao_id && !PositionSelectByTicket(posicao_id))
         return -1;
      ZerarExcursao(e);
      e.simbolo        = PositionGetString(POSITION_SYMBOL);
      e.magic          = PositionGetInteger(POSITION_MAGIC);
      e.lado           = (int)PositionGetInteger(POSITION_TYPE);
      e.preco_abertura = PositionGetDouble(POSITION_PRICE_OPEN);
      e.vol_entradas   = PositionGetDouble(POSITION_VOLUME);
      e.abertura_msc   = PositionGetInteger(POSITION_TIME_MSC);
      vivo             = e.vol_entradas;
     }
   if(e.vol_entradas <= 0 || e.simbolo == "") return -1;

   e.posicao_id = posicao_id;
   e.vol_viva   = vivo;
   e.sim_idx    = TickSimboloIdx(e.simbolo);
   LembrarSimbolo(e.simbolo);

   // aberta antes do init também conta como restaurada (o EA não viu o começo)
   if(e.abertura_msc < g_inicio_msc) restaurada = true;
   bool com_gv = false;
   if(restaurada)
     {
      com_gv = LerGv(e);          // com GV continua de onde parou (e lembra se já era parcial)
      if(!com_gv) e.parcial = true;
     }

   int n = ArraySize(g_exc);
   ArrayResize(g_exc, n + 1);
   g_exc[n] = e;

   // Ticks desde a abertura: posição nova pega o que passou entre o deal e esta amostra;
   // restaurada sem GV (ou parcial) tenta recuperar o MFE/MAE pela base de ticks do terminal.
   // Com GV completa, reaplica só a lacuna desde a última gravação (recompilação, troca de
   // parâmetro, reinício do terminal): o replay é idempotente e a lacuna está na base de ticks.
   long desde = e.abertura_msc;
   if(com_gv && !e.parcial)
     {
      long gv_t = (long)GlobalVariableGet(GvNome(e.posicao_id, e.ciclo, "t"));
      desde = (gv_t > 0 ? gv_t : 0);
      if(gv_t > 0 && gv_t < g_inicio_msc) g_inicio_msc = gv_t;   // MEP/MEN também reconstroem a lacuna
     }
   RebasearTicks(e.sim_idx, desde);

   Log(StringFormat("posição %I64u ciclo %d %s %s: acompanhando desde %s (%s)",
                    posicao_id, e.ciclo, e.simbolo, (e.lado == 0 ? "compra" : "venda"),
                    Num(e.preco_abertura, DigitosDe(e.simbolo)),
                    (!restaurada ? "nova"
                     : (!com_gv ? "restaurada sem GV, parcial"
                        : (e.parcial ? "restaurada das GV, parcial" : "restaurada das GV")))));
   return n;
  }

int ProcurarExp(long magic, bool criar)
  {
   for(int x = 0; x < ArraySize(g_exp); x++)
      if(g_exp[x].magic == magic) return x;
   if(!criar) return -1;
   int n = ArraySize(g_exp);
   ArrayResize(g_exp, n + 1);
   ExposicaoDia z;
   ZeroMemory(z);
   z.magic  = magic;
   z.dia    = g_dia;
   // o magic tem regra do servidor (item no ping, mesmo que só com nulos): o dia inteiro sai filtrado e
   // o item leva a versão da regra. Magic fora da lista (não mapeado, ou servidor antigo) sai como na 1.1.0
   z.regras = (ProcurarRegra(magic) >= 0);
   g_exp[n] = z;
   return n;
  }

// Recalcula o saldo do magic (realizado do dia + flutuante por contrato) e os extremos
void AtualizarExposicao(long magic, long msc)
  {
   int x = ProcurarExp(magic, true);
   double flut = 0;
   for(int i = 0; i < ArraySize(g_exc); i++)
     {
      if(g_exc[i].magic != magic || g_exc[i].sumiu_ms != 0 || g_exc[i].vol_entradas <= 0) continue;
      // ainda em replay de ticks anteriores ao init (restaurada sem GV): o "atual" é de um preço
      // antigo e misturaria passado com presente no saldo do magic
      if(g_exc[i].ultimo_msc > 0 && g_exc[i].ultimo_msc < g_inicio_msc) continue;
      // regras públicas: aberta antes da hora mínima nunca entra; o flutuante (e a saída parcial que
      // ficou pendente) só entra depois que a posição completou a duração mínima (a "fantasma" que
      // fecha em milissegundos nunca entra)
      if(!RegraConta(g_exc[i].magic, g_exc[i].abertura_msc, g_exc[i].ultimo_msc)) continue;
      if(g_exc[i].pend_pc != 0)
        {
         g_exp[x].realizado_pc += g_exc[i].pend_pc;
         g_exc[i].real_pc      += g_exc[i].pend_pc;
         g_exc[i].pend_pc       = 0;
        }
      // saída parcial: o que já realizou saiu do flutuante na mesma proporção
      flut += g_exc[i].atual * g_tick_vp[g_exc[i].sim_idx] * (g_exc[i].vol_viva / g_exc[i].vol_entradas);
     }
   g_exp[x].flut_pc = flut;
   double saldo = g_exp[x].realizado_pc + flut;
   AmostrarSaldo(x, saldo, msc);   // série do saldo: o mesmo valor que decide o MEP/MEN, no balde do instante do tick/deal
   if(saldo > g_exp[x].mep)
     {
      g_exp[x].mep     = saldo;
      g_exp[x].mep_msc = msc;
      g_exp[x].mep_n   = g_exp[x].n_saidas;
     }
   if(saldo < g_exp[x].men)
     {
      g_exp[x].men     = saldo;
      g_exp[x].men_msc = msc;
      g_exp[x].men_n   = g_exp[x].n_saidas;
     }
  }

//+------------------------------------------------------------------+
//| Série do saldo do dia (baldes)                                   |
//+------------------------------------------------------------------+
// O site desenha a curva real do dia do robô com o saldo público do magic (realizado do dia + flutuante
// por contrato, regras públicas aplicadas): é o MESMO valor que o AtualizarExposicao acaba de calcular
// pro MEP/MEN, nunca recalculado aqui. Cada valor entra no balde do INSTANTE da amostra (o time_msc do
// tick, o do deal, ou o relógio do servidor na amostra "agora" do Medir()), intervalo de g_balde_seg
// segundos com t0 múltiplo de g_balde_seg: a cada tick (AtualizarExposicao) e uma vez por Medir()
// (AmostrarSaldos, pra série seguir contínua quando o símbolo fica sem tick e pro balde fechar na hora
// certa). É o instante do tick, não o relógio na hora de processar: o Medir() fica travado pelo
// WebRequest do heartbeat (0,2 s a vários segundos sem rede) e depois lê os ticks acumulados de uma vez;
// cada um cai no seu balde, não todos no de agora. A série de um magic só anda pra frente: amostra com
// instante anterior ao balde corrente (tick atrasado, deal rebobinado, relógio do servidor que recuou na
// reconexão) entra no corrente, nunca reabre um fechado (t0 repetido na fila nunca). Quando a amostra
// passa pro balde seguinte, o corrente vai pra fila circular g_baldes (BALDES_MAX, compartilhada pelos
// magics; cheia descarta o mais antigo e loga uma vez por episódio) e o heartbeat leva a fila em
// "saldo_dia" (o corrente não vai; SaldoDiaJson respeita os tetos do servidor): 2xx tira da fila, falha
// deixa (o próximo heartbeat reenvia; o banco faz upsert por (magic, t0)). Rede só no slot do heartbeat.
// Virada do dia zera balde corrente e fila; init também (a fila não vai a disco). Regras que mudam com o
// dia em andamento refazem o MEP/MEN (AplicarRegrasNovas) e zeram balde corrente e fila: o servidor apaga
// os baldes do dia já gravados quando vê a versão nova, e o que sai daqui em diante é da regra nova.
// Replay de ticks anteriores ao init (posição restaurada sem GV) não entra, como não entra no MEP/MEN; a
// lacuna das GV (reinício com posição aberta), que o MEP/MEN reconstrói, gera os baldes da lacuna com o
// instante de cada tick. Enquanto algum símbolo do magic ainda está em replay (g_tick_atras: LerTicks
// pagina TICKS_PAGINAS_MAX páginas por Medir(), 1 h de WIN leva algumas amostras) ou alguma posição viva
// ainda não tem tick de hoje aplicado, a amostra "agora" espera (SaldoEmReplay): senão abriria o balde
// corrente com um flutuante do meio da lacuna e o resto do replay colapsaria nele.

long BaldeT0(datetime instante)
  {
   return ((long)instante / g_balde_seg) * g_balde_seg;
  }

// Empurra o balde corrente do magic x pra fila de envio e esvazia (bal_t0 fica: é o piso do próximo)
void FecharBalde(int x)
  {
   if(g_exp[x].bal_n == 0) return;
   if(g_baldes_n >= BALDES_MAX)
     {
      g_baldes_ini = (g_baldes_ini + 1) % BALDES_MAX;
      g_baldes_n--;
      if(!g_baldes_perda_avisada)
        {
         int n_magics = 0;
         for(int y = 0; y < ArraySize(g_exp); y++)
            if(g_exp[y].dia == g_dia) n_magics++;
         if(n_magics < 1) n_magics = 1;
         Log(StringFormat("série do saldo: fila de %d baldes cheia (%d magics medindo: ~%d s sem heartbeat aceito); descarto o mais antigo até a fila esvaziar",
                          BALDES_MAX, n_magics, BALDES_MAX * g_balde_seg / n_magics));
         g_baldes_perda_avisada = true;
        }
     }
   int k = (g_baldes_ini + g_baldes_n) % BALDES_MAX;
   g_baldes[k].magic  = g_exp[x].magic;
   g_baldes[k].t0     = g_exp[x].bal_t0;
   g_baldes[k].minimo = g_exp[x].bal_min;
   g_baldes[k].maximo = g_exp[x].bal_max;
   g_baldes[k].ultimo = g_exp[x].bal_ult;
   g_baldes[k].regras = g_exp[x].regras;
   g_baldes_n++;
   g_exp[x].bal_n = 0;
  }

// Um saldo do magic x medido no instante msc (ms do relógio do servidor) entra no balde desse instante;
// balde virado vai pra fila. A série nunca volta: instante anterior ao balde corrente fica no corrente
// e, com o corrente já fechado, abre o seguinte (relógio que recua ou tick atrasado nunca repete t0).
void AmostrarSaldo(int x, double saldo, long msc)
  {
   long t0 = BaldeT0((datetime)(msc / 1000));
   if(t0 <= 0) return;   // sem instante (relógio do servidor ainda zerado)
   if(g_exp[x].bal_n > 0)
     {
      if(t0 < g_exp[x].bal_t0)      t0 = g_exp[x].bal_t0;
      else if(t0 > g_exp[x].bal_t0) FecharBalde(x);
     }
   else if(g_exp[x].bal_t0 > 0 && t0 <= g_exp[x].bal_t0)
      t0 = g_exp[x].bal_t0 + g_balde_seg;
   if(g_exp[x].bal_n == 0)
     {
      g_exp[x].bal_t0  = t0;
      g_exp[x].bal_min = saldo;
      g_exp[x].bal_max = saldo;
     }
   else
     {
      if(saldo < g_exp[x].bal_min) g_exp[x].bal_min = saldo;
      if(saldo > g_exp[x].bal_max) g_exp[x].bal_max = saldo;
     }
   g_exp[x].bal_ult = saldo;
   g_exp[x].bal_n++;
  }

// O flut_pc do magic ainda não é o de agora: alguma posição viva sem tick de hoje aplicado (replay de
// restaurada sem GV, ou símbolo sem tick desde o init) ou com o símbolo ainda em replay paginado (lacuna
// das GV, g_tick_atras). A amostra "agora" do Medir() espera; os ticks do replay já geram os baldes deles.
bool SaldoEmReplay(long magic)
  {
   for(int i = 0; i < ArraySize(g_exc); i++)
     {
      if(g_exc[i].magic != magic || g_exc[i].sumiu_ms != 0 || g_exc[i].vol_entradas <= 0) continue;
      if(g_exc[i].ultimo_msc == 0 || g_exc[i].ultimo_msc < g_inicio_msc) return true;
      if(g_exc[i].sim_idx >= 0 && g_exc[i].sim_idx < ArraySize(g_tick_atras) && g_tick_atras[g_exc[i].sim_idx]) return true;
     }
   return false;
  }

// Uma amostra por Medir() de cada magic com exposição do dia, no instante de agora, com o último saldo
// calculado (realizado + flut_pc, o mesmo do MEP/MEN): a série segue sem tick e o balde vencido fecha na
// hora. Roda depois do LerTicks: os ticks lidos já fecharam os baldes deles, em ordem, e esta vem por último
void AmostrarSaldos()
  {
   long agora = MscServidor();
   for(int x = 0; x < ArraySize(g_exp); x++)
     {
      if(g_exp[x].dia != g_dia) continue;
      if(SaldoEmReplay(g_exp[x].magic)) continue;
      AmostrarSaldo(x, g_exp[x].realizado_pc + g_exp[x].flut_pc, agora);
     }
  }

void ZerarBaldes(string motivo)
  {
   if(g_baldes_n > 0)
      Log(StringFormat("série do saldo: %d baldes não enviados descartados (%s)", g_baldes_n, motivo));
   g_baldes_ini = 0;
   g_baldes_n   = 0;
   g_baldes_enviando = 0;
   g_baldes_perda_avisada = false;
  }

// Heartbeat aceito (2xx): os baldes que foram nele saem da fila
void MarcarBaldesEnviados()
  {
   int n = MathMin(g_baldes_enviando, g_baldes_n);
   g_baldes_ini = (g_baldes_ini + n) % BALDES_MAX;
   g_baldes_n  -= n;
   g_baldes_enviando = 0;
   if(g_baldes_n == 0) g_baldes_perda_avisada = false;
  }

// Um preço num instante, pra excursão i
void AplicarPreco(int i, double px, long msc)
  {
   if(px <= 0) return;
   double exc = (g_exc[i].lado == 0 ? px - g_exc[i].preco_abertura : g_exc[i].preco_abertura - px);
   g_exc[i].atual      = exc;
   g_exc[i].ultimo_msc = msc;
   if(exc > g_exc[i].mfe)
     {
      g_exc[i].mfe     = exc;
      g_exc[i].mfe_msc = msc;
      g_exc[i].gv_sujo = true;
     }
   if(exc < g_exc[i].mae)
     {
      g_exc[i].mae     = exc;
      g_exc[i].mae_msc = msc;
      g_exc[i].gv_sujo = true;
     }
   if(msc >= g_inicio_msc) AtualizarExposicao(g_exc[i].magic, msc);
  }

// Um tick do símbolo s em todas as posições vivas dele
void AplicarTick(int s, const MqlTick &t)
  {
   int n = ArraySize(g_exc);
   for(int i = 0; i < n; i++)
     {
      if(g_exc[i].sim_idx != s) continue;
      if(g_exc[i].sumiu_ms != 0 && g_exc[i].fim_msc == 0) continue;   // sumiu sem deal ainda
      if(t.time_msc < g_exc[i].abertura_msc) continue;
      if(g_exc[i].fim_msc > 0 && t.time_msc > g_exc[i].fim_msc) continue;
      // índice/dólar: último negócio; sem "last" usa o lado que fecharia a posição
      double px = (t.last > 0 ? t.last : (g_exc[i].lado == 0 ? t.bid : t.ask));
      AplicarPreco(i, px, t.time_msc);
     }
  }

// Ticks novos do símbolo s desde g_tick_msc[s] (inclusive: repetido é inofensivo)
void LerTicks(int s)
  {
   if(g_tick_msc[s] == 0) return;
   string sim = g_tick_sim[s];
   // valor por ponto que veio 0 no cadastro (símbolo recém-posto na Observação do Mercado, ainda
   // sem sincronizar): tenta de novo a cada amostra, senão o flutuante do símbolo some do MEP/MEN
   if(g_tick_vp[s] <= 0)
     {
      g_tick_vp[s] = ValorPonto(sim);
      if(g_tick_vp[s] > 0) LogValorPonto(sim);
     }
   for(int pag = 0; pag < TICKS_PAGINAS_MAX; pag++)
     {
      ResetLastError();
      int n = CopyTicks(sim, g_ticks, COPY_TICKS_ALL, (ulong)g_tick_msc[s], (uint)TICKS_PAGINA);
      if(n < 0)
        {
         // -1: base de ticks ainda sincronizando; usa o tick corrente pra não ficar cego, mas NÃO
         // avança o ponteiro: a próxima amostra tenta o replay de novo (tick repetido é inofensivo)
         MqlTick t;
         if(SymbolInfoTick(sim, t) && t.time_msc >= g_tick_msc[s]) AplicarTick(s, t);
         return;
        }
      for(int k = 0; k < n; k++) AplicarTick(s, g_ticks[k]);
      if(n > 0) g_tick_msc[s] = g_ticks[n - 1].time_msc;
      if(n < TICKS_PAGINA)
        {
         g_tick_atras[s] = false;   // página curta: alcançou o presente
         return;
        }
     }
   g_tick_atras[s] = true;   // saiu com a última página cheia: ainda há lacuna, continua na próxima amostra
  }

// Casa g_exc com o PositionsTotal (por POSITION_IDENTIFIER). Posição que apareceu antes do
// DEAL_ADD chegar entra aqui; posição que sumiu espera SUMIDA_MS pelo deal e depois sai.
void SincronizarPosicoes()
  {
   for(int i = 0; i < ArraySize(g_exc); i++) g_exc[i].visto = false;
   ulong agora = GetTickCount64();

   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      ulong pos = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
      int k = ProcurarExc(pos);
      if(k < 0)
        {
         k = CriarExcursao(pos, false);
         if(k < 0) continue;
        }
      g_exc[k].visto = true;
      if(g_exc[k].fim_msc == 0 && (int)PositionGetInteger(POSITION_TYPE) != g_exc[k].lado)
        {
         // o terminal já mostra a posição virada (reversão), mas o DEAL_ADD ainda não chegou: congela
         // (AplicarTick pula sumida sem deal) pro tick desse intervalo não entrar no ciclo que fecha
         // com o sinal errado; o DealAntes rebobina e fecha o ciclo com o preço da reversão
         if(g_exc[k].sumiu_ms == 0) g_exc[k].sumiu_ms = agora;
         else if(agora - g_exc[k].sumiu_ms >= SUMIDA_MS)
           {
            // o deal nunca chegou (rede de segurança): abre o ciclo novo pelo histórico
            Log(StringFormat("posição %I64u virou de lado e o deal não chegou em %d s; ciclo refeito pelo histórico",
                             pos, SUMIDA_MS / 1000));
            if(!RecriarCiclo(k)) g_exc[k].sumiu_ms = agora;   // histórico ainda sem a reversão: espera mais
           }
         continue;
        }
      if(g_exc[k].fim_msc > 0)
        {
         // já fechou pelo deal; o terminal só não atualizou ainda. Se continuar
         // aparecendo por 5 s, o deal não fechou tudo: volta a viver.
         if(agora - g_exc[k].sumiu_ms < 5000) continue;
         g_exc[k].fim_msc = 0;
         Log(StringFormat("posição %I64u segue aberta depois da saída; volta a medir", pos));
        }
      g_exc[k].sumiu_ms = 0;
      g_exc[k].vol_viva = PositionGetDouble(POSITION_VOLUME);
     }

   for(int i = ArraySize(g_exc) - 1; i >= 0; i--)
     {
      if(g_exc[i].visto) continue;
      if(g_exc[i].sumiu_ms == 0)
        {
         g_exc[i].sumiu_ms = agora;   // o DEAL_ADD pode chegar depois: espera
         continue;
        }
      if(agora - g_exc[i].sumiu_ms < SUMIDA_MS) continue;
      ApagarGv(g_exc[i].posicao_id, g_exc[i].ciclo);
      RemoverExcursao(i);
     }

   // símbolo sem posição nenhuma (viva ou esperando deal): para de ler ticks
   for(int s = 0; s < ArraySize(g_tick_sim); s++)
     {
      if(g_tick_msc[s] == 0) continue;
      bool usado = false;
      for(int i = 0; i < ArraySize(g_exc); i++)
         if(g_exc[i].sim_idx == s) { usado = true; break; }
      if(!usado)
        {
         g_tick_msc[s]   = 0;
         g_tick_atras[s] = false;
        }
     }
  }

// Roda a cada InpAmostraMs. Só memória: nada de rede aqui.
void Medir()
  {
   int dia = DiaServidor();
   if(dia != g_dia)
     {
      // MEP/MEN e a série do saldo são do dia; posição que virou a noite continua em g_exc
      bool primeiro = (g_dia == 0);
      ArrayResize(g_exp, 0);      // leva junto o balde corrente de cada magic
      ZerarBaldes("virada do dia");
      for(int i = 0; i < ArraySize(g_exc); i++)
        {
         g_exc[i].real_pc = 0;   // o realizado (e a parcial pendente) são do dia
         g_exc[i].pend_pc = 0;
        }
      g_dia = dia;
      if(primeiro) SemearDia();   // EA subiu sem conexão e só agora sabe o dia
      else
        {
         Log("novo dia no servidor: MEP/MEN e série do saldo zerados; regras do servidor de novo no próximo slot de rede");
         g_regras_prox_ms = GetTickCount64();   // rede só no slot do heartbeat (WebRequest é síncrono)
        }
     }
   SincronizarPosicoes();
   for(int s = 0; s < ArraySize(g_tick_sim); s++)
      LerTicks(s);
   AmostrarSaldos();   // série do saldo: uma amostra por magic com o saldo recém-calculado; fecha balde vencido
   GravarGvSujas();
  }

//+------------------------------------------------------------------+
//| Excursões: init                                                  |
//+------------------------------------------------------------------+
// Posições já abertas quando o EA sobe
void RestaurarExcursoes()
  {
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      ulong pos = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
      if(ProcurarExc(pos) >= 0) continue;
      CriarExcursao(pos, true);
     }
   LimparGvOrfas();
  }

// Saídas de hoje que já aconteceram antes do EA subir entram no realizado do magic, e o dia
// fica marcado como parcial (o caminho tick a tick até aqui não foi visto).
void SemearDia()
  {
   g_dia = DiaServidor();
   if(g_dia == 0)
     {
      Log("sem hora do servidor ainda; semeadura do dia fica pra primeira amostra");
      return;
     }
   datetime ini = (datetime)((long)g_dia * 86400);
   if(!HistorySelect(ini, TimeCurrent() + 86400))
     {
      Log("SemearDia: HistorySelect falhou");
      return;
     }

   // lista antes, porque cada HistorySelectByPosition troca o cache
   ulong saidas[];
   ArrayResize(saidas, 0);
   int n = HistoryDealsTotal();
   for(int k = 0; k < n; k++)
     {
      ulong t = HistoryDealGetTicket(k);
      if(t == 0) continue;
      if((datetime)HistoryDealGetInteger(t, DEAL_TIME) < ini) continue;
      long tipo = HistoryDealGetInteger(t, DEAL_TYPE);
      if(tipo != DEAL_TYPE_BUY && tipo != DEAL_TYPE_SELL) continue;
      if(HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_IN) continue;
      int m = ArraySize(saidas);
      ArrayResize(saidas, m + 1);
      saidas[m] = t;
     }

   // agrupa por ciclo (operação do site): as regras públicas valem por ciclo, e a duração só se
   // conhece na saída que o fecha
   CicloSemente cs[];
   ArrayResize(cs, 0);
   int contadas = 0;
   for(int k = 0; k < ArraySize(saidas); k++)
     {
      ulong t = saidas[k];
      if(!HistoryDealSelect(t)) continue;
      ulong  pos      = (ulong)HistoryDealGetInteger(t, DEAL_POSITION_ID);
      double lucro    = HistoryDealGetDouble(t, DEAL_PROFIT);
      double vol      = HistoryDealGetDouble(t, DEAL_VOLUME);
      long   magic    = HistoryDealGetInteger(t, DEAL_MAGIC);
      long   msc      = HistoryDealGetInteger(t, DEAL_TIME_MSC);
      bool   fecha    = (HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_INOUT);
      int    ciclo    = 1;
      long   abertura = 0;
      Excursao e;
      ZerarExcursao(e);
      double vivo = 0;
      if(LerPosicaoDoHistorico(pos, t, e, vivo))
        {
         // vivo = volume aberto ANTES deste deal: a saída fecha o ciclo se zera o que havia
         if(!fecha) fecha = (vivo - vol <= 0.0000001);
         vol      = e.vol_entradas;   // por 1 contrato da posição, como o site
         magic    = e.magic;
         ciclo    = e.ciclo;
         abertura = e.abertura_msc;   // primeiro deal in do ciclo (ou a reversão que o abriu)
        }
      else
         fecha = true;             // sem o histórico da posição não dá pra saber: conta
      if(vol <= 0) continue;
      int c = -1;
      for(int j = 0; j < ArraySize(cs); j++)
         if(cs[j].pos == pos && cs[j].ciclo == ciclo) { c = j; break; }
      if(c < 0)
        {
         c = ArraySize(cs);
         ArrayResize(cs, c + 1);
         cs[c].pos          = pos;
         cs[c].ciclo        = ciclo;
         cs[c].magic        = magic;
         cs[c].lucro_pc     = 0;
         cs[c].abertura_msc = abertura;
         cs[c].fim_msc      = 0;
         cs[c].fechado      = false;
        }
      cs[c].lucro_pc += lucro / vol;
      if(msc > cs[c].fim_msc) cs[c].fim_msc = msc;
      if(fecha) cs[c].fechado = true;
      if(t > g_ultimo_deal_contab) g_ultimo_deal_contab = t;
      contadas++;
     }

   // realizado e n_saidas por ciclo (ciclos fechados = operações do site, não deals), com as regras
   // públicas: ciclo ainda aberto só passa pela hora; a duração é a do site (entrada -> última saída)
   int fora = 0;
   int sem_abertura = 0;
   for(int c = 0; c < ArraySize(cs); c++)
     {
      int x = ProcurarExp(cs[c].magic, true);   // magic com saída hoje tem linha, mesmo que tudo fique fora
      int r = ProcurarRegra(cs[c].magic);
      // ciclo ainda aberto (saída parcial): a posição viva lembra quanto dele entrou no realizado,
      // pra devolver se fechar curto demais
      int kv = -1;
      if(!cs[c].fechado)
        {
         kv = ProcurarExc(cs[c].pos);
         if(kv >= 0 && g_exc[kv].ciclo != cs[c].ciclo) kv = -1;
        }
      if(kv >= 0)
        {
         g_exc[kv].real_pc = 0;
         g_exc[kv].pend_pc = 0;
        }
      if(!RegraConta(cs[c].magic, cs[c].abertura_msc, (cs[c].fechado ? cs[c].fim_msc : 0)))
        {
         fora++;
         if(r >= 0 && cs[c].abertura_msc <= 0)
           {
            // regra sem abertura conhecida: fica de fora e o dia do magic vira parcial (não dá pra
            // saber se o site mostra esse ciclo)
            sem_abertura++;
            g_exp[x].parcial = true;
           }
         continue;
        }
      if(!cs[c].fechado && kv >= 0 && r >= 0 && !RegraDuracaoOk(r, cs[c].abertura_msc, MscServidor()))
         g_exc[kv].pend_pc = cs[c].lucro_pc;   // saída parcial de posição ainda nova: entra quando ela completar a duração mínima
      else
        {
         g_exp[x].realizado_pc += cs[c].lucro_pc;
         if(kv >= 0) g_exc[kv].real_pc = cs[c].lucro_pc;
        }
      if(cs[c].fechado) g_exp[x].n_saidas++;
      g_exp[x].parcial = true;   // o caminho tick a tick desse ciclo não foi visto
     }

   // o caminho até aqui é desconhecido: os extremos partem do que se sabe (0 e o realizado)
   for(int x = 0; x < ArraySize(g_exp); x++)
     {
      g_exp[x].mep   = MathMax(0.0, g_exp[x].realizado_pc);
      g_exp[x].men   = MathMin(0.0, g_exp[x].realizado_pc);
      g_exp[x].mep_n = g_exp[x].n_saidas;
      g_exp[x].men_n = g_exp[x].n_saidas;
     }
   // posição restaurada sem medição completa também deixa o dia do magic parcial
   for(int i = 0; i < ArraySize(g_exc); i++)
      if(g_exc[i].parcial)
        {
         int x = ProcurarExp(g_exc[i].magic, true);
         g_exp[x].parcial = true;
        }

   if(contadas > 0 || ArraySize(g_exp) > 0)
      Log(StringFormat("dia %s semeado: %d saídas de hoje em %d ciclos e %d magics, %d ciclos fora pelas regras públicas (%d sem abertura conhecida)%s",
                       DiaIso(g_dia), contadas, ArraySize(cs), ArraySize(g_exp), fora, sem_abertura,
                       (g_regras_ok ? "" : " (sem regras do servidor: como na 1.1.0)")));
  }

//+------------------------------------------------------------------+
//| Excursões: deals                                                 |
//+------------------------------------------------------------------+
// Antes de enviar o deal: entrada cria/atualiza o ciclo; saída/reversão fecha a conta do
// ciclo corrente (preço de saída é o último ponto da excursão; realizado do magic soma).
void DealAntes(ulong ticket)
  {
   ulong  pos   = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
   long   entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
   double v     = HistoryDealGetDouble(ticket, DEAL_VOLUME);
   double preco = HistoryDealGetDouble(ticket, DEAL_PRICE);
   double lucro = HistoryDealGetDouble(ticket, DEAL_PROFIT);
   long   magic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
   long   msc   = HistoryDealGetInteger(ticket, DEAL_TIME_MSC);
   if(pos == 0) return;

   int k = ProcurarExc(pos);
   if(entry == DEAL_ENTRY_IN)
     {
      if(k < 0)
         CriarExcursao(pos, false);
      else
        {
         // entrada adicional: preço médio e volume do ciclo vêm do histórico
         Excursao e;
         ZerarExcursao(e);
         double vivo = 0;
         if(LerPosicaoDoHistorico(pos, 0, e, vivo))
           {
            g_exc[k].preco_abertura = e.preco_abertura;
            g_exc[k].vol_entradas   = e.vol_entradas;
            g_exc[k].vol_viva       = vivo;
           }
        }
      HistoryDealSelect(ticket);   // o HistorySelectByPosition trocou o cache
      return;
     }

   // saída (out, out_by) ou reversão (inout)
   if(k < 0) k = CriarExcursao(pos, true);   // posição que o EA nunca viu: parcial
   double vol_norm    = v;
   bool   fecha_ciclo = true;                // sem excursão não dá pra saber: cada saída conta
   if(k >= 0)
     {
      // Ticks até a saída, com a posição viva, e o preço de saída como último ponto. Rebobina até o
      // último tick aplicado: o Medir() pode ter consumido ticks com a posição já fora do
      // PositionsTotal (ou virada) sem aplicá-los; max/min são idempotentes, reaplicar não custa
      g_exc[k].fim_msc  = msc;
      g_exc[k].sumiu_ms = 0;
      long desde = (g_exc[k].ultimo_msc > 0 ? g_exc[k].ultimo_msc : g_exc[k].abertura_msc);
      RebasearTicks(g_exc[k].sim_idx, desde);
      LerTicks(g_exc[k].sim_idx);
      AplicarPreco(k, preco, msc);
      magic = g_exc[k].magic;
      if(g_exc[k].vol_entradas > 0) vol_norm = g_exc[k].vol_entradas;
      if(entry == DEAL_ENTRY_INOUT)
         g_exc[k].vol_viva = 0;
      else
        {
         // volume vivo pelo histórico (este deal já está lá): o SincronizarPosicoes pode já ter
         // posto o POSITION_VOLUME reduzido em vol_viva, e subtrair de novo fecharia uma saída parcial
         Excursao h;
         ZerarExcursao(h);
         double vivo = 0;
         if(LerPosicaoDoHistorico(pos, 0, h, vivo) && h.ciclo == g_exc[k].ciclo)
            g_exc[k].vol_viva = vivo;
         else
            g_exc[k].vol_viva = MathMax(0.0, g_exc[k].vol_viva - v);
        }
      fecha_ciclo = (g_exc[k].vol_viva <= 0.0000001);
      if(fecha_ciclo)
        {
         g_exc[k].vol_viva = 0;
         g_exc[k].sumiu_ms = GetTickCount64();   // sai do flutuante já; some de vez em SUMIDA_MS
        }
      else
         g_exc[k].fim_msc = 0;                    // saída parcial: continua viva
      if(g_exc[k].gv_sujo) GravarGv(g_exc[k]);
     }

   // realizado do dia por contrato; o extremo é recalculado na hora. n_saidas conta CICLOS fechados
   // (operações do site), não deals: saída parcial em dois deals é uma operação e um custo só.
   // Regras públicas: ciclo aberto antes da hora mínima não entra; ciclo que fecha com duração menor
   // que a mínima não entra nem em n_saidas, e devolve o que saídas parciais dele já tinham somado;
   // saída parcial antes de a posição completar a duração mínima fica pendente (o AtualizarExposicao
   // promove quando ela completa); com regra e sem excursão (abertura desconhecida) não conta e o dia
   // do magic vira parcial
   if(ticket > g_ultimo_deal_contab && vol_norm > 0)
     {
      int    x        = ProcurarExp(magic, true);
      int    r        = ProcurarRegra(magic);
      long   abertura = (k >= 0 ? g_exc[k].abertura_msc : 0);
      double lucro_pc = lucro / vol_norm;
      bool   conta    = RegraConta(magic, abertura, (fecha_ciclo ? msc : 0));
      if(conta && !fecha_ciclo && k >= 0 && r >= 0 && !RegraDuracaoOk(r, abertura, msc))
         g_exc[k].pend_pc += lucro_pc;
      else if(conta)
        {
         double pend = (k >= 0 ? g_exc[k].pend_pc : 0);   // ciclo que fechou com a duração mínima leva o pendente junto
         g_exp[x].realizado_pc += lucro_pc + pend;
         if(k >= 0)
           {
            g_exc[k].real_pc += lucro_pc + pend;
            g_exc[k].pend_pc  = 0;
           }
         if(fecha_ciclo) g_exp[x].n_saidas++;
        }
      else
        {
         if(k >= 0)
           {
            if(g_exc[k].real_pc != 0) g_exp[x].realizado_pc -= g_exc[k].real_pc;
            g_exc[k].real_pc = 0;
            g_exc[k].pend_pc = 0;
           }
         if(r >= 0 && abertura <= 0)
           {
            g_exp[x].parcial = true;
            Log(StringFormat("deal %I64u: abertura da posição %I64u desconhecida; com regra pro magic %s o ciclo fica fora do MEP/MEN e o dia vira parcial",
                             ticket, pos, IntegerToString(magic)));
           }
        }
      AtualizarExposicao(magic, msc);
     }
   HistoryDealSelect(ticket);
  }

// Troca g_exc[k] pelo ciclo corrente da posição lido do histórico (depois de uma reversão): ciclo
// novo, invertido, medido a partir do preço da reversão. false = o histórico não mostra ciclo novo
// vivo (reversão que zerou, ou o deal ainda não está no cache): g_exc[k] fica como está. Troca o
// cache de histórico: quem chamou reseleciona o que precisar.
bool RecriarCiclo(int k)
  {
   ulong pos = g_exc[k].posicao_id;
   Excursao e;
   ZerarExcursao(e);
   double vivo = 0;
   if(!LerPosicaoDoHistorico(pos, 0, e, vivo) || e.vol_entradas <= 0 || vivo <= 0) return false;
   if(e.ciclo == g_exc[k].ciclo && e.lado == g_exc[k].lado) return false;   // histórico ainda sem a reversão
   ApagarGv(pos, g_exc[k].ciclo);
   e.posicao_id = pos;
   e.vol_viva   = vivo;
   e.sim_idx    = g_exc[k].sim_idx;
   g_exc[k] = e;
   RebasearTicks(e.sim_idx, e.abertura_msc);
   Log(StringFormat("posição %I64u revertida: ciclo %d %s desde %s", pos, e.ciclo,
                    (e.lado == 0 ? "compra" : "venda"), Num(e.preco_abertura, DigitosDe(e.simbolo))));
   return true;
  }

// Depois de enviar o deal: reversão vira o ciclo (o deal já foi com a excursão do ciclo fechado)
void DealDepois(ulong ticket)
  {
   if(HistoryDealGetInteger(ticket, DEAL_ENTRY) != DEAL_ENTRY_INOUT) return;
   ulong pos = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
   int k = ProcurarExc(pos);
   if(k < 0) return;
   RecriarCiclo(k);   // false = reversão que zerou (raro): fica como saída normal
   HistoryDealSelect(ticket);
  }

//+------------------------------------------------------------------+
//| JSON dos objetos                                                 |
//+------------------------------------------------------------------+
// Campos de excursão (começam com vírgula). com_tempos só no deal: o heartbeat fica pequeno.
string ExcursaoJson(int k, bool com_tempos)
  {
   int dig = DigitosDe(g_exc[k].simbolo);
   string s = ",\"ciclo\":"       + IntegerToString(g_exc[k].ciclo) +
              ",\"mfe_pontos\":"  + Num(g_exc[k].mfe, dig) +
              ",\"mae_pontos\":"  + Num(g_exc[k].mae, dig);
   if(com_tempos)
     {
      if(g_exc[k].mfe_msc > 0) s += ",\"mfe_em\":" + IsoUtcMsc(g_exc[k].mfe_msc);
      if(g_exc[k].mae_msc > 0) s += ",\"mae_em\":" + IsoUtcMsc(g_exc[k].mae_msc);
     }
   s += ",\"excursao_parcial\":" + Bool(g_exc[k].parcial);
   return s;
  }

// O deal precisa estar selecionado no histórico (HistoryDealSelect).
// com_excursao só no deal ao vivo: página de histórico nunca leva excursão.
string DealJson(ulong ticket, bool com_excursao = false)
  {
   string simbolo = HistoryDealGetString(ticket, DEAL_SYMBOL);
   LembrarSimbolo(simbolo);
   int dig = DigitosDe(simbolo);
   ulong pos = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);

   string s = "{"
              "\"ticket\":"      + IntegerToString((long)ticket) +
              ",\"posicao_id\":" + IntegerToString((long)pos) +
              ",\"ordem\":"      + IntegerToString((long)HistoryDealGetInteger(ticket, DEAL_ORDER)) +
              ",\"simbolo\":"    + JsonStr(simbolo) +
              ",\"tipo\":"       + IntegerToString((long)HistoryDealGetInteger(ticket, DEAL_TYPE)) +
              ",\"entry\":"      + IntegerToString((long)HistoryDealGetInteger(ticket, DEAL_ENTRY)) +
              ",\"volume\":"     + Num(HistoryDealGetDouble(ticket, DEAL_VOLUME), 2) +
              ",\"preco\":"      + Num(HistoryDealGetDouble(ticket, DEAL_PRICE), dig) +
              ",\"lucro\":"      + Num(HistoryDealGetDouble(ticket, DEAL_PROFIT), 2) +
              ",\"comissao\":"   + Num(HistoryDealGetDouble(ticket, DEAL_COMMISSION), 2) +
              ",\"swap\":"       + Num(HistoryDealGetDouble(ticket, DEAL_SWAP), 2) +
              ",\"magic\":"      + IntegerToString((long)HistoryDealGetInteger(ticket, DEAL_MAGIC)) +
              ",\"executado_em\":" + IsoUtcMsc(HistoryDealGetInteger(ticket, DEAL_TIME_MSC)) +
              ",\"comentario\":" + JsonStr(HistoryDealGetString(ticket, DEAL_COMMENT));
   if(com_excursao && pos > 0)
     {
      int k = ProcurarExc(pos);
      if(k >= 0) s += ExcursaoJson(k, true);
     }
   return s + "}";
  }

string PosicoesJson()
  {
   string itens = "";
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      string simbolo = PositionGetString(POSITION_SYMBOL);
      LembrarSimbolo(simbolo);
      int dig = DigitosDe(simbolo);
      long tipo = PositionGetInteger(POSITION_TYPE); // 0 = buy, 1 = sell
      ulong pos = (ulong)PositionGetInteger(POSITION_IDENTIFIER);

      string item = "{"
                    "\"ticket\":"          + IntegerToString((long)ticket) +
                    ",\"simbolo\":"        + JsonStr(simbolo) +
                    ",\"lado\":"           + IntegerToString(tipo) +
                    ",\"magic\":"          + IntegerToString((long)PositionGetInteger(POSITION_MAGIC)) +
                    ",\"volume\":"         + Num(PositionGetDouble(POSITION_VOLUME), 2) +
                    ",\"preco_abertura\":" + Num(PositionGetDouble(POSITION_PRICE_OPEN), dig) +
                    ",\"lucro_flutuante\":" + Num(PositionGetDouble(POSITION_PROFIT), 2) +
                    ",\"aberta_em\":"      + IsoUtcMsc(PositionGetInteger(POSITION_TIME_MSC)) +
                    ",\"posicao_id\":"     + IntegerToString((long)pos);
      if(InpExcursao)
        {
         int k = ProcurarExc(pos);
         if(k >= 0) item += ExcursaoJson(k, false);
        }
      item += "}";
      if(itens != "") itens += ",";
      itens += item;
     }
   return "[" + itens + "]";
  }

string CotacoesJson()
  {
   string itens = "";
   for(int i = 0; i < ArraySize(g_simbolos); i++)
     {
      string s = g_simbolos[i];
      double ultimo = SymbolInfoDouble(s, SYMBOL_LAST);
      if(ultimo <= 0) ultimo = SymbolInfoDouble(s, SYMBOL_BID);
      if(ultimo <= 0) continue;
      double fech = SymbolInfoDouble(s, SYMBOL_SESSION_CLOSE);
      if(fech <= 0) fech = SymbolInfoDouble(s, SYMBOL_SESSION_PRICE_SETTLEMENT);
      int dig = DigitosDe(s);

      string item = "{\"simbolo\":" + JsonStr(s) + ",\"preco\":" + Num(ultimo, dig);
      if(fech > 0) item += ",\"fechamento_anterior\":" + Num(fech, dig);
      item += "}";
      if(itens != "") itens += ",";
      itens += item;
     }
   return "[" + itens + "]";
  }

// MEP/MEN do dia por magic (R$ brutos por contrato). mep_em/men_em só quando saiu do zero.
string ExposicaoJson()
  {
   string itens = "";
   for(int x = 0; x < ArraySize(g_exp); x++)
     {
      if(g_exp[x].dia != g_dia) continue;
      string item = "{"
                    "\"magic\":"        + IntegerToString(g_exp[x].magic) +
                    ",\"dia\":"         + DiaIso(g_exp[x].dia) +
                    ",\"realizado\":"   + Num(g_exp[x].realizado_pc, 4) +
                    ",\"flutuante\":"   + Num(g_exp[x].flut_pc, 4) +
                    ",\"n_saidas\":"    + IntegerToString(g_exp[x].n_saidas) +
                    ",\"mep\":"         + Num(g_exp[x].mep, 4);
      if(g_exp[x].mep_msc > 0) item += ",\"mep_em\":" + IsoUtcMsc(g_exp[x].mep_msc);
      item += ",\"mep_n_saidas\":" + IntegerToString(g_exp[x].mep_n) +
              ",\"men\":"          + Num(g_exp[x].men, 4);
      if(g_exp[x].men_msc > 0) item += ",\"men_em\":" + IsoUtcMsc(g_exp[x].men_msc);
      item += ",\"men_n_saidas\":" + IntegerToString(g_exp[x].men_n) +
              ",\"parcial\":"      + Bool(g_exp[x].parcial) +
              ",\"regras_aplicadas\":" + Bool(g_exp[x].regras);
      // versão da regra aplicada: o banco só publica a linha cuja versão bate com a regra atual do robô
      int r = (g_exp[x].regras ? ProcurarRegra(g_exp[x].magic) : -1);
      if(r >= 0 && g_regras[r].versao != "") item += ",\"regras_versao\":" + JsonStr(g_regras[r].versao);
      item += "}";
      if(itens != "") itens += ",";
      itens += item;
     }
   return "[" + itens + "]";
  }

// Série do saldo do dia: os baldes fechados à espera de envio, do mais antigo em diante, agrupados por
// (magic, dia, regras). Cada balde é [t, min, max, ultimo]: t = início em epoch UTC (segundos inteiros),
// valores em R$ brutos por contrato com 4 casas. Vai um PREFIXO da fila que cabe nos tetos do servidor
// (ENVIO_ITENS_MAX itens, ENVIO_BALDES_ITEM por item, ENVIO_BALDES_MAX no total; com BALDES_MAX = 720 é a
// fila inteira): o que passar do teto seria descartado lá com 2xx e sumiria da fila, então espera o próximo
// heartbeat. Guarda em g_baldes_enviando quantos foram: o 2xx do heartbeat tira exatamente esses da fila.
string SaldoDiaJson()
  {
   long   off   = OffsetServidorSeg();
   long   f_magic[];
   int    f_dia[];
   bool   f_regras[];
   int    f_n[];
   // 1) grupos e tamanho do prefixo que cabe
   int n_env = 0;
   for(; n_env < g_baldes_n && n_env < ENVIO_BALDES_MAX; n_env++)
     {
      int  k      = (g_baldes_ini + n_env) % BALDES_MAX;
      long magic  = g_baldes[k].magic;
      int  dia    = (int)(g_baldes[k].t0 / 86400);
      bool regras = g_baldes[k].regras;
      int  g      = -1;
      for(int j = 0; j < ArraySize(f_magic) && g < 0; j++)
         if(f_magic[j] == magic && f_dia[j] == dia && f_regras[j] == regras) g = j;
      if(g < 0)
        {
         int nf = ArraySize(f_magic);
         if(nf >= ENVIO_ITENS_MAX) break;
         ArrayResize(f_magic, nf + 1);
         ArrayResize(f_dia, nf + 1);
         ArrayResize(f_regras, nf + 1);
         ArrayResize(f_n, nf + 1);
         f_magic[nf]  = magic;
         f_dia[nf]    = dia;
         f_regras[nf] = regras;
         f_n[nf]      = 0;
         g = nf;
        }
      if(f_n[g] >= ENVIO_BALDES_ITEM) break;
      f_n[g]++;
     }
   // 2) JSON por grupo, só com os baldes do prefixo
   string itens = "";
   for(int g = 0; g < ArraySize(f_magic); g++)
     {
      if(f_n[g] == 0) continue;
      string baldes = "";
      for(int j = 0; j < n_env; j++)
        {
         int q = (g_baldes_ini + j) % BALDES_MAX;
         if(g_baldes[q].magic != f_magic[g] || g_baldes[q].regras != f_regras[g] || (int)(g_baldes[q].t0 / 86400) != f_dia[g]) continue;
         if(baldes != "") baldes += ",";
         baldes += "[" + IntegerToString(g_baldes[q].t0 - off) +
                   "," + Num(g_baldes[q].minimo, 4) +
                   "," + Num(g_baldes[q].maximo, 4) +
                   "," + Num(g_baldes[q].ultimo, 4) + "]";
        }
      if(itens != "") itens += ",";
      itens += "{\"magic\":"            + IntegerToString(f_magic[g]) +
               ",\"dia\":"              + DiaIso(f_dia[g]) +
               ",\"regras_aplicadas\":" + Bool(f_regras[g]) +
               ",\"baldes\":["          + baldes + "]}";
     }
   g_baldes_enviando = n_env;
   return "[" + itens + "]";
  }

//+------------------------------------------------------------------+
//| Envios                                                           |
//+------------------------------------------------------------------+
void EnviarDeal(ulong ticket)
  {
   if(!HistoryDealSelect(ticket))
     {
      Log(StringFormat("deal %I64u não encontrado no histórico", ticket));
      return;
     }
   string corpo = "{\"ea_versao\":\"" EA_VERSAO "\",\"deal\":" + DealJson(ticket, InpExcursao) + "}";
   string resp;
   if(!Http("POST", "/api/ingest/deal", corpo, resp))
      Enfileirar("/api/ingest/deal", corpo);   // corpo completo, com a excursão, pra não perder o MFE/MAE
   else if(g_http_codigo >= 200 && g_http_codigo < 300)
      Log(StringFormat("deal %I64u enviado", ticket));
   else
      Log(StringFormat("deal %I64u DESCARTADO (HTTP %d): o histórico do próximo init recupera o deal, mas sem MFE/MAE",
                       ticket, g_http_codigo));
  }

void EnviarHeartbeat()
  {
   string corpo = "{"
                  "\"ea_versao\":\"" EA_VERSAO "\""
                  ",\"em\":"       + IsoUtc(TimeCurrent()) +
                  ",\"balance\":"  + Num(AccountInfoDouble(ACCOUNT_BALANCE), 2) +
                  ",\"equity\":"   + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
                  ",\"posicoes\":" + PosicoesJson() +
                  ",\"cotacoes\":" + CotacoesJson();
   if(InpExcursao) corpo += ",\"exposicao_dia\":" + ExposicaoJson() + ",\"saldo_dia\":" + SaldoDiaJson();
   corpo += "}";
   string resp;
   if(!Http("POST", "/api/ingest/heartbeat", corpo, resp))
      Log("heartbeat falhou; tenta de novo no próximo timer");   // os baldes da série do saldo ficam na fila e vão de novo
   else if(g_http_codigo >= 200 && g_http_codigo < 300)
      MarcarBaldesEnviados();
   // 4xx que o Http dá por encerrado (400/401/404/413/422): os baldes também ficam; a fila é limitada e o log já avisou
  }

// Monta os últimos N dias em páginas e coloca na fila; o OnTimer envia uma
// página por tick, depois do heartbeat, pra nunca travar o "ao vivo".
void EnfileirarHistorico()
  {
   datetime de  = TimeCurrent() - (datetime)(InpDiasHistorico * 86400);
   datetime ate = TimeCurrent() + 86400;
   if(!HistorySelect(de, ate))
     {
      Log("HistorySelect falhou");
      return;
     }

   int total = HistoryDealsTotal();
   if(total == 0)
     {
      Log("sem deals no período de histórico");
      return;
     }

   int total_paginas = (total + PAGINA_HIST - 1) / PAGINA_HIST;
   int pagina = 0;
   int enviados = 0;

   for(int inicio = 0; inicio < total; inicio += PAGINA_HIST)
     {
      pagina++;
      string itens = "";
      int fim = MathMin(inicio + PAGINA_HIST, total);
      for(int i = inicio; i < fim; i++)
        {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket == 0) continue;
         if(itens != "") itens += ",";
         itens += DealJson(ticket);
        }

      string corpo = "{"
                     "\"ea_versao\":\"" EA_VERSAO "\""
                     ",\"de\":"            + IsoUtc(de) +
                     ",\"ate\":"           + IsoUtc(ate) +
                     ",\"pagina\":"        + IntegerToString(pagina) +
                     ",\"total_paginas\":" + IntegerToString(total_paginas) +
                     ",\"deals\":["        + itens + "]"
                     "}";
      Enfileirar("/api/ingest/history", corpo);
      enviados += (fim - inicio);
     }
   g_reconciliar_pendente = true;
   Log(StringFormat("histórico: %d deals em %d páginas na fila; envio 1 página por timer", enviados, total_paginas));
  }

// Pede ao servidor pra reparear posições sem operação ou marcadas como abertas
void Reconciliar()
  {
   string resp;
   if(Http("POST", "/api/ingest/reconciliar", "{}", resp, InpTimeoutHistMs))
      Log("reconciliação ok: " + StringSubstr(resp, 0, 300));
   else
      Log("reconciliação falhou; roda de novo no próximo init");
  }

// Valida URL/token e traz as regras públicas por magic ("regras"). Resposta sem a chave (servidor
// antigo) ou ilegível mantém as últimas regras conhecidas. Ping ok agenda a próxima conferência em
// REGRAS_REFRESH_MS; falha de rede, 429 ou 5xx agenda retentativa em REGRAS_RETRY_MS; outro 4xx (token,
// URL) não muda sozinho e ficaria gerando uma linha em coleta_rejeicoes por tentativa: loga e espera o
// próximo init ou virada do dia. Regras diferentes das vigentes refazem o dia (AplicarRegrasNovas).
bool Ping()
  {
   string resp;
   Http("GET", "/api/ingest/ping", "", resp);
   ulong agora = GetTickCount64();
   if(g_http_codigo < 200 || g_http_codigo >= 300)
     {
      bool transitorio = (g_http_codigo == -1 || (g_http_codigo >= 1001 && g_http_codigo <= 1004)
                          || g_http_codigo == 429 || g_http_codigo >= 500);
      if(transitorio)
        {
         Log(StringFormat("ping falhou (%d): confira a liberação de WebRequest; regras do servidor de novo em %d s",
                          g_http_codigo, REGRAS_RETRY_MS / 1000));
         g_regras_prox_ms = agora + REGRAS_RETRY_MS;
        }
      else
        {
         Log(StringFormat("ping HTTP %d: confira URL e token; regras do servidor só no próximo init ou virada do dia", g_http_codigo));
         g_regras_prox_ms = 0;
        }
      return false;
     }
   g_regras_prox_ms = agora + REGRAS_REFRESH_MS;
   Log("ping ok: " + StringSubstr(resp, 0, 400));
   bool mudaram = false;
   if(LerRegras(resp, mudaram))
     {
      bool primeira = !g_regras_ok;
      g_regras_ok = true;
      if(primeira || mudaram) LogRegras();
      if(mudaram) AplicarRegrasNovas();
     }
   else
      Log(g_regras_ok ? "ping sem \"regras\" legíveis: ficam as últimas conhecidas"
                      : "ping sem \"regras\" (servidor antigo): exposição do dia sem as regras públicas, como na 1.1.0");
   return true;
  }

//+------------------------------------------------------------------+
//| Candles M1                                                       |
//+------------------------------------------------------------------+
string CandlesSimbolo()
  {
   return (InpCandlesSimbolo != "" ? InpCandlesSimbolo : Symbol());
  }

// Barras M1 fechadas desde a última aceita, em páginas de CANDLES_PAGINA. Sem fila: falha só
// loga e a próxima tentativa relê as mesmas barras do terminal (o servidor ignora repetida).
void EnviarCandles()
  {
   if(!InpEnviaCandles) return;
   string sim = CandlesSimbolo();
   datetime t0 = iTime(sim, PERIOD_M1, 0);
   if(t0 == 0) return;   // sem dados do símbolo ainda
   if(!g_candle_ok)
     {
      g_candle_ate = t0 - (datetime)(InpCandlesBackfillMin * 60);
      g_candle_ok  = true;
     }
   // só quando fechou barra nova (ou sobrou página do backfill)
   if(t0 == g_candle_t0 && !g_candle_atrasado) return;
   g_candle_t0 = t0;
   g_candle_atrasado = false;

   datetime de  = g_candle_ate + 60;
   datetime ate = t0 - 60;   // a barra 0 ainda está aberta
   if(de > ate) return;

   MqlRates r[];
   int n = CopyRates(sim, PERIOD_M1, de, ate, r);
   if(n <= 0)
     {
      Log(StringFormat("candles: CopyRates(%s) devolveu %d (erro %d); tenta na próxima barra", sim, n, GetLastError()));
      return;
     }
   int enviar = MathMin(n, CANDLES_PAGINA);
   int dig = DigitosDe(sim);
   string itens = "";
   for(int i = 0; i < enviar; i++)
     {
      if(itens != "") itens += ",";
      itens += "{\"t\":" + IsoUtc(r[i].time) +
               ",\"o\":" + Num(r[i].open, dig) +
               ",\"h\":" + Num(r[i].high, dig) +
               ",\"l\":" + Num(r[i].low, dig) +
               ",\"c\":" + Num(r[i].close, dig) +
               ",\"v\":" + IntegerToString(r[i].tick_volume) +
               ",\"vr\":" + IntegerToString(r[i].real_volume) +
               "}";
     }
   string corpo = "{\"ea_versao\":\"" EA_VERSAO "\""
                  ",\"simbolo\":" + JsonStr(sim) +
                  ",\"timeframe\":\"M1\""
                  ",\"candles\":[" + itens + "]}";
   string resp;
   Http("POST", "/api/ingest/candles", corpo, resp);
   if(g_http_codigo >= 200 && g_http_codigo < 300)
     {
      g_candle_ate = r[enviar - 1].time;
      g_candle_atrasado = (n > enviar);   // backfill: próxima página no próximo slot
      if(enviar > 1 || g_candle_atrasado)
         Log(StringFormat("candles: %d barras M1 de %s até %s%s", enviar, sim,
                          TimeToString(g_candle_ate, TIME_DATE | TIME_MINUTES),
                          (g_candle_atrasado ? StringFormat(", faltam %d", n - enviar) : "")));
     }
   else
      Log(StringFormat("candles: envio falhou (%d); as mesmas barras vão de novo na próxima", g_http_codigo));
  }

//+------------------------------------------------------------------+
//| Eventos                                                          |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpToken == "")
     {
      Alert("DeltaReporter: preencha o token da conta nos parâmetros.");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(StringLen(InpUrlBase) < 8 || StringFind(InpUrlBase, "http") != 0)
     {
      Alert("DeltaReporter: URL base inválida.");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(InpHeartbeatSeg < 1)
     {
      Alert("DeltaReporter: heartbeat mínimo de 1 segundo.");
      return INIT_PARAMETERS_INCORRECT;
     }
   g_amostra_ms = InpAmostraMs;
   if(g_amostra_ms < 50)   g_amostra_ms = 50;
   if(g_amostra_ms > 1000) g_amostra_ms = 1000;
   g_balde_seg = InpSaldoBucketSeg;
   if(g_balde_seg < 1)  g_balde_seg = 1;
   if(g_balde_seg > 60) g_balde_seg = 60;

   ArrayResize(g_simbolos, 0);
   LembrarSimbolo(Symbol());
   if(InpSimbolos != "")
     {
      string partes[];
      int n = StringSplit(InpSimbolos, ',', partes);
      for(int i = 0; i < n; i++)
        {
         string s = partes[i];
         StringTrimLeft(s);
         StringTrimRight(s);
         if(s != "")
           {
            SymbolSelect(s, true);
            LembrarSimbolo(s);
           }
        }
     }

   Log(StringFormat("v%s iniciando. conta %I64d, servidor %s, offset UTC %d s, amostra %d ms, balde do saldo %d s, excursão %s, candles %s",
                    EA_VERSAO, AccountInfoInteger(ACCOUNT_LOGIN), AccountInfoString(ACCOUNT_SERVER),
                    (int)OffsetServidorSeg(), g_amostra_ms, g_balde_seg, (InpExcursao ? "ligada" : "desligada"),
                    (InpEnviaCandles ? CandlesSimbolo() : "desligados")));
   for(int i = 0; i < ArraySize(g_simbolos); i++) LogValorPonto(g_simbolos[i]);

   ArrayResize(g_regras, 0);
   g_regras_ok      = false;
   g_regras_prox_ms = 0;
   ArrayResize(g_exp, 0);   // antes do ping: regras novas só refazem um dia já calculado
   ZerarBaldes("init");     // a fila da série do saldo não sobrevive a reinício/troca de parâmetro
   Ping();                  // valida URL/token e traz as regras públicas por magic

   g_dia        = DiaServidor();
   g_inicio_msc = MscServidor();
   ArrayResize(g_exc, 0);
   ArrayResize(g_tick_sim, 0);
   ArrayResize(g_tick_msc, 0);
   ArrayResize(g_tick_vp, 0);
   ArrayResize(g_tick_atras, 0);
   if(InpExcursao)
     {
      RestaurarExcursoes();   // posições abertas: continua das GV ou marca parcial
      SemearDia();            // saídas de hoje antes do EA subir
     }

   g_candle_ok = false;
   g_candle_t0 = 0;
   g_candle_atrasado = false;
   if(InpEnviaCandles)
     {
      string sim = CandlesSimbolo();
      SymbolSelect(sim, true);
      datetime t0 = iTime(sim, PERIOD_M1, 0);
      if(t0 > 0)
        {
         g_candle_ate = t0 - (datetime)(InpCandlesBackfillMin * 60);
         g_candle_ok  = true;
        }
      Log(StringFormat("candles M1 de %s: backfill de %d min", sim, InpCandlesBackfillMin));
     }

   // timer ANTES do histórico: o ao vivo não espera. Medir() roda a cada amostra;
   // a rede (heartbeat, fila, candles) continua a cada InpHeartbeatSeg.
   EventSetMillisecondTimer(g_amostra_ms);
   if(InpExcursao) Medir();   // primeiro heartbeat já sai com flutuante e MEP/MEN
   EnviarHeartbeat();
   g_ultimo_hb_ms = GetTickCount64();
   EnfileirarHistorico();            // só enfileira; o OnTimer envia 1 página por tick
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(InpExcursao) GravarGvSujas(true);   // extremos e "até onde mediu" ficam nas GV pro próximo init
   Log(StringFormat("parando (motivo %d). itens na fila: %d; baldes da série do saldo não enviados: %d", reason, g_fila_n, g_baldes_n));
  }

void OnTimer()
  {
   if(InpExcursao) Medir();   // só memória, a cada amostra

   ulong agora = GetTickCount64();
   if(agora - g_ultimo_hb_ms < (ulong)InpHeartbeatSeg * 1000) return;
   g_ultimo_hb_ms = agora;

   // único slot com rede (WebRequest é síncrono)
   if(g_regras_prox_ms > 0 && agora >= g_regras_prox_ms) Ping();   // regras: virada do dia ou retentativa
   EnviarHeartbeat();   // ao vivo primeiro
   ReenviarUm();        // depois, no máximo 1 item da fila (deal ou página de histórico)
   EnviarCandles();     // por último, e só quando fechou barra
  }

// Cada deal novo na conta (qualquer robô, qualquer magic)
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(trans.deal == 0) return;

   // garante o deal no cache de histórico antes de ler
   if(!HistoryDealSelect(trans.deal))
     {
      HistorySelect(TimeCurrent() - 86400, TimeCurrent() + 86400);
      if(!HistoryDealSelect(trans.deal))
        {
         Log(StringFormat("deal %I64u ainda não disponível; vai no histórico do próximo init", trans.deal));
         return;
        }
     }

   long tipo = HistoryDealGetInteger(trans.deal, DEAL_TYPE);
   bool negociacao = (tipo == DEAL_TYPE_BUY || tipo == DEAL_TYPE_SELL);

   if(InpExcursao && negociacao) DealAntes(trans.deal);   // excursão fechada com o preço de saída
   EnviarDeal(trans.deal);                                 // vai com o MFE/MAE do ciclo
   if(InpExcursao && negociacao) DealDepois(trans.deal);  // reversão abre o ciclo seguinte
  }
//+------------------------------------------------------------------+
