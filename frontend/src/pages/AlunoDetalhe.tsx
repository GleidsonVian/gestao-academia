import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, fmtData, linkPais, type Aluno, type Avaliacao, type Frequencia, type Historico, type Presenca } from "../api";
import { useAuth } from "../auth";
import AlunoForm from "../components/AlunoForm";
import { FrequenciaBox, ListaAvaliacoes, Medias } from "../components/Desempenho";

type Detalhe = { aluno: Aluno; frequencia: Frequencia; presencas: Presenca[]; avaliacoes: Avaliacao[]; media: Record<string, number>; historico_graduacao: Historico[] };

export default function AlunoDetalhe() {
  const { id } = useParams();
  const nav = useNavigate();
  const { me } = useAuth();
  const [d, setD] = useState<Detalhe | null>(null);
  const [editando, setEditando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(() => { api.get<Detalhe>(`/api/alunos/${id}`).then(setD).catch(() => nav("/alunos")); }, [id, nav]);
  useEffect(carregar, [carregar]);

  // nova avaliação
  const criterios = me!.academia.criterios;
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState("");
  const [visivel, setVisivel] = useState(true);
  useEffect(() => setNotas(Object.fromEntries(criterios.map((c) => [c, 5]))), [criterios]);

  if (!d) return <p className="mudo">Carregando…</p>;
  const a = d.aluno;

  async function avaliar(e: FormEvent) {
    e.preventDefault();
    await api.post(`/api/alunos/${a.id}/avaliacoes`, { notas, comentario, visivel_pais: visivel });
    setComentario("");
    carregar();
  }
  async function gerarLink() {
    if (a.link_ativo && !confirm("Gerar um novo link invalida o anterior. Continuar?")) return;
    await api.post(`/api/alunos/${a.id}/link`);
    carregar();
  }
  async function revogar() {
    if (!confirm("Desativar o link? Os pais perderão o acesso.")) return;
    await api.del(`/api/alunos/${a.id}/link`);
    carregar();
  }
  async function copiar() {
    await navigator.clipboard.writeText(linkPais(a.token_pais!));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }
  async function excluirAluno() {
    if (!confirm(`Excluir ${a.nome} definitivamente, com presenças e avaliações?`)) return;
    await api.del(`/api/alunos/${a.id}`);
    nav("/alunos");
  }
  async function excluirAval(avId: number) {
    if (!confirm("Excluir esta avaliação?")) return;
    await api.del(`/api/avaliacoes/${avId}`);
    carregar();
  }

  const whats = a.responsavel_telefone && a.token_pais
    ? `https://wa.me/55${a.responsavel_telefone.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá! Acompanhe o desempenho de ${a.nome}: ${linkPais(a.token_pais)}`)}`
    : null;

  return (
    <>
      <p><Link to="/alunos">← Alunos</Link></p>
      {editando ? (
        <AlunoForm aluno={a} onCancelar={() => setEditando(false)} onSalvo={() => { setEditando(false); carregar(); }} />
      ) : (
        <div className="cartao">
          <div className="topo">
            <div>
              <h1>{a.nome} {a.apelido && <span className="apelido">“{a.apelido}”</span>} {a.status !== "ativo" && <span className="selo aviso">{a.status === "afastado" ? "Afastado" : "Inativo"}</span>}</h1>
              <p className="mudo">{[a.graduacao, a.turma, a.nascimento && fmtData(a.nascimento)].filter(Boolean).join(" · ") || "Sem detalhes"}</p>
            </div>
            <div className="acoes">
              <button onClick={() => setEditando(true)}>Editar</button>
              <button className="perigo" onClick={excluirAluno}>Excluir</button>
            </div>
          </div>
          <p>Responsável: {a.responsavel_nome ?? "—"} · {a.responsavel_telefone ?? "sem telefone"} · {a.email ?? "sem e-mail"}</p>
          {a.observacoes && <p className="mudo">Obs.: {a.observacoes}</p>}
        </div>
      )}

      <div className="cartao">
        <h2>Link para os pais</h2>
        {a.link_ativo && a.token_pais ? (
          <>
            <input readOnly value={linkPais(a.token_pais)} onFocus={(e) => e.target.select()} />
            <div className="acoes">
              <button className="primario" onClick={copiar}>{copiado ? "Copiado!" : "Copiar link"}</button>
              {whats && <a className="botao" href={whats} target="_blank" rel="noreferrer">Enviar no WhatsApp</a>}
              <button onClick={gerarLink}>Gerar novo</button>
              <button className="perigo" onClick={revogar}>Desativar</button>
            </div>
          </>
        ) : (
          <>
            <p className="mudo">Gere um link para os pais acompanharem frequência e desempenho, sem precisar de login.</p>
            <button className="primario" onClick={gerarLink}>Gerar link</button>
          </>
        )}
      </div>

      <div className="grade2">
        <div className="cartao">
          <h2>Frequência</h2>
          <FrequenciaBox freq={d.frequencia} presencas={d.presencas} />
        </div>
        <div className="cartao">
          <h2>Média de desempenho</h2>
          <Medias media={d.media} />
        </div>
      </div>

      <form className="cartao form" onSubmit={avaliar}>
        <h2>Nova avaliação</h2>
        {criterios.map((c) => (
          <label key={c} className="nota">
            <span>{c}</span>
            <input type="range" min={0} max={10} step={0.5} value={notas[c] ?? 5} onChange={(e) => setNotas({ ...notas, [c]: Number(e.target.value) })} />
            <b>{notas[c] ?? 5}</b>
          </label>
        ))}
        <label>Comentário<textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={visivel} onChange={(e) => setVisivel(e.target.checked)} /> Mostrar aos pais</label>
        <button className="primario">Salvar avaliação</button>
      </form>

      <div className="cartao">
        <h2>Histórico de graduação</h2>
        {d.historico_graduacao.length ? (
          <ul className="lista">
            {d.historico_graduacao.map((h, i) => <li key={i}><span>{h.graduacao}</span><span className="mudo">{fmtData(h.data)}</span></li>)}
          </ul>
        ) : <p className="mudo">Sem registros.</p>}
      </div>

      <div className="cartao">
        <h2>Histórico de avaliações</h2>
        {d.avaliacoes.length ? <ListaAvaliacoes itens={d.avaliacoes} onExcluir={excluirAval} /> : <p className="mudo">Nenhuma avaliação ainda.</p>}
      </div>
    </>
  );
}
