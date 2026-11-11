import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, fmtData, pct, type Aula, type StatusChamada } from "../api";

type Freq = { presentes: number; faltas: number; justificadas: number; percentual: number | null };
type Linha = { id: number; nome: string; apelido: string | null; graduacao: string | null; situacao: string; status: StatusChamada | null; frequencia: Freq };
type Dados = { aula: Aula; alunos: Linha[] };

const OPCOES: { valor: StatusChamada; rotulo: string }[] = [
  { valor: "presente", rotulo: "Presente" },
  { valor: "falta", rotulo: "Falta" },
  { valor: "justificada", rotulo: "Justificada" },
];

export default function Chamada() {
  const [params, setParams] = useSearchParams();
  const aulaId = params.get("aula") ?? "";
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [dados, setDados] = useState<Dados | null>(null);
  const [filtro, setFiltro] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { api.get<Aula[]>("/api/aulas?status=realizada").then(setAulas); }, []);
  const carregar = useCallback(() => {
    if (!aulaId) return setDados(null);
    api.get<Dados>(`/api/aulas/${aulaId}/chamada`).then(setDados).catch(() => setDados(null));
  }, [aulaId]);
  useEffect(() => { setMsg(""); carregar(); }, [carregar]);

  const marcar = (id: number, status: StatusChamada) => {
    setMsg("");
    setDados((d) => d && { ...d, alunos: d.alunos.map((l) => (l.id === id ? { ...l, status } : l)) });
  };
  const todos = (status: StatusChamada) => setDados((d) => d && { ...d, alunos: d.alunos.map((l) => ({ ...l, status })) });

  async function salvar() {
    const marcacoes = dados!.alunos.filter((l) => l.status).map((l) => ({ aluno_id: l.id, status: l.status! }));
    await api.post(`/api/aulas/${aulaId}/chamada`, { marcacoes });
    setMsg(`Chamada salva (${marcacoes.length} alunos).`);
  }

  const conta = (s: StatusChamada) => dados?.alunos.filter((l) => l.status === s).length ?? 0;
  const f = filtro.trim().toLowerCase();
  const visiveis = dados?.alunos.filter((l) => `${l.nome} ${l.apelido ?? ""}`.toLowerCase().includes(f)) ?? [];

  return (
    <>
      <h1>Frequência e chamada</h1>
      <div className="filtros">
        <select value={aulaId} onChange={(e) => setParams(e.target.value ? { aula: e.target.value } : {})}>
          <option value="">Selecione uma aula realizada…</option>
          {aulas.map((a) => (
            <option key={a.id} value={a.id}>{fmtData(a.data)} — {a.titulo}{a.turma ? ` (${a.turma})` : ""}</option>
          ))}
        </select>
      </div>

      {!dados ? (
        <div className="cartao">
          <p className="mudo">Escolha uma aula realizada. Para liberar a chamada de uma aula nova, marque-a como <b>realizada</b> no <Link to="/calendario">calendário</Link>.</p>
        </div>
      ) : (
        <>
          <div className="grade">
            <div className="cartao numero"><span>{conta("presente")}</span><small>Presentes</small></div>
            <div className="cartao numero"><span>{conta("falta")}</span><small>Faltas</small></div>
            <div className="cartao numero"><span>{conta("justificada")}</span><small>Justificadas (fora do %)</small></div>
          </div>

          <div className="filtros">
            <input placeholder="Localizar aluno por nome ou apelido…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            <button onClick={() => todos("presente")}>Todos presentes</button>
          </div>

          <div className="cartao">
            {dados.alunos.length === 0 ? <p className="mudo">Nenhum aluno ativo nesta turma.</p> : (
              <ul className="lista">
                {visiveis.map((l) => (
                  <li key={l.id}>
                    <span>
                      <b>{l.nome}</b>
                      {l.apelido && <span className="apelido"> “{l.apelido}”</span>}
                      {l.situacao === "afastado" && <> <span className="selo aviso">Afastado</span></>}
                      <br /><small className="mudo">{l.graduacao ?? "Sem graduação"}</small>
                      {" "}
                      <span
                        className={`selo ${l.frequencia.percentual !== null && l.frequencia.percentual < 75 ? "aviso" : ""}`}
                        title={`${l.frequencia.presentes} presenças · ${l.frequencia.faltas} faltas · ${l.frequencia.justificadas} justificadas`}
                      >
                        Frequência: {pct(l.frequencia.percentual)}
                      </span>
                      {l.frequencia.justificadas > 0 && <small className="mudo"> · {l.frequencia.justificadas} just.</small>}
                    </span>
                    <span className="alternar">
                      {OPCOES.map((o) => (
                        <button key={o.valor} className={l.status === o.valor ? `ativo ${o.valor === "presente" ? "ok" : o.valor}` : ""} onClick={() => marcar(l.id, o.valor)}>
                          {o.rotulo}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="acoes">
            <button className="primario" onClick={salvar}>Salvar chamada</button>
            {msg && <span className="mudo">{msg}</span>}
          </div>
          <p className="mudo">Frequência = presenças ÷ (presenças + faltas). Faltas justificadas ficam registradas, mas não entram no cálculo.</p>
        </>
      )}
    </>
  );
}
