"""
Importa o histórico de operações do projeto Supabase antigo (Quantsrobos,
tabela public.trades) para o Delta Robôs (public.operacoes, origem 'manual').

Uso (na pasta do projeto, com a CLI do Supabase logada e linkada):
    python scripts/importar-antigo.py            # importa data < CORTE
    python scripts/importar-antigo.py --dry-run  # só conta

Regras:
- Só robôs apollo e orion, só operações com data < CORTE (o MT5 vale dali em diante).
- `data` no banco antigo está gravada com o relógio de Brasília rotulado como UTC;
  aqui vira timestamptz -03:00.
- Sem preços de entrada/saída (a origem não tem). Pontos = R$ por contrato ÷ valor do ponto.
- Custos = custo_por_contrato do robô no destino × lote (o antigo não tinha custo).
- Idempotente: id da origem vai em operacoes.id_externo (índice único por robô).
- Depois da carga, definir robos.historico_manual_ate = CORTE - 1 dia ativa a exibição.
"""

import json
import os
import subprocess
import sys
import tempfile

ORIGEM_REF = "dbczpbvhmpiebmwiugtt"
CORTE = "2026-07-01"          # exclusivo
ROBOS = ("apollo", "orion")
PAGINA = 1000
LOTE_INSERT = 500
DRY_RUN = "--dry-run" in sys.argv


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


def main() -> None:
    # destino: robôs, contas principais, custos, valor do ponto
    robos = {
        r["slug"]: r
        for r in consultar(
            "select r.id, r.slug, r.conta_principal_id, r.custo_por_contrato from robos r "
            f"where r.slug in ({', '.join(sql_str(s) for s in ROBOS)})"
        )
    }
    for slug in ROBOS:
        if slug not in robos or not robos[slug]["conta_principal_id"]:
            raise SystemExit(f"robô {slug} sem conta principal no destino")
    valor_ponto = {m["prefixo_simbolo"]: float(m["valor_ponto_brl"]) for m in consultar("select prefixo_simbolo, valor_ponto_brl from multiplicadores")}

    total = consultar(
        f"select robo, count(*) as n, round(sum(coalesce(resultado_bruto, resultado)),2) as bruto "
        f"from trades where robo in ({', '.join(sql_str(s) for s in ROBOS)}) and data < '{CORTE}' group by robo",
        ORIGEM_REF,
    )
    print("origem:", total)
    if DRY_RUN:
        return

    ultimo = "00000000-0000-0000-0000-000000000000"
    importados = 0
    while True:
        pagina = consultar(
            "select id, robo, data, ativo, lado, lote, resultado, resultado_bruto, custos "
            f"from trades where robo in ({', '.join(sql_str(s) for s in ROBOS)}) and data < '{CORTE}' "
            f"and id > '{ultimo}' order by id limit {PAGINA}",
            ORIGEM_REF,
        )
        if not pagina:
            break

        linhas = []
        for t in pagina:
            r = robos[t["robo"]]
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
            linhas.append(
                "("
                + ", ".join(
                    [
                        sql_str(r["id"]) + "::uuid",
                        sql_str(r["conta_principal_id"]) + "::uuid",
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
        print(f"importados até agora: {importados} (último id {ultimo[:8]})")

    print("fim. total enviado:", importados)
    print(
        "destino:",
        consultar(
            "select r.slug, count(*) as n, round(sum(o.resultado_brl),2) as bruto, min(o.dia_pregao) as de, max(o.dia_pregao) as ate "
            "from operacoes o join robos r on r.id = o.robo_id where o.origem = 'manual' group by r.slug order by 1"
        ),
    )


if __name__ == "__main__":
    main()
