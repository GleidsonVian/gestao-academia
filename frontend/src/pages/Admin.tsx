import { Fragment, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, brl, enviarArquivo, fmtData, type AcademiaAdmin, type Assinatura, type Receita } from "../api";
import { useAuth } from "../auth";
import AdminPagamentos from "./AdminPagamentos";

const ROTULO: Record<Assinatura["estado"], string> = {
  teste: "Em teste", ativa: "Ativa", tolerancia: "Em tolerância", vencida: "Vencida (bloqueada)", suspensa: "Suspensa", cancelada: "Cancelada",
};
const TOM: Record<Assinatura["estado"], string> = {
  teste: "", ativa: "ok", tolerancia: "aviso", vencida: "perigo", suspensa: "perigo", cancelada: "perigo",
};
const FORMAS = [["pix", "Pix"], ["boleto", "Boleto"], ["cartao", "Cartão"], ["transferencia", "Transferência"], ["dinheiro", "Dinheiro"], ["cortesia", "Cortesia"], ["outro", "Outro"]];
const hoje = () => new Date().toISOString().slice(0, 10);
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const paraNumero = (t: string) => Number(t.replace(/\./g, "").replace(",", "."));

type Dados = { resumo: Record<string, number>; total: number; academias: AcademiaAdmin[] };

/** Painel do dono do sistema: academias, assinaturas, pagamentos e receita (nunca dados de alunos). */
export default function Admin() {
  const { me } = useAuth();
  const [aba, setAba] = useState<"academias" | "pagamentos">("academias");
  const [d, setD] = useState<Dados | null>(null);
  const [rec, setRec] = useState<Receita | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [form, setForm] = useState({ status: "ativa" as Assinatura["status"], acesso_ate: "", valor: "" });
  const [pagando, setPagando] = useState<number | null>(null);
  const [pg, setPg] = useState({ valor: "", forma: "pix", data: hoje(), dias: "30", obs: "", estender: true });
  const [arquivo, setArquivo] = useState<File | null>(null);

  const carregar = useCallback(() => {
    api.get<Dados>("/admin/academias").then(setD).catch((e) => setErro(e.message));
    api.get<Receita>("/admin/receita").then(setRec).catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);
  const mostrarErro = useCallback((m: string) => setErro(m), []);

  if (!me!.usuario.is_superadmin) return <Navigate to="/" replace />;

  async function agir(fn: () => Promise<unknown>, ok = "") {
    setErro(""); setMsg("");
    try { await fn(); setMsg(ok); carregar(); } catch (e) { setErro((e as Error).message); }
  }
  const bloquear = (a: AcademiaAdmin) => {
    if (!confirm(`Bloquear o acesso de "${a.nome}" agora?`)) return;
    agir(() => api.put(`/admin/academias/${a.id}/assinatura`, { status: "suspensa", acesso_ate: a.acesso_ate }));
  };
  const liberar = (a: AcademiaAdmin) => agir(() => api.put(`/admin/academias/${a.id}/assinatura`, { status: "ativa", acesso_ate: a.acesso_ate }));

  function abrirPagamento(a: AcademiaAdmin) {
    setEditando(null); setPagando(a.id); setArquivo(null);
    setPg({ valor: a.valor_mensal_centavos ? (a.valor_mensal_centavos / 100).toFixed(2).replace(".", ",") : "", forma: "pix", data: hoje(), dias: "30", obs: "", estender: true });
  }
  function abrirEdicao(a: AcademiaAdmin) {
    setPagando(null); setEditando(a.id);
    setForm({ status: a.status, acesso_ate: a.acesso_ate ?? "", valor: a.valor_mensal_centavos ? (a.valor_mensal_centavos / 100).toFixed(2).replace(".", ",") : "" });
  }
  const salvarEdicao = (a: AcademiaAdmin) =>
    agir(async () => {
      await api.put(`/admin/academias/${a.id}/assinatura`, {
        status: form.status, acesso_ate: form.acesso_ate || null, valor_mensal: form.valor.trim() ? paraNumero(form.valor) : null,
      });
      setEditando(null);
    }, "Academia atualizada.");

  const registrarPagamento = (a: AcademiaAdmin) =>
    agir(async () => {
      const v = paraNumero(pg.valor || "0");
      if (Number.isNaN(v) || v < 0) throw new Error("Valor inválido");
      const r = await api.post<{ pagamento_id: number }>(`/admin/academias/${a.id}/pago`, {
        valor: v, forma: pg.forma, dias: Number(pg.dias) || 30, data_pagamento: pg.data, observacao: pg.obs || null, estender: pg.estender,
      });
      if (arquivo) await enviarArquivo(`/admin/pagamentos/${r.pagamento_id}/comprovante`, arquivo);
      setPagando(null);
    }, `Pagamento de "${a.nome}" registrado${arquivo ? " com comprovante" : ""}.`);

  const delta = rec && rec.mes_anterior > 0 ? Math.round(((rec.mes_atual - rec.mes_anterior) / rec.mes_anterior) * 100) : null;
  const maximo = rec ? Math.max(...rec.serie.map((s) => s.total_centavos), 1) : 1;

  return (
    <>
      <h1>Admin</h1>
      <p className="mudo">Você vê só dados das academias (situação, vencimento, valores). Nada de dados de alunos.</p>
      {erro && <p className="erro">{erro}</p>}
      {msg && <p className="ok-texto">{msg}</p>}

      {rec && (
        <>
          <div className="grade">
            <div className="cartao numero">
              <span>{brl(rec.mes_atual)}</span><small>Recebido no mês{delta !== null && ` (${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs. mês anterior)`}</small>
            </div>
            <div className="cartao numero"><span>{brl(rec.mrr_centavos)}</span><small>Receita mensal prevista · {rec.pagantes} pagante(s)</small></div>
            <div className="cartao numero"><span>{brl(rec.a_vencer_7d.valor_centavos)}</span><small>A vencer em 7 dias · {rec.a_vencer_7d.academias} academia(s)</small></div>
            <div className="cartao numero" style={rec.em_atraso.academias ? { borderColor: "var(--falta)" } : undefined}>
              <span>{brl(rec.em_atraso.valor_centavos)}</span><small>Em atraso · {rec.em_atraso.academias} academia(s)</small>
            </div>
            <div className="cartao numero"><span>{rec.em_teste}</span><small>Em teste{rec.testes_expirados ? ` · ${rec.testes_expirados} expirado(s)` : ""}</small></div>
            <div className="cartao numero"><span>{brl(rec.ticket_medio_centavos)}</span><small>Ticket médio · total já recebido {brl(rec.total_geral)}</small></div>
          </div>
          {rec.sem_valor_definido > 0 && (
            <div className="faixa aviso">{rec.sem_valor_definido} academia(s) pagante(s) sem mensalidade definida: use <b>Editar</b> para informar o valor e a previsão ficar correta.</div>
          )}
          <div className="cartao">
            <h2>Recebido nos últimos 6 meses</h2>
            <div className="barras-mes">
              {rec.serie.map((s) => (
                <div key={s.mes} className="barra-mes" title={`${s.mes}: ${brl(s.total_centavos)}`}>
                  <small>{brl(s.total_centavos)}</small>
                  <div className="coluna"><div style={{ height: `${Math.max((s.total_centavos / maximo) * 100, s.total_centavos ? 3 : 0)}%` }} /></div>
                  <small className="mudo">{MESES[Number(s.mes.slice(5)) - 1]}</small>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="filtros">
        <button className={aba === "academias" ? "primario" : ""} onClick={() => setAba("academias")}>Academias</button>
        <button className={aba === "pagamentos" ? "primario" : ""} onClick={() => setAba("pagamentos")}>Pagamentos</button>
      </div>

      {aba === "pagamentos" && d && <AdminPagamentos academias={d.academias} atualizar={carregar} erro={mostrarErro} />}

      {aba === "academias" && (
        <div className="cartao" style={{ overflowX: "auto" }}>
          {!d ? <p className="mudo">Carregando…</p> : (
            <table className="tabela-admin">
              <thead><tr><th>#</th><th>Academia</th><th>Responsável</th><th>Alunos</th><th>Situação</th><th>Acesso até</th><th>Mensalidade</th><th>Último pgto</th><th>Ações</th></tr></thead>
              <tbody>
                {d.academias.map((a) => (
                  <Fragment key={a.id}>
                    <tr>
                      <td>{a.id}</td>
                      <td><b>{a.nome}</b><br /><small className="mudo">{a.modalidade}</small></td>
                      <td>{a.email_dono ?? "—"}</td>
                      <td>{a.alunos}</td>
                      <td>
                        <span className={`selo ${TOM[a.estado]}`}>{ROTULO[a.estado]}</span>
                        {a.dias_restantes !== null && <small className="mudo"> {a.estado === "tolerancia" ? `bloqueia em ${a.dias_restantes}d` : `${a.dias_restantes}d`}</small>}
                      </td>
                      <td>{fmtData(a.acesso_ate)}</td>
                      <td>{a.valor_mensal_centavos ? brl(a.valor_mensal_centavos) : <span className="mudo">—</span>}</td>
                      <td>{a.ultimo_pagamento ? fmtData(a.ultimo_pagamento) : <span className="mudo">nunca</span>}<br /><small className="mudo">{a.total_pago_centavos ? `total ${brl(a.total_pago_centavos)}` : ""}</small></td>
                      <td className="acoes" style={{ marginTop: 0 }}>
                        <button className="primario" onClick={() => (pagando === a.id ? setPagando(null) : abrirPagamento(a))}>Registrar pagamento</button>
                        {a.status === "suspensa" || a.status === "cancelada"
                          ? <button onClick={() => liberar(a)}>Liberar</button>
                          : <button className="perigo" onClick={() => bloquear(a)}>Bloquear</button>}
                        <button onClick={() => (editando === a.id ? setEditando(null) : abrirEdicao(a))}>Editar</button>
                      </td>
                    </tr>

                    {pagando === a.id && (
                      <tr className="editar">
                        <td colSpan={9}>
                          <b>Registrar pagamento — {a.nome}</b>
                          <div className="duas" style={{ marginTop: ".5rem" }}>
                            <label>Valor pago (R$)<input inputMode="decimal" placeholder="ex.: 99,90 (0 = cortesia)" value={pg.valor} onChange={(e) => setPg({ ...pg, valor: e.target.value })} /></label>
                            <label>Forma
                              <select value={pg.forma} onChange={(e) => setPg({ ...pg, forma: e.target.value })}>
                                {FORMAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                              </select>
                            </label>
                            <label>Data do pagamento<input type="date" max={hoje()} value={pg.data} onChange={(e) => setPg({ ...pg, data: e.target.value })} /></label>
                            <label>Dias de acesso concedidos<input type="number" min={1} max={366} value={pg.dias} onChange={(e) => setPg({ ...pg, dias: e.target.value })} /></label>
                          </div>
                          <label>Observação (opcional)<input value={pg.obs} onChange={(e) => setPg({ ...pg, obs: e.target.value })} placeholder="ex.: Pix de Paulo Ricardo, 1ª mensalidade" /></label>
                          <label>Comprovante (opcional — PDF, JPG ou PNG até 5 MB)
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                          </label>
                          <label className="check">
                            <input type="checkbox" checked={pg.estender} onChange={(e) => setPg({ ...pg, estender: e.target.checked })} />
                            Estender o acesso (desmarque para só registrar um pagamento que já foi considerado no vencimento)
                          </label>
                          <div className="acoes">
                            <button className="primario" onClick={() => registrarPagamento(a)}>Salvar pagamento</button>
                            <button onClick={() => setPagando(null)}>Cancelar</button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {editando === a.id && (
                      <tr className="editar">
                        <td colSpan={9}>
                          <div className="filtros" style={{ marginBottom: 0 }}>
                            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Assinatura["status"] })}>
                              <option value="teste">Teste</option><option value="ativa">Ativa</option>
                              <option value="suspensa">Suspensa (bloqueada)</option><option value="cancelada">Cancelada (bloqueada)</option>
                            </select>
                            <input type="date" value={form.acesso_ate} onChange={(e) => setForm({ ...form, acesso_ate: e.target.value })} title="Acesso até" />
                            <input inputMode="decimal" placeholder="Mensalidade (R$)" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} style={{ maxWidth: 170 }} />
                            <button className="primario" onClick={() => salvarEdicao(a)}>Salvar</button>
                            <button onClick={() => setEditando(null)}>Cancelar</button>
                          </div>
                          <small className="mudo">Data vazia = acesso sem vencimento (“acesso até” é o último dia liberado). A mensalidade só alimenta a previsão de receita.</small>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
