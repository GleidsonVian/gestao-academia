import { useEffect, useState, type FormEvent } from "react";
import { api, type Aluno, type Responsavel, type Turma } from "../api";
import { useAuth } from "../auth";
import { PARENTESCOS } from "../contato";

type Props = { aluno?: Aluno; onSalvo: () => void; onCancelar: () => void };
const vazio = (): Responsavel => ({ nome: "", parentesco: "", telefone: "", email: "" });
const MAX_RESPONSAVEIS = 8;

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
    email: aluno?.email ?? "",
    observacoes: aluno?.observacoes ?? "",
    status: aluno?.status ?? "ativo",
  });
  const [resp, setResp] = useState<Responsavel[]>(
    aluno?.responsaveis?.length ? aluno.responsaveis.map((r) => ({ ...r, parentesco: r.parentesco ?? "", telefone: r.telefone ?? "", email: r.email ?? "" })) : [vazio()],
  );

  useEffect(() => { api.get<Turma[]>("/api/turmas").then(setTurmas); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  const mudar = (i: number, k: keyof Responsavel) => (e: React.ChangeEvent<any>) =>
    setResp(resp.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  const remover = (i: number) => setResp(resp.filter((_, j) => j !== i));
  const tornarPrincipal = (i: number) => setResp([resp[i], ...resp.filter((_, j) => j !== i)]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    // linhas totalmente vazias são ignoradas; telefone ou e-mail sem nome não pode
    const preenchidas = resp.filter((r) => r.nome.trim() || r.telefone?.trim() || r.email?.trim());
    if (preenchidas.some((r) => !r.nome.trim())) return setErro("Informe o nome de cada responsável que tiver telefone ou e-mail.");
    const body = {
      ...f, turma_id: f.turma_id ? Number(f.turma_id) : null, nascimento: f.nascimento || null,
      responsaveis: preenchidas.map(({ nome, parentesco, telefone, email }) => ({ nome, parentesco: parentesco || null, telefone: telefone || null, email: email || null })),
    };
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
        <label>E-mail do aluno (opcional)<input value={f.email} onChange={set("email")} /></label>
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

      <h2 style={{ fontSize: ".95rem", marginTop: "1rem" }}>Responsáveis</h2>
      <p className="mudo" style={{ marginTop: 0 }}>Adicione quantos precisar (pai, mãe, avó...). Cada um com o seu telefone e e-mail; o primeiro é o principal.</p>
      {resp.map((r, i) => (
        <div className="painel" key={i} style={{ marginTop: ".5rem" }}>
          <div className="duas">
            <label>Nome{i === 0 && " (principal)"}<input value={r.nome} onChange={mudar(i, "nome")} /></label>
            <label>
              Parentesco
              <select value={r.parentesco ?? ""} onChange={mudar(i, "parentesco")}>
                <option value="">—</option>
                {PARENTESCOS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label>Telefone / WhatsApp<input inputMode="tel" placeholder="(27) 99999-9999" value={r.telefone ?? ""} onChange={mudar(i, "telefone")} /></label>
            <label>E-mail<input type="email" placeholder="nome@exemplo.com" value={r.email ?? ""} onChange={mudar(i, "email")} /></label>
          </div>
          <div className="acoes" style={{ marginTop: 0 }}>
            {i > 0 && <button type="button" className="link" onClick={() => tornarPrincipal(i)}>Tornar principal</button>}
            {resp.length > 1 && <button type="button" className="link" style={{ color: "var(--falta)" }} onClick={() => remover(i)}>Remover</button>}
          </div>
        </div>
      ))}
      {resp.length < MAX_RESPONSAVEIS && (
        <div className="acoes"><button type="button" onClick={() => setResp([...resp, vazio()])}>+ Adicionar responsável</button></div>
      )}

      <label style={{ marginTop: ".75rem" }}>Observações (internas)<textarea rows={3} value={f.observacoes} onChange={set("observacoes")} /></label>
      {erro && <p className="erro">{erro}</p>}
      <div className="acoes">
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button className="primario">Salvar</button>
      </div>
    </form>
  );
}
