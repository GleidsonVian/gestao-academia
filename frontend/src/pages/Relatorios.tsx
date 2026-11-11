import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, pct } from "../api";

type Linha = {
  id: number; nome: string; apelido: string | null; graduacao: string | null;
  presentes: number; faltas: number; justificadas: number; percentual: number | null; situacao: string;
};
type Dados = { aulasRealizadas: number; geral: number | null; alunos: Linha[] };

export default function Relatorios() {
  const [d, setD] = useState<Dados | null>(null);
  useEffect(() => { api.get<Dados>("/api/relatorios/frequencia").then(setD); }, []);
  if (!d) return <p className="mudo">Carregando…</p>;

  function exportar() {
    const linhas = [["Nome", "Apelido", "Graduação", "Presenças", "Faltas", "Justificadas", "Frequência"],
      ...d!.alunos.map((a) => [a.nome, a.apelido ?? "", a.graduacao ?? "", a.presentes, a.faltas, a.justificadas, a.percentual === null ? "Sem registros" : `${a.percentual}%`])];
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = "frequencia.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="topo"><h1>Relatórios de frequência</h1><button onClick={exportar}>Exportar CSV</button></div>
      <div className="grade">
        <div className="cartao numero"><span>{pct(d.geral)}</span><small>Frequência geral</small></div>
        <div className="cartao numero"><span>{d.aulasRealizadas}</span><small>Aulas realizadas</small></div>
        <div className="cartao numero"><span>{d.alunos.length}</span><small>Alunos matriculados</small></div>
      </div>
      <div className="cartao">
        <h2>Frequência individual</h2>
        <p className="mudo">Presenças ÷ (presenças + faltas). Justificadas aparecem à parte e não entram no percentual. Aulas programadas ou canceladas ficam fora.</p>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Aluno</th><th>Presenças</th><th>Faltas</th><th>Justificadas</th><th>Frequência</th></tr></thead>
            <tbody>
              {d.alunos.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/alunos/${a.id}`}>{a.nome}</Link>{a.apelido && <span className="apelido"> “{a.apelido}”</span>}{a.situacao === "afastado" && <> <span className="selo aviso">Afastado</span></>}</td>
                  <td>{a.presentes}</td><td>{a.faltas}</td><td>{a.justificadas}</td>
                  <td>{a.percentual === null ? <span className="mudo">Sem registros</span> : <b>{a.percentual}%</b>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
