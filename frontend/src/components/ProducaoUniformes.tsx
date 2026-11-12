import { useEffect, useState } from "react";
import { api } from "../api";
import { baixarCsv, textoProducao, type LinhaProducao } from "../uniformes";
import { linkGrupo } from "../aviso";

/** Lista de produção: o que ainda falta entregar, somado por item, cor e tamanho (para encomendar na confecção). */
export default function ProducaoUniformes({ academia }: { academia: string }) {
  const [d, setD] = useState<{ total_unidades: number; linhas: LinhaProducao[] } | null>(null);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => { api.get<{ total_unidades: number; linhas: LinhaProducao[] }>("/api/pedidos/producao").then(setD).catch((e) => setErro(e.message)); }, []);
  if (erro) return <p className="erro">{erro}</p>;
  if (!d) return <p className="mudo">Carregando…</p>;

  const texto = textoProducao(d.linhas, academia);
  const itens = [...new Set(d.linhas.map((l) => l.item))];

  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { setErro("Não consegui copiar."); }
  }

  return (
    <>
      <p className="mudo">Soma dos pedidos que <b>ainda não foram entregues</b>, por item, cor e tamanho. Use para encomendar na confecção; o que já foi entregue sai da lista.</p>
      {d.linhas.length === 0 ? <div className="cartao"><p className="mudo">Nada pendente de entrega.</p></div> : (
        <>
          <div className="acoes" style={{ marginBottom: ".75rem" }}>
            <button className="primario" onClick={copiar}>{copiado ? "Copiado!" : "Copiar lista"}</button>
            <a className="botao" href={linkGrupo(texto)} target="_blank" rel="noreferrer">Enviar no WhatsApp</a>
            <button onClick={() => baixarCsv("producao-uniformes.csv", [["Item", "Cor", "Tamanho", "Quantidade", "Já pagas", "A pagar"],
              ...d.linhas.map((l) => [l.item, l.cor ?? "", l.tamanho ?? "", l.quantidade, l.pagas, l.a_pagar])])}>Exportar CSV</button>
            <span className="selo">{d.total_unidades} peça(s) no total</span>
          </div>
          {itens.map((item) => {
            const ls = d.linhas.filter((l) => l.item === item);
            return (
              <div className="cartao" key={item}>
                <h2>{item} <span className="selo">{ls.reduce((s, l) => s + l.quantidade, 0)} peça(s)</span></h2>
                <ul className="lista">
                  {ls.map((l, i) => (
                    <li key={i}>
                      <span>{[l.cor, l.tamanho ? `tamanho ${l.tamanho}` : null].filter(Boolean).join(" · ") || "sem variação"}</span>
                      <span className="alternar">
                        <b style={{ fontSize: "1.1rem" }}>{l.quantidade}</b>
                        {l.a_pagar > 0 && <span className="selo aviso">{l.a_pagar} a pagar</span>}
                        {l.pagas > 0 && <span className="selo ok">{l.pagas} paga(s)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
