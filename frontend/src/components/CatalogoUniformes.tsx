import { useState } from "react";
import { api, brl } from "../api";
import { TAMANHOS_ADULTO, TAMANHOS_INFANTIL, emReais, paraReais, type ItemLoja } from "../uniformes";

const lista = (t: string) => t.split(",").map((s) => s.trim()).filter(Boolean);

/** Catálogo: itens à venda, com preço, cores e tamanhos. */
export default function CatalogoUniformes({ itens, atualizar }: { itens: ItemLoja[]; atualizar: () => void }) {
  const [editando, setEditando] = useState<number | "novo" | null>(null);
  const [f, setF] = useState({ nome: "", preco: "", cores: "", tamanhos: "", ativo: true });
  const [erro, setErro] = useState("");

  function abrir(i?: ItemLoja) {
    setErro("");
    setEditando(i ? i.id : "novo");
    setF(i ? { nome: i.nome, preco: emReais(i.preco_centavos), cores: i.cores.join(", "), tamanhos: i.tamanhos.join(", "), ativo: i.ativo } : { nome: "", preco: "", cores: "", tamanhos: TAMANHOS_ADULTO.join(", "), ativo: true });
  }
  async function salvar() {
    setErro("");
    const preco = f.preco.trim() ? paraReais(f.preco) : 0;
    if (!f.nome.trim()) return setErro("Dê um nome ao item.");
    if (Number.isNaN(preco) || preco < 0) return setErro("Preço inválido.");
    const body = { nome: f.nome, preco, cores: lista(f.cores), tamanhos: lista(f.tamanhos), ativo: f.ativo };
    try {
      if (editando === "novo") await api.post("/api/itens", body);
      else await api.put(`/api/itens/${editando}`, body);
      setEditando(null);
      atualizar();
    } catch (e) { setErro((e as Error).message); }
  }
  async function excluir(i: ItemLoja) {
    if (!confirm(`Excluir o item "${i.nome}"?`)) return;
    try { await api.del(`/api/itens/${i.id}`); atualizar(); } catch (e) { setErro((e as Error).message); }
  }

  const painel = (
    <div className="painel">
      <b>{editando === "novo" ? "Novo item" : "Editar item"}</b>
      <div className="duas" style={{ marginTop: ".5rem" }}>
        <label>Nome<input value={f.nome} placeholder="ex.: Camisa do Grupo, Abadá" onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
        <label>Preço (R$)<input inputMode="decimal" value={f.preco} placeholder="ex.: 45,00" onChange={(e) => setF({ ...f, preco: e.target.value })} /></label>
      </div>
      <label>Cores (separadas por vírgula)<input value={f.cores} placeholder="ex.: Preta, Branca, Verde" onChange={(e) => setF({ ...f, cores: e.target.value })} /></label>
      <label>Tamanhos (separados por vírgula)<input value={f.tamanhos} placeholder="ex.: P, M, G, GG" onChange={(e) => setF({ ...f, tamanhos: e.target.value })} /></label>
      <div className="acoes" style={{ marginTop: 0 }}>
        <button type="button" onClick={() => setF({ ...f, tamanhos: TAMANHOS_ADULTO.join(", ") })}>Tamanhos adulto</button>
        <button type="button" onClick={() => setF({ ...f, tamanhos: TAMANHOS_INFANTIL.join(", ") })}>Tamanhos infantil</button>
        <button type="button" onClick={() => setF({ ...f, tamanhos: [...TAMANHOS_INFANTIL, ...TAMANHOS_ADULTO].join(", ") })}>Os dois</button>
      </div>
      <label className="check" style={{ marginTop: ".5rem" }}><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> À venda (desmarque para tirar do catálogo sem perder o histórico)</label>
      {erro && <p className="erro">{erro}</p>}
      <div className="acoes">
        <button className="primario" onClick={salvar}>Salvar</button>
        <button onClick={() => setEditando(null)}>Cancelar</button>
      </div>
    </div>
  );

  return (
    <>
      <div className="acoes" style={{ marginTop: 0, marginBottom: ".75rem" }}><button className="primario" onClick={() => abrir()}>+ Novo item</button></div>
      {editando === "novo" && painel}
      {erro && editando === null && <p className="erro">{erro}</p>}
      {itens.length === 0 && editando !== "novo" && <div className="cartao"><p className="mudo">Nenhum item ainda. Cadastre a camisa, o abadá, a calça... com as cores e os tamanhos que você vende.</p></div>}
      {itens.map((i) => (
        <div className="cartao" key={i.id} style={i.ativo ? undefined : { opacity: 0.65 }}>
          <div className="topo">
            <div>
              <h2 style={{ margin: 0 }}>{i.nome} {!i.ativo && <span className="selo aviso">fora de venda</span>}</h2>
              <p className="mudo" style={{ margin: ".25rem 0 0" }}>{brl(i.preco_centavos)} · cores: {i.cores.join(", ") || "—"} · tamanhos: {i.tamanhos.join(", ") || "—"}</p>
            </div>
            <div className="acoes" style={{ marginTop: 0 }}>
              <button onClick={() => (editando === i.id ? setEditando(null) : abrir(i))}>Editar</button>
              <button className="perigo" onClick={() => excluir(i)}>Excluir</button>
            </div>
          </div>
          {editando === i.id && painel}
        </div>
      ))}
    </>
  );
}
