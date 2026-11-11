import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { abrirDocumento, api, fmtData, linkInscricao, type Inscricao, type Turma } from "../api";
import { useAuth } from "../auth";

const ROTULO = { pendente: "Pendentes", aprovada: "Aprovadas", recusada: "Recusadas" } as const;

export default function Inscricoes() {
  const { me } = useAuth();
  const [status, setStatus] = useState<keyof typeof ROTULO>("pendente");
  const [lista, setLista] = useState<Inscricao[] | null>(null);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [tk, setTk] = useState<string | null | undefined>(undefined);
  const [copiado, setCopiado] = useState(false);
  const [escolhas, setEscolhas] = useState<Record<number, { turma: string; grad: string }>>({});

  const carregar = useCallback(() => { api.get<Inscricao[]>(`/api/inscricoes?status=${status}`).then(setLista); }, [status]);
  useEffect(carregar, [carregar]);
  useEffect(() => {
    api.get<Turma[]>("/api/turmas").then(setTurmas);
    api.get<{ token: string }>("/api/inscricao-link").then((r) => setTk(r.token));
  }, []);

  async function copiar() {
    await navigator.clipboard.writeText(linkInscricao(tk!));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }
  async function renovar() {
    if (tk && !confirm("Gerar um novo link desativa o anterior. Continuar?")) return;
    setTk((await api.post<{ token: string }>("/api/inscricao-link")).token);
  }
  async function desativar() {
    if (!confirm("Desativar o link? Ninguém poderá mais se inscrever até você gerar outro.")) return;
    await api.del("/api/inscricao-link");
    setTk(null);
  }
  const esc = (id: number) => escolhas[id] ?? { turma: "", grad: "" };
  const setEsc = (id: number, v: Partial<{ turma: string; grad: string }>) => setEscolhas({ ...escolhas, [id]: { ...esc(id), ...v } });

  async function aprovar(i: Inscricao) {
    const e = esc(i.id);
    await api.post(`/api/inscricoes/${i.id}/aprovar`, { turma_id: e.turma ? Number(e.turma) : null, graduacao: e.grad || null });
    carregar();
  }
  async function recusar(i: Inscricao) {
    if (!confirm(`Recusar a inscrição de ${i.nome}?`)) return;
    await api.post(`/api/inscricoes/${i.id}/recusar`);
    carregar();
  }
  async function apagarDados(i: Inscricao) {
    if (!confirm(`Apagar definitivamente a ficha de ${i.nome} e os documentos enviados? Não dá para desfazer.`)) return;
    await api.del(`/api/inscricoes/${i.id}`);
    carregar();
  }
  const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

  return (
    <>
      <h1>Inscrições</h1>

      <div className="cartao">
        <h2>Link de inscrição</h2>
        {tk ? (
          <>
            <p className="mudo">Envie este link aos responsáveis. Eles preenchem a ficha e você aprova aqui.</p>
            <input readOnly value={linkInscricao(tk)} onFocus={(e) => e.target.select()} />
            <div className="acoes">
              <button className="primario" onClick={copiar}>{copiado ? "Copiado!" : "Copiar link"}</button>
              <a className="botao" href={`https://wa.me/?text=${encodeURIComponent(`Inscrições abertas na ${me!.academia.nome}: ${linkInscricao(tk)}`)}`} target="_blank" rel="noreferrer">Compartilhar no WhatsApp</a>
              <button onClick={renovar}>Gerar novo</button>
              <button className="perigo" onClick={desativar}>Desativar</button>
            </div>
          </>
        ) : tk === null ? (
          <><p className="mudo">Inscrições fechadas.</p><button className="primario" onClick={renovar}>Gerar link</button></>
        ) : <p className="mudo">Carregando…</p>}
      </div>

      <div className="filtros">
        {(Object.keys(ROTULO) as (keyof typeof ROTULO)[]).map((s) => (
          <button key={s} className={status === s ? "primario" : ""} onClick={() => setStatus(s)}>{ROTULO[s]}</button>
        ))}
      </div>

      {!lista ? <p className="mudo">Carregando…</p> : lista.length === 0 ? <div className="cartao"><p className="mudo">Nenhuma inscrição {ROTULO[status].toLowerCase()}.</p></div> : lista.map((i) => (
        <div className="cartao" key={i.id}>
          <div className="topo">
            <div>
              <h2>{i.nome}</h2>
              <p className="mudo">Nascimento {fmtData(i.nascimento)} · enviada em {fmtData(i.criado_em)}</p>
            </div>
            {i.status === "aprovada" && i.aluno_id && <Link to={`/alunos/${i.aluno_id}`}>Ver aluno →</Link>}
          </div>
          <p>Responsável: <b>{i.responsavel_nome}</b> · {i.responsavel_telefone}{i.email && ` · ${i.email}`}</p>
          {i.observacoes && <p className="mudo">Obs.: {i.observacoes}</p>}
          <p><span className={i.autoriza_imagem ? "selo ok" : "selo"}>{i.autoriza_imagem ? "Autoriza uso de imagem" : "Sem autorização de imagem"}</span></p>
          <p className="mudo">Declaração de saúde e responsabilidade aceita em {fmtData(i.aceite_em)}{i.termos_versao && ` (texto ${i.termos_versao})`}.</p>
          {i.documentos.length > 0 && (
            <div className="acoes">
              {i.documentos.map((d) => (
                <button key={d.id} onClick={() => abrirDocumento(`/api/inscricoes/${i.id}/documentos/${d.id}`)}>📎 {d.nome} <small className="mudo">({kb(d.tamanho)})</small></button>
              ))}
            </div>
          )}
          {i.status === "pendente" && (
            <div className="filtros" style={{ marginTop: "1rem", marginBottom: 0 }}>
              <select value={esc(i.id).turma} onChange={(e) => setEsc(i.id, { turma: e.target.value })}>
                <option value="">Turma (definir depois)</option>
                {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
              <select value={esc(i.id).grad} onChange={(e) => setEsc(i.id, { grad: e.target.value })}>
                <option value="">Graduação inicial</option>
                {me!.academia.graduacoes.map((g) => <option key={g}>{g}</option>)}
              </select>
              <button className="primario" onClick={() => aprovar(i)}>Aprovar e matricular</button>
              <button className="perigo" onClick={() => recusar(i)}>Recusar</button>
            </div>
          )}
          {i.status === "recusada" && (
            <div className="acoes"><button className="perigo" onClick={() => apagarDados(i)}>Apagar dados e documentos (LGPD)</button></div>
          )}
        </div>
      ))}
    </>
  );
}
