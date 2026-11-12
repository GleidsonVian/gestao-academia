import { useEffect, useMemo, useState } from "react";
import { api, fmtData, type Aula } from "../api";
import {
  MODELO_CANCELAMENTO, chaveDest, emailTodos, enviadosSalvos, lembrarEnviados, lembrarModelo, linkGrupo, modeloSalvo, preencher,
  type ContextoAviso, type Destinatario,
} from "../aviso";
import { linkEmail, linkWhats } from "../contato";

type Dados = { aula: Aula; academia: string; total_alunos: number; responsaveis: Destinatario[]; alunos_sem_contato: string[] };

/** Aviso de aula cancelada: mensagem pronta para o grupo da turma ou para cada responsável (WhatsApp/e-mail). */
export default function AvisoAula({ aulaId, onFechar }: { aulaId: number; onFechar: () => void }) {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [modelo, setModelo] = useState(modeloSalvo);
  const [enviados, setEnviados] = useState<string[]>(() => enviadosSalvos(aulaId));
  const [copiado, setCopiado] = useState("");

  useEffect(() => {
    api.get<Dados>(`/api/aulas/${aulaId}/destinatarios`).then(setD).catch((e) => setErro(e.message));
  }, [aulaId]);

  const ctx: ContextoAviso | null = d && { academia: d.academia, turma: d.aula.turma, data: d.aula.data, hora: d.aula.hora };
  const alvos = d?.responsaveis ?? [];
  const pendentes = alvos.filter((r) => linkWhats(r.telefone, "x") && !enviados.includes(chaveDest(r)));
  const comWhats = alvos.filter((r) => linkWhats(r.telefone, "x"));
  const assunto = d ? `Aula cancelada: ${d.aula.turma ?? "todas as turmas"}, ${fmtData(d.aula.data)}` : "";
  const textoGrupo = useMemo(() => (ctx ? preencher(modelo, ctx) : ""), [modelo, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const email = ctx ? emailTodos(alvos.map((r) => r.email ?? ""), assunto, textoGrupo) : { href: null, longo: false };

  function marcar(r: Destinatario, avisado: boolean) {
    const k = chaveDest(r);
    const novo = avisado ? Array.from(new Set([...enviados, k])) : enviados.filter((x) => x !== k);
    setEnviados(novo);
    lembrarEnviados(aulaId, novo);
  }
  function proximo() {
    const r = pendentes[0];
    if (!r || !ctx) return;
    window.open(linkWhats(r.telefone, preencher(modelo, ctx, r))!, "_blank", "noopener");
    marcar(r, true);
  }
  async function copiar(texto: string, rotulo: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(rotulo); setTimeout(() => setCopiado(""), 2000); } catch { setErro("Não consegui copiar. Selecione o texto e copie manualmente."); }
  }
  const mudarModelo = (v: string) => { setModelo(v); lembrarModelo(v); };

  if (erro && !d) return <div className="painel"><p className="erro">{erro}</p><button onClick={onFechar}>Fechar</button></div>;
  if (!d || !ctx) return <div className="painel"><p className="mudo">Carregando responsáveis…</p></div>;

  return (
    <div className="painel" style={{ width: "100%" }}>
      <div className="topo">
        <b>Avisar sobre a aula cancelada — {d.aula.turma ?? "todas as turmas"}, {fmtData(d.aula.data)}</b>
        <button className="link" onClick={onFechar}>Fechar</button>
      </div>
      <p className="mudo" style={{ margin: ".25rem 0 .5rem" }}>{d.total_alunos} aluno(s) · {alvos.length} pessoa(s) a avisar (quem tem mais de um filho na turma recebe uma mensagem só).</p>

      <label>
        Mensagem (editável; fica salva para os próximos avisos). Use {"{responsavel} {alunos} {academia} {dia} {data} {hora} {turma}"}
        <textarea rows={4} value={modelo} onChange={(e) => mudarModelo(e.target.value)} />
      </label>
      <div className="acoes" style={{ marginTop: 0 }}>
        <button className="link" onClick={() => mudarModelo(MODELO_CANCELAMENTO)}>Restaurar mensagem padrão</button>
      </div>

      <h3 style={{ fontSize: ".9rem", margin: "1rem 0 .4rem" }}>1. Grupo de WhatsApp da turma (de uma vez)</h3>
      <p className="mudo" style={{ margin: "0 0 .4rem", whiteSpace: "pre-wrap" }}>{textoGrupo}</p>
      <div className="acoes" style={{ marginTop: 0 }}>
        <button className="primario" onClick={() => copiar(textoGrupo, "grupo")}>{copiado === "grupo" ? "Copiado!" : "Copiar mensagem"}</button>
        <a className="botao" href={linkGrupo(textoGrupo)} target="_blank" rel="noreferrer">Abrir WhatsApp e escolher o grupo</a>
      </div>

      <h3 style={{ fontSize: ".9rem", margin: "1rem 0 .4rem" }}>2. Um por um ({enviados.filter((k) => alvos.some((r) => chaveDest(r) === k)).length} de {alvos.length} avisados)</h3>
      <div className="acoes" style={{ marginTop: 0 }}>
        <button className="primario" onClick={proximo} disabled={!pendentes.length}>
          {pendentes.length ? `Avisar próximo (${pendentes.length} restante${pendentes.length > 1 ? "s" : ""})` : comWhats.length ? "Todos avisados ✓" : "Ninguém com telefone"}
        </button>
        {enviados.length > 0 && <button className="link" onClick={() => { setEnviados([]); lembrarEnviados(aulaId, []); }}>Limpar marcações</button>}
      </div>
      <ul className="lista">
        {alvos.map((r) => {
          const k = chaveDest(r), feito = enviados.includes(k);
          const texto = preencher(modelo, ctx, r);
          const zap = linkWhats(r.telefone, texto), mail = linkEmail(r.email, assunto, texto);
          return (
            <li key={k} style={{ opacity: feito ? 0.6 : 1 }}>
              <span style={{ minWidth: 0 }}>
                <b>{r.nome}</b> {r.parentesco && <small className="mudo">({r.parentesco})</small>}<br />
                <small className="mudo">{r.alunos.join(", ")} · {r.telefone || "sem telefone"}{r.email ? ` · ${r.email}` : ""}</small>
              </span>
              <span className="alternar">
                {zap ? <a className="botao" href={zap} target="_blank" rel="noreferrer" onClick={() => marcar(r, true)}>WhatsApp</a> : <button disabled>WhatsApp</button>}
                {mail ? <a className="botao" href={mail} onClick={() => marcar(r, true)}>E-mail</a> : <button disabled>E-mail</button>}
                <label className="check" style={{ margin: 0 }}>
                  <input type="checkbox" checked={feito} onChange={(e) => marcar(r, e.target.checked)} /> avisado
                </label>
              </span>
            </li>
          );
        })}
      </ul>

      <h3 style={{ fontSize: ".9rem", margin: "1rem 0 .4rem" }}>3. E-mail para todos (cópia oculta)</h3>
      {email.href ? (
        <div className="acoes" style={{ marginTop: 0 }}>
          {!email.longo && <a className="botao" href={email.href}>Abrir e-mail para todos</a>}
          <button onClick={() => copiar(alvos.map((r) => r.email).filter(Boolean).join(", "), "emails")}>{copiado === "emails" ? "Copiado!" : "Copiar os e-mails"}</button>
          {email.longo && <small className="mudo">São muitos e-mails para um só link: copie a lista e cole em &quot;Cco&quot;.</small>}
        </div>
      ) : <p className="mudo">Ninguém desta turma tem e-mail cadastrado.</p>}

      {d.alunos_sem_contato.length > 0 && (
        <div className="faixa aviso" style={{ marginTop: ".75rem", marginBottom: 0 }}>
          Sem telefone nem e-mail para avisar: {d.alunos_sem_contato.join(", ")}. Cadastre os responsáveis em <b>Alunos</b>.
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}
