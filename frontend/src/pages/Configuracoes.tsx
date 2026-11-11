import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

const paraLinhas = (l: string[]) => l.join("\n");
const deLinhas = (t: string) => t.split("\n").map((s) => s.trim()).filter(Boolean);

export default function Configuracoes() {
  const { me, recarregar } = useAuth();
  const a = me!.academia;
  const [nome, setNome] = useState(a.nome);
  const [modalidade, setModalidade] = useState(a.modalidade);
  const [grad, setGrad] = useState(paraLinhas(a.graduacoes));
  const [crit, setCrit] = useState(paraLinhas(a.criterios));
  const [contato, setContato] = useState(a.contato_privacidade ?? "");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setMsg(""); setErro("");
    try {
      await api.put("/api/academia", { nome, modalidade, graduacoes: deLinhas(grad), criterios: deLinhas(crit), contato_privacidade: contato || null });
      await recarregar();
      setMsg("Configurações salvas.");
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <>
      <h1>Configurações</h1>
      <form className="cartao form" onSubmit={salvar}>
        <div className="duas">
          <label>Nome da academia<input required value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label>Modalidade<input required value={modalidade} onChange={(e) => setModalidade(e.target.value)} /></label>
        </div>
        <div className="duas">
          <label>
            Graduações (uma por linha, da menor para a maior)
            <textarea rows={9} value={grad} onChange={(e) => setGrad(e.target.value)} />
          </label>
          <label>
            Critérios de avaliação (uma por linha)
            <textarea rows={9} value={crit} onChange={(e) => setCrit(e.target.value)} />
          </label>
        </div>
        <label>
          Contato para assuntos de privacidade (LGPD) — aparece na ficha de inscrição e na página dos pais
          <input placeholder="ex.: contato@suaacademia.com.br ou (27) 99999-9999" value={contato} onChange={(e) => setContato(e.target.value)} />
        </label>
        <p className="mudo">Use cordas, faixas, níveis ou o que fizer sentido na sua modalidade.</p>
        {erro && <p className="erro">{erro}</p>}
        {msg && <p className="ok-texto">{msg}</p>}
        <button className="primario">Salvar</button>
      </form>
    </>
  );
}
