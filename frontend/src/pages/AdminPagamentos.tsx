import { useCallback, useEffect, useState } from "react";
import { abrirDocumento, api, brl, enviarArquivo, fmtData, type AcademiaAdmin, type PagamentoAdmin } from "../api";

const FORMA: Record<string, string> = {
  pix: "Pix", boleto: "Boleto", cartao: "Cartão", transferencia: "Transferência", dinheiro: "Dinheiro", cortesia: "Cortesia", outro: "Outro",
};

type Props = { academias: AcademiaAdmin[]; atualizar: () => void; erro: (m: string) => void };

/** Aba "Pagamentos": histórico financeiro, comprovantes e estornos. */
export default function AdminPagamentos({ academias, atualizar, erro }: Props) {
  const [lista, setLista] = useState<{ total_centavos: number; itens: PagamentoAdmin[] } | null>(null);
  const [academiaId, setAcademiaId] = useState("");
  const [mes, setMes] = useState("");

  const carregar = useCallback(() => {
    const q = new URLSearchParams();
    if (academiaId) q.set("academia_id", academiaId);
    if (mes) q.set("mes", mes);
    api.get<{ total_centavos: number; itens: PagamentoAdmin[] }>(`/admin/pagamentos?${q}`).then(setLista).catch((e) => erro(e.message));
  }, [academiaId, mes, erro]);
  useEffect(carregar, [carregar]);

  async function estornar(p: PagamentoAdmin) {
    if (!confirm(`Estornar o pagamento de ${brl(p.valor_centavos)} de "${p.academia}"?\n\nEle sai da receita. O vencimento NÃO muda: ajuste em Editar, se precisar.`)) return;
    try { await api.post(`/admin/pagamentos/${p.id}/estornar`); carregar(); atualizar(); } catch (e) { erro((e as Error).message); }
  }
  async function anexar(p: PagamentoAdmin, f: File | undefined) {
    if (!f) return;
    try { await enviarArquivo(`/admin/pagamentos/${p.id}/comprovante`, f); carregar(); } catch (e) { erro((e as Error).message); }
  }
  async function ver(p: PagamentoAdmin) {
    try { await abrirDocumento(`/admin/pagamentos/${p.id}/comprovante`); } catch (e) { erro((e as Error).message); }
  }

  function exportar() {
    if (!lista) return;
    const linhas = [["Data", "Academia", "Valor (R$)", "Forma", "Dias concedidos", "Observação", "Comprovante", "Estornado"],
      ...lista.itens.map((p) => [fmtData(p.data_pagamento), p.academia ?? "", (p.valor_centavos / 100).toFixed(2).replace(".", ","), FORMA[p.forma] ?? p.forma,
        p.dias_concedidos, p.observacao ?? "", p.comprovante?.nome ?? "", p.estornado ? "sim" : "não"])];
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = "pagamentos.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="filtros">
        <select value={academiaId} onChange={(e) => setAcademiaId(e.target.value)}>
          <option value="">Todas as academias</option>
          {academias.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} title="Filtrar por mês" />
        {mes && <button onClick={() => setMes("")}>Limpar mês</button>}
        <button onClick={exportar} disabled={!lista?.itens.length}>Exportar CSV</button>
      </div>

      <div className="cartao" style={{ overflowX: "auto" }}>
        {!lista ? <p className="mudo">Carregando…</p> : lista.itens.length === 0 ? <p className="mudo">Nenhum pagamento registrado{mes || academiaId ? " neste filtro" : ""}.</p> : (
          <>
            <p><b>{brl(lista.total_centavos)}</b> <span className="mudo">recebidos neste filtro (sem estornos) · {lista.itens.length} registro(s)</span></p>
            <table className="tabela-admin">
              <thead><tr><th>Data</th><th>Academia</th><th>Valor</th><th>Forma</th><th>Dias</th><th>Observação</th><th>Comprovante</th><th></th></tr></thead>
              <tbody>
                {lista.itens.map((p) => (
                  <tr key={p.id} style={p.estornado ? { opacity: 0.55 } : undefined}>
                    <td>{fmtData(p.data_pagamento)}</td>
                    <td>{p.academia}</td>
                    <td><b style={p.estornado ? { textDecoration: "line-through" } : undefined}>{brl(p.valor_centavos)}</b></td>
                    <td>{FORMA[p.forma] ?? p.forma}</td>
                    <td>{p.dias_concedidos}</td>
                    <td style={{ whiteSpace: "normal", maxWidth: 220 }}>{p.observacao ?? "—"}</td>
                    <td>
                      {p.comprovante ? <button className="link" onClick={() => ver(p)}>📎 {p.comprovante.nome}</button> : <span className="mudo">sem anexo</span>}{" "}
                      <label className="link" style={{ display: "inline", cursor: "pointer", marginBottom: 0 }}>
                        {p.comprovante ? "trocar" : "anexar"}
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => { anexar(p, e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                    </td>
                    <td>{p.estornado ? <span className="selo perigo">Estornado</span> : <button className="link" onClick={() => estornar(p)}>Estornar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}
