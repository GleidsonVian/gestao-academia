import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type Turma } from "../api";

export default function Turmas() {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [nome, setNome] = useState("");
  const [horario, setHorario] = useState("");

  const carregar = useCallback(() => { api.get<Turma[]>("/api/turmas").then(setTurmas); }, []);
  useEffect(carregar, [carregar]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    await api.post("/api/turmas", { nome, horario: horario || null });
    setNome(""); setHorario("");
    carregar();
  }
  async function excluir(t: Turma) {
    if (!confirm(`Excluir a turma "${t.nome}"? Os alunos ficam sem turma.`)) return;
    await api.del(`/api/turmas/${t.id}`);
    carregar();
  }

  return (
    <>
      <h1>Turmas</h1>
      <form className="cartao filtros" onSubmit={criar}>
        <input required placeholder="Nome (ex.: Infantil, Adulto iniciante)" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input placeholder="Horário (ex.: Seg/Qua 18h)" value={horario} onChange={(e) => setHorario(e.target.value)} />
        <button className="primario">Adicionar</button>
      </form>
      <div className="cartao">
        {turmas.length === 0 ? <p className="mudo">Nenhuma turma cadastrada.</p> : (
          <ul className="lista">
            {turmas.map((t) => (
              <li key={t.id}>
                <span>{t.nome} <small className="mudo">{t.horario}</small></span>
                <span><span className="selo">{t.alunos} alunos</span> <button className="link" onClick={() => excluir(t)}>Excluir</button></span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
