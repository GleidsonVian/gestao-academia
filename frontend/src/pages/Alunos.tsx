import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Aluno } from "../api";
import AlunoForm from "../components/AlunoForm";

export default function Alunos() {
  const [lista, setLista] = useState<Aluno[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ativo" | "afastado" | "inativo">("ativo");
  const [novo, setNovo] = useState(false);

  const carregar = useCallback(() => {
    api.get<Aluno[]>(`/api/alunos?status=${status}&q=${encodeURIComponent(q)}`).then(setLista);
  }, [q, status]);
  useEffect(() => { const t = setTimeout(carregar, 200); return () => clearTimeout(t); }, [carregar]);

  return (
    <>
      <div className="topo">
        <h1>Alunos</h1>
        <button className="primario" onClick={() => setNovo(true)}>+ Novo aluno</button>
      </div>

      {novo && <AlunoForm onCancelar={() => setNovo(false)} onSalvo={() => { setNovo(false); carregar(); }} />}

      <div className="filtros">
        <input placeholder="Buscar por nome ou apelido…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value as "ativo" | "afastado" | "inativo")}>
          <option value="ativo">Ativos</option>
          <option value="afastado">Afastados</option>
          <option value="inativo">Inativos</option>
        </select>
      </div>

      <div className="cartao">
        {!lista ? <p className="mudo">Carregando…</p> : lista.length === 0 ? <p className="mudo">Nenhum aluno encontrado.</p> : (
          <table>
            <thead><tr><th>Nome</th><th>Apelido</th><th>Turma</th><th>Graduação</th><th>Responsável</th><th>Link pais</th></tr></thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/alunos/${a.id}`}>{a.nome}</Link></td>
                  <td>{a.apelido ?? "—"}</td>
                  <td>{a.turma ?? "—"}</td>
                  <td>{a.graduacao ?? "—"}</td>
                  <td>{a.responsavel_nome ?? "—"}</td>
                  <td>{a.link_ativo ? <span className="selo ok">Ativo</span> : <span className="selo">Não gerado</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
