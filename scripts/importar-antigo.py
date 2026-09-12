"""
Importa o histórico de operações do projeto Supabase antigo (Quantsrobos,
tabela public.trades) para o Delta Robôs (public.operacoes, origem 'manual').

Uso (na pasta do projeto, com a CLI do Supabase logada e linkada):
    python scripts/importar-antigo.py                       # apollo e orion, data < 2026-07-01
    python scripts/importar-antigo.py --dry-run             # só conta
    python scripts/importar-antigo.py --robo "alaska-&-square" --slug alaska-square --corte 2026-09-13

Regras:
- `--robo` é o slug na origem, `--slug` o slug no destino (padrão: igual), `--corte` é
  exclusivo: importa só data < corte (o MT5 vale dali em diante).
- `data` no banco antigo está gravada com o relógio de Brasília rotulado como UTC;
  aqui vira timestamptz -03:00.
- Sem preços de entrada/saída (a origem não tem). Pontos = R$ por contrato ÷ valor do ponto.
- Custos = custo_por_contrato do robô no destino × lote (o antigo não tinha custo).
- Idempotente: id da origem vai em operacoes.id_externo (índice único por robô).
- Robô sem conta principal (só histórico) grava conta_id nulo.
- Depois da carga, robos.historico_manual_ate = corte - 1 dia ativa a exibição.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

ORIGEM_REF = "dbczpbvhmpiebmwiugtt"
PAGINA = 1000
LOTE_INSERT = 500


def consultar(sql: str, ref: str | None = None) -> list[dict]:
    """Roda SQL pela CLI (arquivo temporário evita problemas de aspas no shell)."""
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write(sql)
        caminho = f.name
    try:
        cmd = ["npx", "supabase", "db", "query", "--linked"]
        if ref:
            cmd += ["--project-ref", ref]
        cmd += ["--file", caminho]
        saida = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", shell=(os.name == "nt")).stdout
    finally:
        os.unlink(caminho)
    inicio = saida.find("{")
    if inicio < 0:
        raise SystemExit(f"resposta sem JSON:\n{saida[:500]}")
    dados = json.loads(saida[inicio:])
    if dados.get("_tag") == "Error":
        raise SystemExit(json.dumps(dados, ensure_ascii=False)[:800])
    return dados.get("rows", [])


def sql_str(v) -> str:
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def importar(robo_origem: str, slug_destino: str, corte: str, dry_run: bool) -> None:
    destino = consultar(
        f"select r.id, r.slug, r.conta_principal_id, r.custo_por_contrato from robos r where r.slug = {sql_str(slug_destino)}"
    )
    if not destino:
        raise SystemExit(f"robô {slug_destino} não existe no destino")
    r = destino[0]
    valor_ponto = {m["prefixo_simbolo"]: float(m["valor_ponto_brl"]) for m in consultar("select prefixo_simbolo, valor_ponto_brl from multiplicadores")}

    total = consultar(
        f"select count(*) as n, round(sum(coalesce(resultado_bruto, resultado)),2) as bruto, min(data)::date as de, max(data)::date as ate "
        f"from trades where robo = {sql_str(robo_origem)} and data < '{corte}'",
        ORIGEM_REF,
    )
    print(f"origem {robo_origem} -> destino {slug_destino}:", total)
    if dry_run:
        return

    ultimo = "00000000-0000-0000-0000-000000000000"
    importados = 0
    while True:
        pagina = consultar(
            "select id, robo, data, ativo, lado, lote, resultado, resultado_bruto, custos "
            f"from trades where robo = {sql_str(robo_origem)} and data < '{corte}' "
            f"and id > '{ultimo}' order by id limit {PAGINA}",
            ORIGEM_REF,
        )
        if not pagina:
            break

        linhas = []
        for t in pagina:
            naive = str(t["data"])[:19].replace("T", " ")      # 'YYYY-MM-DD HH:MM:SS' = relógio de Brasília
            quando = f"{naive}-03:00"
            dia = naive[:10]
            simbolo = str(t["ativo"]).upper()
            prefixo = next((p for p in sorted(valor_ponto, key=len, reverse=True) if simbolo.startswith(p)), None)
            if prefixo is None:
                print("símbolo sem multiplicador, pulando:", simbolo, t["id"])
                continue
            lote = max(1, int(t["lote"] or 1))
            bruto = float(t["resultado_bruto"] if t["resultado_bruto"] is not None else t["resultado"])
            bruto_ct = bruto / lote
            pontos_ct = bruto_ct / valor_ponto[prefixo]
            custo_ct = float(r["custo_por_contrato"] or 0)
            lado = "compra" if str(t["lado"]).lower().startswith("c") else "venda"
            conta = sql_str(r["conta_principal_id"]) + "::uuid" if r["conta_principal_id"] else "null::uuid"
            linhas.append(
                "("
                + ", ".join(
                    [
                        sql_str(r["id"]) + "::uuid",
                        conta,
                        sql_str(simbolo),
                        sql_str(prefixo),
                        sql_str(lado) + "::lado_operacao",
                        str(lote),
                        sql_str(quando) + "::timestamptz",
                        sql_str(quando) + "::timestamptz",
                        f"{pontos_ct * lote:.3f}",
                        f"{pontos_ct:.3f}",
                        f"{bruto:.2f}",
                        f"{bruto_ct:.4f}",
                        f"{custo_ct * lote:.2f}",
                        f"{custo_ct:.4f}",
                        sql_str(dia) + "::date",
                        sql_str(t["id"]),
                        "'manual'::origem_operacao",
                        "1",
                        "0",
                    ]
                )
                + ")"
            )

        for i in range(0, len(linhas), LOTE_INSERT):
            lote_sql = ",\n".join(linhas[i : i + LOTE_INSERT])
            consultar(
                "insert into operacoes (robo_id, conta_id, simbolo, prefixo_simbolo, lado, contratos, abertura_em, fechamento_em, "
                "pontos, pontos_por_contrato, resultado_brl, resultado_brl_por_contrato, custos_brl, custos_brl_por_contrato, "
                "dia_pregao, id_externo, origem, ciclo, duracao_seg) values\n"
                + lote_sql
                + "\non conflict (robo_id, id_externo) where id_externo is not null do nothing"
            )
        importados += len(linhas)
        ultimo = pagina[-1]["id"]
        print(f"importados até agora: {importados} (último id {ultimo[:8]})", flush=True)

    print("fim. total enviado:", importados)
    print(
        "destino:",
        consultar(
            "select r.slug, count(*) as n, round(sum(o.resultado_brl),2) as bruto, min(o.dia_pregao) as de, max(o.dia_pregao) as ate "
            f"from operacoes o join robos r on r.id = o.robo_id where o.origem = 'manual' and r.slug = {sql_str(slug_destino)} group by r.slug"
        ),
    )


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--robo", help="slug do robô na origem (padrão: apollo e orion)")
    p.add_argument("--slug", help="slug do robô no destino (padrão: igual ao da origem)")
    p.add_argument("--corte", default="2026-07-01", help="importa data < corte (padrão 2026-07-01)")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()

    pares = [(a.robo, a.slug or a.robo)] if a.robo else [("apollo", "apollo"), ("orion", "orion")]
    for origem, destino in pares:
        importar(origem, destino, a.corte, a.dry_run)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
