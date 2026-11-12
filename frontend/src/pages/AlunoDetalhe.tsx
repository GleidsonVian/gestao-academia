import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, baixarArquivo, fmtData, linkPais, type Aluno, type Avaliacao, type ConsentimentoImagem, type Frequencia, type Historico, type Presenca } from "../api";
import { useAuth } from "../auth";
import AlunoForm from "../components/AlunoForm";
import { brl } from "../api";
import { descricaoPedido, type Pedido } from "../uniformes";
import { linkEmail, linkWhats, montarMensagem, primeiroNome } from "../contato";
import { FrequenciaBox, ListaAvaliacoes, Medias } from "../components/Desempenho";

type Detalhe = { aluno: Aluno; frequencia: Frequencia; presencas: Presenca[]; avaliacoes: Avaliacao[]; media: Record<string, number>; historico_graduacao: Historico[]; consentimento_imagem: ConsentimentoImagem[] };

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
  const [obsImagem, setObsImagem] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  useEffect(() => { api.get<Pedido[]>(`/api/pedidos?aluno_id=${id}`).then(setPedidos).catch(() => setPedidos([])); }, [id]);
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
    const digitado = prompt(
      `ELIMINAÇÃO DEFINITIVA (LGPD)

Isso apaga ${a.nome}, a ficha de inscrição, os documentos enviados, a frequência, as avaliações e o histórico. Não dá para desfazer.

Para confirmar, digite o nome completo do aluno:`,
    );
    if (digitado === null) return;
    if (digitado.trim().toLowerCase() !== a.nome.trim().toLowerCase()) return alert("O nome não confere. Nada foi apagado.");
    await api.del(`/api/alunos/${a.id}`);
    nav("/alunos");
  }
  async function exportarDados() {
    await baixarArquivo(`/api/alunos/${a.id}/exportar`, `aluno-${a.id}-dados.json`);
  }
  async function registrarImagem(autorizado: boolean) {
    const msg = autorizado ? "Registrar que o responsável AUTORIZA o uso de imagem e voz?" : "Registrar a REVOGAÇÃO da autorização de uso de imagem e voz?";
    if (!confirm(msg)) return;
    await api.post(`/api/alunos/${a.id}/imagem`, { autorizado, observacao: obsImagem || null });
    setObsImagem("");
    carregar();
  }
  async function excluirAval(avId: number) {
    if (!confirm("Excluir esta avaliação?")) return;
    await api.del(`/api/avaliacoes/${avId}`);
    carregar();
  }

  // mensagem editável: {responsavel} vira o primeiro nome de quem vai receber
  const modelo = mensagem ?? `Olá, {responsavel}! Aqui é da ${me!.academia.nome}. Sobre ${a.nome}: `;
  const assunto = `Sobre ${a.nome} — ${me!.academia.nome}`;

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
            </div>
          </div>
          {a.email && <p>E-mail do aluno: {a.email}</p>}
          {a.observacoes && <p className="mudo">Obs.: {a.observacoes}</p>}
        </div>
      )}

      <div className="cartao">
        <h2>Responsáveis e contato</h2>
        {a.responsaveis.length === 0 ? (
          <p className="mudo">Nenhum responsável cadastrado. Use <b>Editar</b> para adicionar (nome, telefone e e-mail de cada um).</p>
        ) : (
          <>
            <label>
              Mensagem (use {"{responsavel}"} para o primeiro nome de quem recebe)
              <textarea rows={2} value={modelo} onChange={(e) => setMensagem(e.target.value)} />
            </label>
            <ul className="lista">
              {a.responsaveis.map((r, i) => {
                const texto = montarMensagem(modelo, r);
                const zap = linkWhats(r.telefone, texto);
                const mail = linkEmail(r.email, assunto, texto);
                return (
                  <li key={i}>
                    <span style={{ minWidth: 0 }}>
                      <b>{r.nome}</b> {r.parentesco && <small className="mudo">({r.parentesco})</small>} {i === 0 && <span className="selo">principal</span>}
                      <br />
                      <small className="mudo">{r.telefone || "sem telefone"} · {r.email || "sem e-mail"}</small>
                    </span>
                    <span className="alternar">
                      {zap ? <a className="botao" href={zap} target="_blank" rel="noreferrer">WhatsApp</a> : <button disabled>WhatsApp</button>}
                      {mail ? <a className="botao" href={mail}>E-mail</a> : <button disabled>E-mail</button>}
                      {r.telefone && <a className="botao" href={`tel:${r.telefone.replace(/[^\d+]/g, "")}`}>Ligar</a>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mudo" style={{ marginBottom: 0 }}>O WhatsApp abre a conversa pelo wa.me e o e-mail abre o seu programa de e-mail, já com destinatário, assunto ({assunto}) e mensagem.</p>
          </>
        )}
      </div>

      <div className="cartao">
        <h2>Link para os pais</h2>
        {a.link_ativo && a.token_pais ? (
          <>
            <input readOnly value={linkPais(a.token_pais)} onFocus={(e) => e.target.select()} />
            <div className="acoes">
              <button className="primario" onClick={copiar}>{copiado ? "Copiado!" : "Copiar link"}</button>
              {a.responsaveis.map((r, i) => {
                const href = linkWhats(r.telefone, `Olá, ${primeiroNome(r.nome)}! Acompanhe o desempenho de ${a.nome}: ${linkPais(a.token_pais!)}`);
                return href && <a key={i} className="botao" href={href} target="_blank" rel="noreferrer">Enviar link para {primeiroNome(r.nome)}</a>;
              })}
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

      <div className="cartao">
        <div className="topo">
          <h2>Uniformes</h2>
          <Link className="botao" to={`/uniformes?novo=1&aluno=${a.id}`}>+ Novo pedido</Link>
        </div>
        {pedidos.length === 0 ? <p className="mudo">Nenhum pedido de camisa ou uniforme para este aluno.</p> : (
          <ul className="lista">
            {pedidos.map((p) => (
              <li key={p.id}>
                <span><b>{descricaoPedido(p)}</b> <small className="mudo">{p.quantidade}x {brl(p.valor_unit_centavos)} = {brl(p.total_centavos)}</small></span>
                <span className="alternar">
                  {p.pago ? <span className="selo ok">Pago</span> : <span className="selo aviso">A pagar</span>}
                  {p.entregue ? <span className="selo ok">Entregue</span> : <span className="selo">A entregar</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cartao">
        <h2>Uso de imagem e voz</h2>
        <p>
          Situação atual:{" "}
          {a.autoriza_imagem === true ? <span className="selo ok">Autorizado</span>
            : a.autoriza_imagem === false ? <span className="selo aviso">Não autorizado / revogado</span>
            : <span className="selo">Sem registro</span>}
        </p>
        <input placeholder="Observação (opcional): ex. revogou por WhatsApp em 10/11" value={obsImagem} onChange={(e) => setObsImagem(e.target.value)} />
        <div className="acoes">
          <button onClick={() => registrarImagem(true)} disabled={a.autoriza_imagem === true}>Registrar autorização</button>
          <button className="perigo" onClick={() => registrarImagem(false)} disabled={a.autoriza_imagem === false}>Registrar revogação</button>
        </div>
        {d.consentimento_imagem.length > 0 && (
          <ul className="lista">
            {d.consentimento_imagem.map((c, i) => (
              <li key={i}>
                <span>
                  {c.autorizado ? "Autorizou" : "Revogou / não autorizou"}{" "}
                  <small className="mudo">({c.origem === "inscricao" ? "na inscrição" : "registrado no painel"}{c.termos_versao ? `, texto ${c.termos_versao}` : ""}){c.observacao ? ` — ${c.observacao}` : ""}</small>
                </span>
                <span className="mudo">{fmtData(c.em)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cartao zona-perigo">
        <h2>Privacidade e dados (LGPD)</h2>
        <p className="mudo">Direitos do titular: receber uma cópia dos dados ou pedir a eliminação definitiva.</p>
        <div className="acoes">
          <button onClick={exportarDados}>Exportar dados (JSON)</button>
          <button className="perigo" onClick={excluirAluno}>Excluir todos os dados do aluno</button>
        </div>
      </div>
    </>
  );
}
