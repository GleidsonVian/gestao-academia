import { Fragment, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, fmtData, type AcademiaAdmin, type Assinatura } from "../api";
import { useAuth } from "../auth";

const ROTULO: Record<Assinatura["estado"], string> = {
  teste: "Em teste", ativa: "Ativa", tolerancia: "Em tolerância", vencida: "Vencida (bloqueada)", suspensa: "Suspensa", cancelada: "Cancelada",
};
const TOM: Record<Assinatura["estado"], string> = {
  teste: "", ativa: "ok", tolerancia: "aviso", vencida: "perigo", suspensa: "perigo", cancelada: "perigo",
};

type Dados = { resumo: Record<string, number>; total: number; academias: AcademiaAdmin[] };

/** Painel do dono do sistema: mostra só dados das academias (nunca de alunos). */
export default function Admin() {
  const { me } = useAuth();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [form, setForm] = useState({ status: "ativa" as Assinatura["status"], acesso_ate: "" });
  const [dias, setDias] = useState(30);

  const carregar = useCallback(() => { api.get<Dados>("/admin/academias").then(setD).catch((e) => setErro(e.message)); }, []);
  useEffect(carregar, [carregar]);

  if (!me!.usuario.is_superadmin) return <Navigate to="/" replace />;

  async function agir(fn: () => Promise<unknown>) {
    setErro("");
    try { await fn(); carregar(); } catch (e) { setErro((e as Error).message); }
  }
  const pago = (a: AcademiaAdmin) => agir(() => api.post(`/admin/academias/${a.id}/pago`, { dias }));
  const bloquear = (a: AcademiaAdmin) => {
    if (!confirm(`Bloquear o acesso de "${a.nome}" agora?`)) return;
    agir(() => api.put(`/admin/academias/${a.id}/assinatura`, { status: "suspensa", acesso_ate: a.acesso_ate }));
  };
  const liberar = (a: AcademiaAdmin) =>
    agir(() => api.put(`/admin/academias/${a.id}/assinatura`, { status: "ativa", acesso_ate: a.acesso_ate }));
  function abrirEdicao(a: AcademiaAdmin) {
    setEditando(a.id);
    setForm({ status: a.status, acesso_ate: a.acesso_ate ?? "" });
  }
  const salvar = (a: AcademiaAdmin) =>
    agir(async () => {
      await api.put(`/admin/academias/${a.id}/assinatura`, { status: form.status, acesso_ate: form.acesso_ate || null });
      setEditando(null);
    });

  return (
    <>
      <h1>Admin — academias</h1>
      <p className="mudo">Você vê só dados das academias (nome, status, vencimento, quantidade de alunos). Nada de dados de alunos.</p>
      {erro && <p className="erro">{erro}</p>}

      {d && (
        <div className="grade">
          <div className="cartao numero"><span>{d.total}</span><small>Academias</small></div>
          {(Object.keys(ROTULO) as Assinatura["estado"][]).filter((k) => d.resumo[k]).map((k) => (
            <div className="cartao numero" key={k}><span>{d.resumo[k]}</span><small>{ROTULO[k]}</small></div>
          ))}
        </div>
      )}

      <div className="filtros">
        <label className="check" style={{ margin: 0 }}>
          Dias ao marcar pagamento:
          <input type="number" min={1} max={366} value={dias} onChange={(e) => setDias(Number(e.target.value) || 30)} style={{ width: 90 }} />
        </label>
      </div>

      <div className="cartao" style={{ overflowX: "auto" }}>
        {!d ? <p className="mudo">Carregando…</p> : (
          <table className="tabela-admin">
            <thead><tr><th>#</th><th>Academia</th><th>Responsável</th><th>Alunos</th><th>Situação</th><th>Acesso até</th><th>Ações</th></tr></thead>
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
                    <td className="acoes" style={{ marginTop: 0 }}>
                      <button className="primario" onClick={() => pago(a)}>Pago +{dias}d</button>
                      {a.status === "suspensa" || a.status === "cancelada"
                        ? <button onClick={() => liberar(a)}>Liberar</button>
                        : <button className="perigo" onClick={() => bloquear(a)}>Bloquear</button>}
                      <button onClick={() => (editando === a.id ? setEditando(null) : abrirEdicao(a))}>Editar</button>
                    </td>
                  </tr>
                  {editando === a.id && (
                    <tr className="editar">
                      <td colSpan={7}>
                        <div className="filtros" style={{ marginBottom: 0 }}>
                          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Assinatura["status"] })}>
                            <option value="teste">Teste</option><option value="ativa">Ativa</option>
                            <option value="suspensa">Suspensa (bloqueada)</option><option value="cancelada">Cancelada (bloqueada)</option>
                          </select>
                          <input type="date" value={form.acesso_ate} onChange={(e) => setForm({ ...form, acesso_ate: e.target.value })} />
                          <button className="primario" onClick={() => salvar(a)}>Salvar</button>
                          <button onClick={() => setEditando(null)}>Cancelar</button>
                        </div>
                        <small className="mudo">Deixe a data vazia para acesso sem vencimento. “Acesso até” é o último dia liberado.</small>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
