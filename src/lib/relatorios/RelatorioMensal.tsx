import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { partesDoValor } from "@/components/card/cores";
import type { CapitalDoRobo } from "@/lib/consultas/capital";
import { formatarBRL, formatarData, formatarDataCurta, formatarDuracao, formatarHora, formatarNumero, formatarPontos, formatarPreco, rotuloLado } from "@/lib/formato";
import { custosDoRobo, premissaDoRobo, temCusto } from "@/lib/premissa";
import type { ResumoDoMes } from "@/lib/stats/card-do-dia";
import { casasDosAcertos } from "@/lib/stats/como-opera";
import type { OperacaoPublica, RoboPublico } from "@/lib/tipos";

/*
 * O relatório do mês em PDF. Só desenha: os números chegam prontos de resumirMes (src/lib/stats/card-do-dia) e
 * de capitalDoRobo (src/lib/consultas/capital), o mesmo capital mínimo das telas.
 *
 * Revisão de 25/11/2026 (DESIGN.md, seção 9; Lucas: "informações que não são importantes vamos tirar, coloque
 * indicadores que fazem sentido para o trader quando o assunto é robô"). O PDF vai para quem nunca abriu o
 * site, então segue as regras das telas:
 * - o resultado do mês vem com a maior queda de dentro do mês, os dias com ganho e o pior dia;
 * - os acertos vêm com o necessário para empatar, e o fator de lucro vem em frase;
 * - a premissa está escrita junto do número: com 1 contrato por entrada e, pelo custo cadastrado do robô, "já
 *   descontados os custos" ou "antes dos custos" (src/lib/premissa, a mesma regra das telas; até a revisão o PDF
 *   dizia "já descontados os custos" também no robô cujo histórico não tem custo nenhum);
 * - o capital mínimo é o das telas, com a conta por extenso;
 * - "operou em X de Y pregões" conta os pregões como a aba Dia a dia: só da estreia do robô ao último dia que o
 *   site conhece, e só em ano com feriados cadastrados (resumirMes).
 * Saíram: o ganho médio contra a perda média como razão (o payoff), a maior queda em % do capital de
 * referência, o resultado antes dos custos como número de destaque, o melhor dia como indicador, os recortes
 * do mês por código de contrato, por dia da semana e por hora de entrada (um mês é pouco para isso; o histórico
 * inteiro está na aba Melhores horários) e, na tabela "Dia a dia", as operações com ganho e com perda de cada
 * dia (acertos sem o necessário para empatar, que o dia escolhido do site também deixou de mostrar). O
 * resultado antes dos custos, os custos e cada operação continuam na planilha do mês.
 *
 * Sem caixas, como as telas: o que separa é o espaço e o fio. Eram oito números em caixinhas com borda.
 */

interface Props {
  robo: RoboPublico;
  resumo: ResumoDoMes;
  /** o capital mínimo e as parcelas da conta, na data em que o relatório é gerado; nulo se o robô não tem a conta */
  capital: CapitalDoRobo | null;
  /** operações listadas no PDF (pode ser um recorte) */
  ops: OperacaoPublica[];
  /** total de operações do mês */
  totalOps: number;
  geradoEm: string;
  /** o endereço do site sem protocolo, como "quantsrobos.com" */
  site: string;
  /** a frase curta de "passado não garante futuro" do aviso legal */
  legal: string;
}

// o react-pdf separa sílabas pela regra do inglês ("oper-ação"): palavra não se parte, a linha quebra no espaço
Font.registerHyphenationCallback((palavra) => [palavra]);

const TEXTO = "#141416";
const VERDE = "#2e6f40";
const VERMELHO = "#b22222";
const CINZA = "#71685c";
const LINHA = "#e4e0da";
/* o verde da Quants na versão para papel, a mesma do tema claro do site (19/09/2026, no lugar do
   dourado): só no fio do cabeçalho. O verde de resultado continua o VERDE, que é outra cor */
const ACENTO = "#007a41";

const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 44, fontSize: 8.5, fontFamily: "Helvetica", color: TEXTO },
  cabecalho: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: ACENTO },
  marca: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  titulo: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 2 },
  sub: { fontSize: 9, color: CINZA, marginTop: 2 },
  secao: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 4 },
  // o resumo: o número grande à esquerda e os fatos colados nele, à direita
  resumo: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  rotuloNumero: { fontSize: 9, color: CINZA },
  numero: { fontSize: 30, marginTop: 4 },
  premissa: { fontSize: 8.5, color: CINZA, marginTop: 4, lineHeight: 1.4 },
  fato: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 0.5, borderBottomColor: LINHA, paddingVertical: 4 },
  fatoRotulo: { fontSize: 9, color: CINZA },
  fatoValor: { fontSize: 9.5, fontFamily: "Helvetica-Bold", textAlign: "right" },
  // a lista: nome e linha de apoio à esquerda, valor à direita, um fio entre as linhas
  item: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 0.5, borderBottomColor: LINHA, paddingVertical: 5 },
  itemRotulo: { fontSize: 9 },
  apoio: { fontSize: 7.5, color: CINZA, marginTop: 2, lineHeight: 1.4 },
  itemValor: { fontSize: 9.5, fontFamily: "Helvetica-Bold", textAlign: "right" },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINHA, paddingVertical: 3 },
  cabTabela: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINHA, paddingVertical: 3, color: CINZA, fontSize: 7.5 },
  cel: { paddingHorizontal: 2 },
  dir: { textAlign: "right" },
  rodape: { position: "absolute", left: 32, right: 32, bottom: 18, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: CINZA },
  nota: { fontSize: 7.5, color: CINZA, marginTop: 10, lineHeight: 1.4 },
});

function cor(v: number): string {
  return v > 0 ? VERDE : v < 0 ? VERMELHO : CINZA;
}

function brl(v: number): string {
  return formatarBRL(v, { sinal: true });
}

/** "2026-10" -> "outubro de 2026" */
function mesPorExtenso(mes: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${mes}-01T00:00:00Z`));
}

/** "83", "80,6": a fração de 0 a 1 em "de cada 100", com as casas de casasDosAcertos (a regra da aba Resumo) */
function deCada100(fracao: number, casas: 0 | 1): string {
  return formatarNumero(fracao * 100, casas);
}

/** "98", "4,3": uma casa só quando o número é pequeno e não é inteiro */
function quantas(v: number): string {
  const umaCasa = v < 10 && Math.round(v * 10) % 10 !== 0;
  return formatarNumero(v, umaCasa ? 1 : 0);
}

const pregoes = (n: number) => `${formatarNumero(n)} ${n === 1 ? "pregão" : "pregões"}`;

/**
 * "operou em 14 de 15 pregões do mês até 24/11", "operou em todos os pregões desde a estreia, em 13/02": os
 * pregões da bolsa contados como na aba Dia a dia (resumirMes), com o trecho do mês que o site conhece. Vazio
 * quando o site não sabe quantos pregões a bolsa teve (ano sem feriado cadastrado, por exemplo).
 */
function emQuantosPregoes(resumo: ResumoDoMes): string {
  const { pregoesDaBolsa: total, pregoesContados: contados } = resumo;
  if (total === null || contados === null) return "";
  const trecho = contados.estreouNoMes
    ? `desde a estreia, em ${formatarDataCurta(contados.de)}${contados.ateOFimDoMes ? "" : `, até ${formatarDataCurta(contados.ate)}`}`
    : `do mês${contados.ateOFimDoMes ? "" : ` até ${formatarDataCurta(contados.ate)}`}`;
  return total > resumo.pregoes ? `operou em ${formatarNumero(resumo.pregoes)} de ${pregoes(total)} ${trecho}` : `operou em todos os pregões ${trecho}`;
}

/** R$ sem centavos quando o valor é redondo (a garantia de R$ 150 por contrato), com centavos senão */
function reais(v: number): string {
  return formatarBRL(v, { inteiro: Number.isInteger(v) });
}

interface Item {
  rotulo: string;
  valor: string;
  apoio?: string;
  cor?: string;
}

function Lista({ itens }: { itens: Item[] }) {
  return (
    <View>
      {itens.map((item) => (
        <View key={item.rotulo} style={s.item} wrap={false}>
          <View style={{ width: "60%" }}>
            <Text style={s.itemRotulo}>{item.rotulo}</Text>
            {item.apoio ? <Text style={s.apoio}>{item.apoio}</Text> : null}
          </View>
          <Text style={[s.itemValor, { width: "38%", color: item.cor ?? TEXTO }]}>{item.valor}</Text>
        </View>
      ))}
    </View>
  );
}

interface Coluna {
  titulo: string;
  largura: number;
  direita?: boolean;
  texto: (o: OperacaoPublica) => string;
  cor?: (o: OperacaoPublica) => string;
}

const liquido = (o: OperacaoPublica) => o.resultado_brl_por_contrato - o.custos_brl_por_contrato;

/** Relatório mensal de um robô, gerado a partir das operações públicas. */
export function RelatorioMensal({ robo, resumo, capital, ops, totalOps, geradoEm, site, legal }: Props) {
  const mes = mesPorExtenso(resumo.mes);
  const custo = robo.custo_por_contrato;
  // o robô sem custo cadastrado tem o histórico antes dos custos: a premissa e as notas dizem isso (src/lib/premissa)
  const comCusto = temCusto(custo);
  const { operou, maiorQueda } = resumo;
  const primeiroDia = resumo.dias.length > 0 ? resumo.dias[0].dia : null;

  // o número grande, como o do site: o sinal e o "R$" mais leves; negativo, vermelho inteiro
  const [prefixo, algarismos] = partesDoValor(brl(resumo.resultado));
  const negativo = resumo.resultado < 0;

  const periodo =
    primeiroDia && resumo.ultimoDia
      ? `em ${pregoes(resumo.pregoes)} com operação, de ${formatarDataCurta(primeiroDia)} a ${formatarDataCurta(resumo.ultimoDia)}${resumo.emAndamento ? " (mês em andamento)" : ""}`
      : "";

  // a maior queda de dentro do mês e se o mês voltou ao ponto mais alto
  const quedaApoio =
    maiorQueda.valor > 0 && maiorQueda.inicio && maiorQueda.fundo
      ? `${
          maiorQueda.inicio === maiorQueda.fundo
            ? `em ${formatarDataCurta(maiorQueda.fundo)}`
            : `de ${formatarDataCurta(maiorQueda.inicio)} a ${formatarDataCurta(maiorQueda.fundo)}`
        }; ${
          maiorQueda.recuperouEm
            ? `recuperou em ${formatarDataCurta(maiorQueda.recuperouEm)}`
            : resumo.emAndamento
              ? "ainda não recuperou"
              : "não recuperou no mês"
        }`
      : null;

  // o ritmo do mês: quantas operações por pregão, quanto dura cada uma e em quantos pregões operou
  const ritmo = [
    resumo.operacoesPorPregao !== null
      ? `${quantas(resumo.operacoesPorPregao)} por pregão${resumo.duracaoTipicaSeg !== null ? `, cada uma dura ${formatarDuracao(resumo.duracaoTipicaSeg)}, normalmente` : ""}`
      : "",
    emQuantosPregoes(resumo),
  ].filter(Boolean);
  const comoOperou: Item[] = [{ rotulo: "Operações", valor: formatarNumero(operou.operacoes), apoio: ritmo.join("; ") }];
  // acertos nunca aparecem sem o necessário para empatar: sem ganho ou sem perda para comparar, a linha não entra
  if (operou.acertos !== null && operou.paraEmpatar !== null) {
    // inteiros, ou uma casa quando os dois arredondariam para o mesmo número (como na aba Resumo)
    const casas = casasDosAcertos(operou.acertos, operou.paraEmpatar);
    comoOperou.push({
      rotulo: "Acertos",
      valor: `${deCada100(operou.acertos, casas)} de cada 100`,
      apoio: `Pelo tamanho dos ganhos e das perdas, precisava de ${deCada100(operou.paraEmpatar, casas)} de cada 100 só para empatar.`,
    });
  }
  if (operou.ganhoTipico !== null && operou.perdaTipica !== null) {
    comoOperou.push({
      rotulo: "Ganho típico e perda típica",
      valor: `${brl(operou.ganhoTipico)} e ${brl(-operou.perdaTipica)}`,
      apoio: `O tamanho de um ganho e de uma perda.${operou.maiorPerda !== null ? ` A operação que mais perdeu no mês: ${brl(operou.maiorPerda)}.` : ""}`,
    });
  } else if (operou.ganhoTipico !== null) {
    comoOperou.push({ rotulo: "Ganho típico", valor: brl(operou.ganhoTipico), apoio: "O tamanho de um ganho. Nenhuma operação do mês terminou com perda." });
  } else if (operou.perdaTipica !== null) {
    comoOperou.push({
      rotulo: "Perda típica",
      valor: brl(-operou.perdaTipica),
      apoio: `O tamanho de uma perda. Nenhuma operação do mês terminou com ganho.${operou.maiorPerda !== null ? ` A que mais perdeu: ${brl(operou.maiorPerda)}.` : ""}`,
    });
  }
  if (operou.fatorLucro !== null) {
    comoOperou.push({
      rotulo: "Fator de lucro",
      valor: `ganhou ${formatarBRL(operou.fatorLucro)} para cada R$ 1 perdido`,
      apoio: "Somando todas as operações do mês. Acima de R$ 1, ganhou mais do que perdeu.",
    });
  }
  if (operou.porOperacao !== null) {
    comoOperou.push({
      rotulo: "Resultado médio por operação",
      valor: brl(operou.porOperacao),
      apoio: comCusto ? `O custo considerado é de ${formatarBRL(custo)} por operação.` : "Antes dos custos: este histórico não tem custo nenhum descontado, e o custo de cada operação sai deste valor.",
    });
  }

  // o capital mínimo das telas (capitalDoRobo), com a conta por extenso
  const paraUsar: Item[] = [];
  if (capital && capital.capitalMinimo !== null && capital.margem !== null) {
    const medido = capital.entradasEm !== null && capital.entradas > 1;
    if (medido) {
      paraUsar.push({
        rotulo: "Entradas abertas ao mesmo tempo",
        valor: `até ${formatarNumero(capital.entradas)}`,
        apoio: "O máximo que o robô já teve no mesmo instante. Cada entrada usa 1 contrato.",
      });
    }
    const fator = String(capital.fator).replace(".", ",");
    paraUsar.push({
      rotulo: "Capital mínimo",
      valor: formatarBRL(capital.capitalMinimo, { inteiro: true }),
      apoio: `${reais(capital.margem)} de garantia (a margem) por contrato${medido ? ` × ${formatarNumero(capital.entradas)} entradas` : ""}, mais a maior queda de todo o histórico (${formatarBRL(capital.maiorQueda, { inteiro: true })}) × ${fator}. Conta feita com o histórico inteiro, na data deste relatório. Quedas futuras podem ser maiores.`,
    });
  }

  // a tabela de operações, como a da aba Operações: coluna que o mês não tem como preencher não aparece
  // (histórico importado não traz preço, hora de entrada nem duração)
  const temPrecos = ops.some((o) => o.preco_entrada !== null || o.preco_saida !== null);
  const temDuracao = ops.some((o) => o.origem !== "manual");
  const colunas: Coluna[] = [
    { titulo: "Dia", largura: 9, texto: (o) => formatarDataCurta(o.dia_pregao) },
    {
      titulo: temDuracao ? "Horário" : "Saída às",
      largura: 16,
      texto: (o) => (o.origem === "manual" ? formatarHora(o.fechamento_em) : `${formatarHora(o.abertura_em)} – ${formatarHora(o.fechamento_em)}`),
    },
    { titulo: "Lado", largura: 10, texto: (o) => rotuloLado(o.lado) },
    ...(temPrecos
      ? [
          { titulo: "Entrada", largura: 13, direita: true, texto: (o: OperacaoPublica) => formatarPreco(o.preco_entrada) },
          { titulo: "Saída", largura: 13, direita: true, texto: (o: OperacaoPublica) => formatarPreco(o.preco_saida) },
        ]
      : []),
    ...(temDuracao ? [{ titulo: "Duração", largura: 12, direita: true, texto: (o: OperacaoPublica) => (o.origem === "manual" ? "–" : formatarDuracao(o.duracao_seg)) }] : []),
    { titulo: "Pontos", largura: 11, direita: true, texto: (o) => formatarPontos(o.pontos_por_contrato, true) },
    { titulo: "Resultado", largura: 16, direita: true, texto: (o) => brl(liquido(o)), cor: (o) => cor(liquido(o)) },
  ];
  const escala = 100 / colunas.reduce((t, c) => t + c.largura, 0);
  const largura = (c: Coluna) => `${(c.largura * escala).toFixed(2)}%`;

  const rodape = (
    <View style={s.rodape} fixed>
      <Text>
        Quants Robôs · {robo.nome} · {mes}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `página ${pageNumber} de ${totalPages}`} />
    </View>
  );

  return (
    <Document title={`${robo.nome} · ${mes}`} author="Quants Robôs" subject="Relatório do mês">
      <Page size="A4" style={s.page}>
        <View style={s.cabecalho}>
          <View>
            <Text style={s.marca}>Quants Robôs · Relatório do mês</Text>
            <Text style={s.titulo}>
              {robo.nome} · {mes}
            </Text>
            <Text style={s.sub}>
              {robo.ativo_nome || robo.ativo}
              {robo.conta_tipo === "demo" ? " · conta demo" : ""}
            </Text>
          </View>
          <Text style={s.sub}>gerado em {geradoEm}</Text>
        </View>

        <View style={s.resumo}>
          <View style={{ width: "52%" }}>
            <Text style={s.rotuloNumero}>{resumo.emAndamento && resumo.ultimoDia ? `Resultado do mês até ${formatarDataCurta(resumo.ultimoDia)}` : "Resultado do mês"}</Text>
            <Text style={s.numero}>
              {prefixo ? <Text style={{ color: negativo ? VERMELHO : CINZA }}>{`${prefixo} `}</Text> : null}
              <Text style={{ fontFamily: "Helvetica-Bold", color: negativo ? VERMELHO : TEXTO }}>{algarismos}</Text>
            </Text>
            <Text style={s.premissa}>{premissaDoRobo(custo)}</Text>
            {periodo ? <Text style={[s.premissa, { marginTop: 1 }]}>{periodo}</Text> : null}
          </View>

          <View style={{ width: "42%" }}>
            <View style={s.fato}>
              <Text style={s.fatoRotulo}>Maior queda no mês</Text>
              <View style={{ width: "60%" }}>
                <Text style={[s.fatoValor, { color: maiorQueda.valor > 0 ? VERMELHO : CINZA }]}>{maiorQueda.valor > 0 ? brl(-maiorQueda.valor) : "nenhuma"}</Text>
                {quedaApoio ? <Text style={[s.apoio, s.dir]}>{quedaApoio}</Text> : null}
              </View>
            </View>
            <View style={s.fato}>
              <Text style={s.fatoRotulo}>Dias com ganho</Text>
              <Text style={s.fatoValor}>
                {formatarNumero(resumo.diasComGanho)} de {formatarNumero(resumo.pregoes)}
              </Text>
            </View>
            {resumo.piorDia ? (
              <View style={s.fato}>
                <Text style={s.fatoRotulo}>Pior dia</Text>
                <Text style={[s.fatoValor, { color: cor(resumo.piorDia.valor) }]}>
                  {formatarDataCurta(resumo.piorDia.dia)} · {brl(resumo.piorDia.valor)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={s.secao} minPresenceAhead={40}>
          Como ele operou no mês
        </Text>
        <Lista itens={comoOperou} />

        {paraUsar.length > 0 ? (
          <>
            <Text style={s.secao} minPresenceAhead={40}>
              Capital para usar o robô
            </Text>
            <Lista itens={paraUsar} />
          </>
        ) : null}

        {/* A nota vem antes da tabela, e a tabela fecha a página: o cabeçalho dela se repete em toda página
            (fixed), e com a nota no fim ele aparecia sozinho, sem linha embaixo, quando só a nota passava
            para a página seguinte. A nota e a frase legal não se separam. */}
        <View wrap={false}>
          <Text style={s.nota}>
            {`Todos os valores são para 1 contrato por entrada, ${custosDoRobo(custo)}${comCusto ? ` (${formatarBRL(custo)} por operação)` : ": este histórico não tem custo nenhum descontado"}. O robô pode ter mais de uma entrada aberta ao mesmo tempo, e cada uma usa 1 contrato. ${comCusto ? "Uma operação conta como ganho ou como perda depois de descontado o custo dela. " : ""}A maior queda no mês vai do ponto mais alto ao mais baixo que veio depois, somando um dia depois do outro a partir do zero no começo do mês. A planilha do mês, com cada operação${comCusto ? ", o resultado antes dos custos e os custos" : ""}, está na aba Dia a dia do robô em ${site}/robos/${robo.slug}. A conta de cada número está na página Como funciona.`}
          </Text>
          <Text style={[s.nota, { marginTop: 4 }]}>{legal}</Text>
        </View>

        <Text style={s.secao} minPresenceAhead={60}>
          Dia a dia
        </Text>
        {/* Dia, operações, resultado e o somado do mês. Saíram as colunas "Com ganho" e "Com perda" (25/11/2026):
            acertos de um dia sem o necessário para empatar, que o dia escolhido do site também deixou de mostrar.
            As contagens podem ser refeitas pela planilha do mês, que tem cada operação. */}
        <View style={s.cabTabela} fixed>
          <Text style={[s.cel, { width: "22%" }]}>Dia</Text>
          <Text style={[s.cel, s.dir, { width: "18%" }]}>Operações</Text>
          <Text style={[s.cel, s.dir, { width: "30%" }]}>Resultado</Text>
          <Text style={[s.cel, s.dir, { width: "30%" }]}>Somado no mês</Text>
        </View>
        {resumo.dias.map((d) => (
          <View key={d.dia} style={s.linha} wrap={false}>
            <Text style={[s.cel, { width: "22%" }]}>{formatarData(d.dia)}</Text>
            <Text style={[s.cel, s.dir, { width: "18%" }]}>{formatarNumero(d.operacoes)}</Text>
            <Text style={[s.cel, s.dir, { width: "30%", color: cor(d.resultado) }]}>{brl(d.resultado)}</Text>
            <Text style={[s.cel, s.dir, { width: "30%", color: cor(d.somado) }]}>{brl(d.somado)}</Text>
          </View>
        ))}

        {rodape}
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={[s.secao, { marginTop: 0 }]}>Operações do mês ({formatarNumero(totalOps)})</Text>
        {totalOps > ops.length ? (
          <Text style={[s.nota, { marginTop: 0, marginBottom: 6 }]}>
            A lista traz as primeiras {formatarNumero(ops.length)} operações do mês. Todas as {formatarNumero(totalOps)} estão na planilha do mesmo mês, na aba Dia
            a dia do robô.
          </Text>
        ) : null}
        <View style={s.cabTabela} fixed>
          {colunas.map((c) => (
            <Text key={c.titulo} style={[s.cel, c.direita ? s.dir : {}, { width: largura(c) }]}>
              {c.titulo}
            </Text>
          ))}
        </View>
        {ops.map((o) => (
          <View key={o.id} style={s.linha} wrap={false}>
            {colunas.map((c) => (
              <Text key={c.titulo} style={[s.cel, c.direita ? s.dir : {}, { width: largura(c) }, c.cor ? { color: c.cor(o) } : {}]}>
                {c.texto(o)}
              </Text>
            ))}
          </View>
        ))}
        {rodape}
      </Page>
    </Document>
  );
}
