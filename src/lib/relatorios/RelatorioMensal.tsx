import { Document, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { ACENTO, FUNDO, MUDO, TEXTO } from "@/components/card/cores";
import { SIMBOLO_CAMINHOS, SIMBOLO_VIEWBOX } from "@/components/marca/Simbolo";
import { corDoRoboHex } from "@/lib/cores-robo";
import { formatarBRL, formatarData, formatarHora, formatarMesAno, formatarMultiplo, formatarNumero, formatarPct, formatarPontos, formatarPreco, rotuloLado } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import type { Faixa, FaixaSimbolo } from "@/lib/stats/operacoes";
import { ordenarPorDia } from "@/lib/stats/serie";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import type { OperacaoPublica, RoboPublico } from "@/lib/tipos";

interface Props {
  robo: RoboPublico;
  mes: string;
  ultimoDia: string;
  linhas: LinhaDiaria[];
  /** operações listadas no PDF (pode ser um recorte) */
  ops: OperacaoPublica[];
  /** total de operações do mês */
  totalOps: number;
  porDia: Faixa[];
  porHora: Faixa[];
  porSimbolo: FaixaSimbolo[];
  geradoEm: string;
}

/* Mídia kit da Zeve (13/10/2026; até 12/10/2026, o verde da Quants num fio do cabeçalho). A faixa da marca, no
   alto da primeira página, é a da imagem do dia e das prévias: fundo marinho, o "Z" no azul do acento e o texto
   claro, com as constantes de src/components/card/cores.ts, e o nome do robô ao lado de um traço na cor dele
   (corDoRoboHex, pela `ordem` do banco). O resto é papel branco, para imprimir: ali as cores de texto são as do
   tema claro do site (globals.css), porque as de cores.ts são as do tema escuro e o verde #22C55E daria 2,3:1 no
   branco. Contraste sobre o branco: verde 5,0:1, vermelho 6,5:1, cinza 6,0:1. */
const TINTA = "#0b1220";
const CINZA = "#5b6476";
const LINHA = "#d6dce8";
/** o fundo do cabeçalho das tabelas (o --muted do claro) */
const CABECA = "#eaeef7";
/** a linha listrada (o chão do claro); o vermelho fica em 6,1:1 sobre ela */
const LISTRA = "#f5f7fc";
const VERDE = "#15803d";
const VERMELHO = "#b91c1c";

const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 44, fontSize: 8.5, fontFamily: "Helvetica", color: TINTA },
  faixa: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: FUNDO,
  },
  marcaLinha: { flexDirection: "row", alignItems: "center", gap: 6 },
  marca: { fontSize: 9, fontFamily: "Helvetica-Bold", color: TEXTO },
  tituloLinha: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8 },
  traco: { width: 3, height: 16, borderRadius: 1.5 },
  titulo: { fontSize: 18, fontFamily: "Helvetica-Bold", color: TEXTO },
  subFaixa: { fontSize: 8.5, color: MUDO, marginTop: 3 },
  secao: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kpi: { width: "23.5%", borderWidth: 1, borderColor: LINHA, borderRadius: 6, padding: 7 },
  kpiRotulo: { fontSize: 7, color: CINZA, marginBottom: 3 },
  kpiValor: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  kpiDetalhe: { fontSize: 7, color: CINZA, marginTop: 2 },
  linha: { flexDirection: "row", paddingVertical: 3 },
  listra: { backgroundColor: LISTRA },
  cabTabela: { flexDirection: "row", backgroundColor: CABECA, borderBottomWidth: 0.5, borderBottomColor: LINHA, paddingVertical: 3.5, fontFamily: "Helvetica-Bold", color: CINZA, fontSize: 7.5 },
  cel: { paddingHorizontal: 3 },
  dir: { textAlign: "right" },
  rodape: { position: "absolute", left: 32, right: 32, bottom: 18, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: CINZA },
  nota: { fontSize: 7.5, color: CINZA, marginTop: 8, lineHeight: 1.4 },
});

function cor(v: number): string {
  return v > 0 ? VERDE : v < 0 ? VERMELHO : CINZA;
}

/** a linha da tabela, listrada nas pares (a primeira linha de dados fica branca, colada no cabeçalho) */
function estiloDaLinha(i: number) {
  return i % 2 === 1 ? [s.linha, s.listra] : s.linha;
}

function brl(v: number, inteiro = false): string {
  return formatarBRL(v, { sinal: true, inteiro });
}

/** Relatório mensal de um robô, gerado a partir das operações públicas. */
export function RelatorioMensal({ robo, mes, ultimoDia, linhas, ops, totalOps, porDia, porHora, porSimbolo, geradoEm }: Props) {
  const opcoes: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: robo.valor_ponto_brl };
  const k = calcularKpis(linhas, opcoes, { hoje: ultimoDia, capitalReferencia: robo.capital_referencia });
  const bruto = linhas.reduce((t, l) => t + l.resultado_brl_por_contrato, 0);
  const custos = linhas.reduce((t, l) => t + l.custos_brl_por_contrato, 0);

  const diarias = ordenarPorDia(linhas).reduce<Array<LinhaDiaria & { liquido: number; acumulado: number }>>((acc, l) => {
    const liquido = l.resultado_brl_por_contrato - l.custos_brl_por_contrato;
    const anterior = acc.length > 0 ? acc[acc.length - 1].acumulado : 0;
    acc.push({ ...l, liquido, acumulado: anterior + liquido });
    return acc;
  }, []);

  const kpis = [
    { rotulo: "Resultado líquido", valor: brl(k.acumulado), cor: cor(k.acumulado), detalhe: "por 1 contrato" },
    { rotulo: "Resultado bruto", valor: brl(bruto), cor: cor(bruto), detalhe: `custos ${formatarBRL(custos)}` },
    { rotulo: "Operações", valor: formatarNumero(k.nOperacoes), detalhe: `${formatarNumero(k.mediaOperacoesDia, 1)} por dia · ${k.nDias} pregões` },
    { rotulo: "Taxa de acerto", valor: formatarPct(k.taxaAcerto), detalhe: `${k.nGain} gain · ${k.nLoss} loss` },
    { rotulo: "Fator de lucro", valor: formatarMultiplo(k.fatorLucro), detalhe: "gains ÷ losses" },
    { rotulo: "Payoff", valor: formatarMultiplo(k.payoff), detalhe: "ganho médio ÷ perda média" },
    { rotulo: "Drawdown do mês", valor: brl(-k.drawdown.valor), cor: VERMELHO, detalhe: k.drawdownMaximoPct !== null ? `${formatarPct(k.drawdownMaximoPct)} do capital` : undefined },
    { rotulo: "Dias positivos × negativos", valor: `${k.diasPositivos} × ${k.diasNegativos}`, detalhe: k.melhorDia && k.piorDia ? `melhor ${brl(k.melhorDia.valor, true)} · pior ${brl(k.piorDia.valor, true)}` : undefined },
  ];

  return (
    <Document title={`${robo.nome} · ${formatarMesAno(`${mes}-01`)}`} author="Quants Robôs" subject="Relatório mensal">
      <Page size="A4" style={s.page}>
        <View style={s.faixa}>
          <View>
            <View style={s.marcaLinha}>
              <Svg width={15} height={11} viewBox={SIMBOLO_VIEWBOX}>
                {SIMBOLO_CAMINHOS.map((d, i) => (
                  <Path key={i} d={d} fill={ACENTO} />
                ))}
              </Svg>
              <Text style={s.marca}>Quants Robôs · Relatório mensal</Text>
            </View>
            <View style={s.tituloLinha}>
              <View style={[s.traco, { backgroundColor: corDoRoboHex(robo.ordem) }]} />
              <Text style={s.titulo}>
                {robo.nome} · {formatarMesAno(`${mes}-01`)}
              </Text>
            </View>
            <Text style={s.subFaixa}>
              {robo.ativo_nome} ({robo.ativo}) · valores por 1 contrato · custo {formatarBRL(robo.custo_por_contrato)} por contrato por operação
              {robo.conta_tipo === "demo" ? " · conta demo" : ""}
            </Text>
          </View>
          <Text style={s.subFaixa}>gerado em {geradoEm}</Text>
        </View>

        <Text style={s.secao}>Resumo do mês</Text>
        <View style={s.kpis}>
          {kpis.map((item) => (
            <View key={item.rotulo} style={s.kpi}>
              <Text style={s.kpiRotulo}>{item.rotulo}</Text>
              <Text style={[s.kpiValor, { color: item.cor ?? TINTA }]}>{item.valor}</Text>
              {item.detalhe ? <Text style={s.kpiDetalhe}>{item.detalhe}</Text> : null}
            </View>
          ))}
        </View>

        <Text style={s.secao}>Resultado por dia</Text>
        <View style={s.cabTabela} fixed>
          <Text style={[s.cel, { width: "14%" }]}>Dia</Text>
          <Text style={[s.cel, s.dir, { width: "10%" }]}>Op.</Text>
          <Text style={[s.cel, s.dir, { width: "10%" }]}>Gain</Text>
          <Text style={[s.cel, s.dir, { width: "10%" }]}>Loss</Text>
          <Text style={[s.cel, s.dir, { width: "14%" }]}>Bruto</Text>
          <Text style={[s.cel, s.dir, { width: "12%" }]}>Custos</Text>
          <Text style={[s.cel, s.dir, { width: "15%" }]}>Líquido</Text>
          <Text style={[s.cel, s.dir, { width: "15%" }]}>Acumulado</Text>
        </View>
        {diarias.map((d, i) => (
          <View key={d.dia} style={estiloDaLinha(i)} wrap={false}>
            <Text style={[s.cel, { width: "14%" }]}>{formatarData(d.dia)}</Text>
            <Text style={[s.cel, s.dir, { width: "10%" }]}>{d.n_operacoes}</Text>
            <Text style={[s.cel, s.dir, { width: "10%" }]}>{d.n_gain}</Text>
            <Text style={[s.cel, s.dir, { width: "10%" }]}>{d.n_loss}</Text>
            <Text style={[s.cel, s.dir, { width: "14%", color: cor(d.resultado_brl_por_contrato) }]}>{brl(d.resultado_brl_por_contrato)}</Text>
            <Text style={[s.cel, s.dir, { width: "12%", color: CINZA }]}>{formatarBRL(d.custos_brl_por_contrato)}</Text>
            <Text style={[s.cel, s.dir, { width: "15%", color: cor(d.liquido), fontFamily: "Helvetica-Bold" }]}>{brl(d.liquido)}</Text>
            <Text style={[s.cel, s.dir, { width: "15%", color: cor(d.acumulado) }]}>{brl(d.acumulado)}</Text>
          </View>
        ))}

        {porSimbolo.length > 0 ? (
          <>
            <Text style={s.secao}>Por série do contrato</Text>
            {porSimbolo.map((v, i) => (
              <View key={v.simbolo} style={estiloDaLinha(i)} wrap={false}>
                <Text style={[s.cel, { width: "30%" }]}>{v.simbolo}</Text>
                <Text style={[s.cel, s.dir, { width: "20%" }]}>{v.n} op.</Text>
                <Text style={[s.cel, s.dir, { width: "20%" }]}>{v.n > 0 ? formatarPct(v.nGain / v.n, 0) : "–"} acerto</Text>
                <Text style={[s.cel, s.dir, { width: "30%", color: cor(v.total) }]}>{brl(v.total)}</Text>
              </View>
            ))}
          </>
        ) : null}

        {porDia.length > 0 ? (
          <>
            <Text style={s.secao}>Por dia da semana e por hora de entrada</Text>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <View style={{ width: "48%" }}>
                {porDia.map((f, i) => (
                  <View key={f.chave} style={estiloDaLinha(i)} wrap={false}>
                    <Text style={[s.cel, { width: "30%" }]}>{f.rotulo}</Text>
                    <Text style={[s.cel, s.dir, { width: "20%" }]}>{f.n} op.</Text>
                    <Text style={[s.cel, s.dir, { width: "20%" }]}>{f.n > 0 ? formatarPct(f.nGain / f.n, 0) : "–"}</Text>
                    <Text style={[s.cel, s.dir, { width: "30%", color: cor(f.total) }]}>{brl(f.total)}</Text>
                  </View>
                ))}
              </View>
              <View style={{ width: "48%" }}>
                {porHora.map((f, i) => (
                  <View key={f.chave} style={estiloDaLinha(i)} wrap={false}>
                    <Text style={[s.cel, { width: "30%" }]}>{f.rotulo}</Text>
                    <Text style={[s.cel, s.dir, { width: "20%" }]}>{f.n} op.</Text>
                    <Text style={[s.cel, s.dir, { width: "20%" }]}>{f.n > 0 ? formatarPct(f.nGain / f.n, 0) : "–"}</Text>
                    <Text style={[s.cel, s.dir, { width: "30%", color: cor(f.total) }]}>{brl(f.total)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}

        <Text style={s.nota}>
          Resultado bruto é o do MetaTrader; líquido desconta o custo por contrato do robô. Gain e loss são classificados pelo líquido.
          Drawdown é a maior distância da curva acumulada do mês até o pico anterior. Metodologia completa na página Metodologia do site.
        </Text>

        <View style={s.rodape} fixed>
          <Text>Quants Robôs · {robo.nome} · {formatarMesAno(`${mes}-01`)}</Text>
          <Text render={({ pageNumber, totalPages }) => `página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={[s.secao, { marginTop: 0 }]}>Operações do mês ({formatarNumero(totalOps)})</Text>
        {totalOps > ops.length ? (
          <Text style={[s.nota, { marginTop: 0, marginBottom: 6 }]}>
            Lista com as primeiras {formatarNumero(ops.length)} operações do mês. As {formatarNumero(totalOps)} completas estão no CSV
            do mesmo mês, na aba Relatórios do robô.
          </Text>
        ) : null}
        <View style={s.cabTabela} fixed>
          <Text style={[s.cel, { width: "10%" }]}>Dia</Text>
          <Text style={[s.cel, { width: "8%" }]}>Abert.</Text>
          <Text style={[s.cel, { width: "8%" }]}>Fech.</Text>
          <Text style={[s.cel, { width: "12%" }]}>Símbolo</Text>
          <Text style={[s.cel, { width: "10%" }]}>Lado</Text>
          <Text style={[s.cel, s.dir, { width: "12%" }]}>Entrada</Text>
          <Text style={[s.cel, s.dir, { width: "12%" }]}>Saída</Text>
          <Text style={[s.cel, s.dir, { width: "9%" }]}>Pontos</Text>
          <Text style={[s.cel, s.dir, { width: "9%" }]}>Bruto</Text>
          <Text style={[s.cel, s.dir, { width: "10%" }]}>Líquido</Text>
        </View>
        {ops.map((o, i) => {
          const liq = o.resultado_brl_por_contrato - o.custos_brl_por_contrato;
          return (
            <View key={o.id} style={estiloDaLinha(i)} wrap={false}>
              <Text style={[s.cel, { width: "10%" }]}>{formatarData(o.dia_pregao).slice(0, 5)}</Text>
              <Text style={[s.cel, { width: "8%" }]}>{o.origem === "manual" ? "–" : formatarHora(o.abertura_em)}</Text>
              <Text style={[s.cel, { width: "8%" }]}>{formatarHora(o.fechamento_em)}</Text>
              <Text style={[s.cel, { width: "12%", color: CINZA }]}>{o.simbolo}</Text>
              {/* o lado na cor do texto, como no site (SeloLado): verde e vermelho são do resultado, o azul é da marca */}
              <Text style={[s.cel, { width: "10%" }]}>{rotuloLado(o.lado)}</Text>
              <Text style={[s.cel, s.dir, { width: "12%" }]}>{formatarPreco(o.preco_entrada)}</Text>
              <Text style={[s.cel, s.dir, { width: "12%" }]}>{formatarPreco(o.preco_saida)}</Text>
              <Text style={[s.cel, s.dir, { width: "9%", color: cor(o.pontos_por_contrato) }]}>{formatarPontos(o.pontos_por_contrato, true)}</Text>
              <Text style={[s.cel, s.dir, { width: "9%", color: cor(o.resultado_brl_por_contrato) }]}>{brl(o.resultado_brl_por_contrato)}</Text>
              {/* sem negrito aqui: na coluna de 10% um "+R$ 1.234,56" em negrito quebraria a linha */}
              <Text style={[s.cel, s.dir, { width: "10%", color: cor(liq) }]}>{brl(liq)}</Text>
            </View>
          );
        })}
        <View style={s.rodape} fixed>
          <Text>Quants Robôs · {robo.nome} · {formatarMesAno(`${mes}-01`)}</Text>
          <Text render={({ pageNumber, totalPages }) => `página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
