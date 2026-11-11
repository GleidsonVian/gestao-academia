import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtData, pct } from "../api";

type Dados = {
  inscricoesPendentes: number; alunosAtivos: number; turmas: number; frequenciaGeral: number | null; aulasRealizadas: number; avaliacoesMes: number;
  aniversariantes: { id: number; nome: string; nascimento: string }[];
};

export default function Dashboard() {
  const [d, setD] = useState<Dados | null>(null);
  useEffect(() => { api.get<Dados>("/api/dashboard").then(setD); }, []);
  if (!d) return <p className="mudo">Carregando…</p>;

  const cards: [string, number | string][] = [
    ["Inscrições pendentes", d.inscricoesPendentes], ["Alunos ativos", d.alunosAtivos], ["Turmas", d.turmas],
    ["Frequência geral", pct(d.frequenciaGeral)], ["Aulas realizadas", d.aulasRealizadas], ["Avaliações (30 dias)", d.avaliacoesMes],
  ];
  return (
    <>
      <h1>Início</h1>
      <div className="grade">
        {cards.map(([t, n]) => (
          <div className="cartao numero" key={t} style={t === "Inscrições pendentes" && Number(n) > 0 ? { borderColor: "var(--cor)" } : undefined}><span>{n}</span><small>{t}</small></div>
        ))}
      </div>
      <div className="cartao">
        <h2>Aniversariantes do mês</h2>
        {d.aniversariantes.length === 0 && <p className="mudo">Nenhum aniversariante este mês.</p>}
        <ul className="lista">
          {d.aniversariantes.map((a) => (
            <li key={a.id}><Link to={`/alunos/${a.id}`}>{a.nome}</Link><span className="mudo">{fmtData(a.nascimento).slice(0, 5)}</span></li>
          ))}
        </ul>
      </div>
    </>
  );
}
