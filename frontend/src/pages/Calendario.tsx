import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtData, type Aula, type Turma } from "../api";

const hoje = () => new Date().toISOString().slice(0, 10);
const DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (d: string) => DIA[new Date(`${d}T12:00:00`).getDay()];
const tom = { programada: "", realizada: "ok", cancelada: "aviso" } as const;

export default function Calendario() {
  const nav = useNavigate();
  const [aulas, setAulas] = useState<Aula[] | null>(null);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [form, setForm] = useState({ data: hoje(), hora: "18:30", titulo: "Aula", turma_id: "" });
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => { api.get<Aula[]>("/api/aulas").then(setAulas); }, []);
  useEffect(() => { carregar(); api.get<Turma[]>("/api/turmas").then(setTurmas); }, [carregar]);

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    try {
      await api.post("/api/aulas", { ...form, turma_id: form.turma_id ? Number(form.turma_id) : null });
      setAberto(false);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }
  async function mudarStatus(a: Aula, status: Aula["status"]) {
    await api.put(`/api/aulas/${a.id}`, { data: a.data, hora: a.hora, titulo: a.titulo, turma_id: a.turma_id, status });
    carregar();
  }
  async function excluir(a: Aula) {
    if (!confirm(`Excluir a aula de ${fmtData(a.data)}? A chamada registrada nela também será apagada.`)) return;
    await api.del(`/api/aulas/${a.id}`);
    carregar();
  }

  return (
    <>
      <div className="topo">
        <h1>Calendário de aulas</h1>
        <button className="primario" onClick={() => setAberto(!aberto)}>+ Adicionar aula</button>
      </div>
      <p className="mudo">Uma aula programada não conta na frequência. Só depois de marcada como <b>realizada</b> ela libera a chamada e entra no cálculo. Aulas canceladas ficam fora.</p>

      {aberto && (
        <form className="cartao form" onSubmit={adicionar}>
          <div className="duas">
            <label>Data<input type="date" required value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
            <label>Horário<input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} /></label>
            <label>Descrição<input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></label>
            <label>
              Turma
              <select value={form.turma_id} onChange={(e) => setForm({ ...form, turma_id: e.target.value })}>
                <option value="">Todas as turmas</option>
                {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </label>
          </div>
          {erro && <p className="erro">{erro}</p>}
          <div className="acoes"><button type="button" onClick={() => setAberto(false)}>Cancelar</button><button className="primario">Adicionar</button></div>
        </form>
      )}

      <div className="cartao">
        {!aulas ? <p className="mudo">Carregando…</p> : aulas.length === 0 ? <p className="mudo">Adicione a primeira aula ao calendário.</p> : (
          <ul className="lista">
            {aulas.map((a) => (
              <li key={a.id}>
                <span>
                  <b>{fmtData(a.data)}</b> <small className="mudo">{diaSemana(a.data)}{a.hora && ` · ${a.hora}`}</small><br />
                  {a.titulo} <small className="mudo">{a.turma ?? "Todas as turmas"}</small>
                  {a.status === "realizada" && <small className="mudo"> · {a.presentes} presentes, {a.faltas} faltas, {a.justificadas} just.</small>}
                </span>
                <span className="alternar">
                  <span className={`selo ${tom[a.status]}`}>{a.status}</span>
                  <select value={a.status} onChange={(e) => mudarStatus(a, e.target.value as Aula["status"])} style={{ width: "auto" }}>
                    <option value="programada">Programada</option>
                    <option value="realizada">Realizada</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                  <button disabled={a.status !== "realizada"} onClick={() => nav(`/chamada?aula=${a.id}`)}>Chamada</button>
                  <button className="link" onClick={() => excluir(a)}>Excluir</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
