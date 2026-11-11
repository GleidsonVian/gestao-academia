import { fmtData, type Avaliacao, type Frequencia, type Presenca } from "../api";

export function Medias({ media }: { media: Record<string, number> }) {
  const itens = Object.entries(media);
  if (!itens.length) return <p className="mudo">Ainda sem avaliações.</p>;
  return (
    <div className="barras">
      {itens.map(([nome, v]) => (
        <div key={nome} className="barra">
          <span>{nome}</span>
          <div className="trilho"><div className="preenche" style={{ width: `${v * 10}%` }} /></div>
          <b>{v.toFixed(1)}</b>
        </div>
      ))}
    </div>
  );
}

export function FrequenciaBox({ freq, presencas }: { freq: Frequencia; presencas: Presenca[] }) {
  const rotulo = { presente: "presente", falta: "faltou", justificada: "falta justificada" } as const;
  return (
    <>
      <p>
        <b className="grande">{freq.percentual === null ? "Sem registros" : `${freq.percentual}%`}</b>{" "}
        <span className="mudo">de frequência</span>
      </p>
      <p className="mudo">
        {freq.presentes} presenças · {freq.faltas} faltas · {freq.justificadas} justificadas (as justificadas não entram no percentual)
      </p>
      <div className="pontos">
        {[...presencas].reverse().map((p, i) => (
          <span key={p.data + i} className={`ponto ${p.status}`} title={`${fmtData(p.data)} – ${rotulo[p.status]}`} />
        ))}
      </div>
    </>
  );
}

export function ListaAvaliacoes({ itens, onExcluir }: { itens: Avaliacao[]; onExcluir?: (id: number) => void }) {
  if (!itens.length) return null;
  return (
    <ul className="avaliacoes">
      {itens.map((a) => (
        <li key={a.id}>
          <div className="topo">
            <b>{fmtData(a.data)}</b>
            {onExcluir && (
              <span>
                {!a.visivel_pais && <span className="selo">Oculta p/ pais</span>}{" "}
                <button className="link" onClick={() => onExcluir(a.id)}>Excluir</button>
              </span>
            )}
          </div>
          <div className="notas">
            {Object.entries(a.notas).map(([k, v]) => <span key={k} className="selo">{k}: {v}</span>)}
          </div>
          {a.comentario && <p>{a.comentario}</p>}
        </li>
      ))}
    </ul>
  );
}
