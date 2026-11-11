import { useEffect, useState, type FormEvent } from "react";
import { api, type Aluno, type Turma } from "../api";
import { useAuth } from "../auth";

type Props = { aluno?: Aluno; onSalvo: () => void; onCancelar: () => void };

export default function AlunoForm({ aluno, onSalvo, onCancelar }: Props) {
  const { me } = useAuth();
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [erro, setErro] = useState("");
  const [f, setF] = useState({
    nome: aluno?.nome ?? "",
    apelido: aluno?.apelido ?? "",
    nascimento: aluno?.nascimento ?? "",
    turma_id: aluno?.turma_id ? String(aluno.turma_id) : "",
    graduacao: aluno?.graduacao ?? "",
    responsavel_nome: aluno?.responsavel_nome ?? "",
    responsavel_telefone: aluno?.responsavel_telefone ?? "",
    email: aluno?.email ?? "",
    observacoes: aluno?.observacoes ?? "",
    status: aluno?.status ?? "ativo",
  });

  useEffect(() => { api.get<Turma[]>("/api/turmas").then(setTurmas); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const body = { ...f, turma_id: f.turma_id ? Number(f.turma_id) : null, nascimento: f.nascimento || null };
    try {
      if (aluno) await api.put(`/api/alunos/${aluno.id}`, body);
      else await api.post("/api/alunos", body);
      onSalvo();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <form className="cartao form" onSubmit={salvar}>
      <h2>{aluno ? "Editar aluno" : "Novo aluno"}</h2>
      <div className="duas">
        <label>Nome completo<input required value={f.nome} onChange={set("nome")} /></label>
        <label>Apelido<input value={f.apelido} onChange={set("apelido")} /></label>
        <label>Nascimento<input type="date" value={f.nascimento} onChange={set("nascimento")} /></label>
        <label>
          Turma
          <select value={f.turma_id} onChange={set("turma_id")}>
            <option value="">Sem turma</option>
            {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
        <label>
          Graduação
          <select value={f.graduacao} onChange={set("graduacao")}>
            <option value="">—</option>
            {me!.academia.graduacoes.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label>Responsável<input value={f.responsavel_nome} onChange={set("responsavel_nome")} /></label>
        <label>Telefone / WhatsApp<input value={f.responsavel_telefone} onChange={set("responsavel_telefone")} /></label>
        <label>E-mail<input value={f.email} onChange={set("email")} /></label>
        {aluno && (
          <label>
            Situação
            <select value={f.status} onChange={set("status")}>
              <option value="ativo">Ativo</option>
              <option value="afastado">Afastado (ex.: lesão)</option>
              <option value="inativo">Inativo</option>
            </select>
          </label>
        )}
      </div>
      <label>Observações (internas)<textarea rows={3} value={f.observacoes} onChange={set("observacoes")} /></label>
      {erro && <p className="erro">{erro}</p>}
      <div className="acoes">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button className="primario">Salvar</button>
      </div>
    </form>
  );
}
