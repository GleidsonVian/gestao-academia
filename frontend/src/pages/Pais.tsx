import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, fmtData, type Avaliacao, type Frequencia, type Presenca } from "../api";
import { FrequenciaBox, ListaAvaliacoes, Medias } from "../components/Desempenho";

type Dados = {
  aluno: { nome: string; apelido: string | null; graduacao: string | null; turma: string | null; desde: string };
  academia: { nome: string; modalidade: string; graduacoes: string[]; contato_privacidade: string | null };
  frequencia: Frequencia;
  presencasRecentes: Presenca[];
  desempenho: { media: Record<string, number>; avaliacoes: Avaliacao[] };
};

/** Página pública (somente leitura) que o professor envia aos pais. */
export default function Pais() {
  const { token } = useParams();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.publico<Dados>(`/publico/${token}`).then(setD).catch((e) => setErro(e.message));
  }, [token]);

  if (erro) return <div className="login"><div className="cartao"><h1>Link indisponível</h1><p className="mudo">{erro}. Peça um novo link ao professor.</p></div></div>;
  if (!d) return <p className="centro mudo">Carregando…</p>;

  const grads = d.academia.graduacoes;
  const idx = d.aluno.graduacao ? grads.indexOf(d.aluno.graduacao) : -1;

  return (
    <div className="pais">
      <header>
        <small>{d.academia.nome} · {d.academia.modalidade}</small>
        <h1>{d.aluno.nome} {d.aluno.apelido && <span className="apelido">“{d.aluno.apelido}”</span>}</h1>
        <p className="mudo">{[d.aluno.turma, `aluno desde ${fmtData(d.aluno.desde)}`].filter(Boolean).join(" · ")}</p>
      </header>

      {d.aluno.graduacao && (
        <div className="cartao">
          <h2>Graduação atual: {d.aluno.graduacao}</h2>
          {idx >= 0 && (
            <div className="etapas">
              {grads.map((g, i) => <span key={g} className={i <= idx ? "etapa feita" : "etapa"} title={g} />)}
            </div>
          )}
        </div>
      )}

      <div className="cartao"><h2>Frequência</h2><FrequenciaBox freq={d.frequencia} presencas={d.presencasRecentes} /></div>
      <div className="cartao"><h2>Desempenho (média)</h2><Medias media={d.desempenho.media} /></div>
      <div className="cartao">
        <h2>Avaliações do professor</h2>
        {d.desempenho.avaliacoes.length ? <ListaAvaliacoes itens={d.desempenho.avaliacoes} /> : <p className="mudo">Nenhuma avaliação publicada ainda.</p>}
      </div>
      <p className="rodape-lgpd">
        <a href="/privacidade" target="_blank" rel="noreferrer">Política de privacidade</a>
        {d.academia.contato_privacidade && <> · Contato: {d.academia.contato_privacidade}</>}
      </p>
    </div>
  );
}
