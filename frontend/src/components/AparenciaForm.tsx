import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, enviarArquivo, urlDeImagemProtegida, type Aparencia } from "../api";
import { useAuth } from "../auth";
import { PALETAS, definirRascunho } from "../tema";

const MAX_BYTES = 1024 * 1024;
const POSICOES: [Aparencia["logo_posicao"], string][] = [
  ["centro", "Centro"], ["topo-esq", "Canto superior esquerdo"], ["topo-dir", "Canto superior direito"],
  ["base-esq", "Canto inferior esquerdo"], ["base-dir", "Canto inferior direito"], ["mosaico", "Repetido (mosaico)"],
];

/** Reduz imagens grandes no navegador (máx. 1000 px) para caber no limite de 1 MB. */
async function reduzirImagem(arquivo: File): Promise<File> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(arquivo.type)) throw new Error("Use uma imagem PNG, JPG ou WEBP.");
  if (arquivo.size <= 900 * 1024) return arquivo;
  const bmp = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const comAlpha = arquivo.type !== "image/jpeg"; // PNG/WEBP podem ter fundo transparente
  const blob: Blob | null = await new Promise((ok) => canvas.toBlob(ok, comAlpha ? "image/png" : "image/jpeg", 0.85));
  if (!blob || blob.size > MAX_BYTES) throw new Error("Imagem muito grande mesmo reduzida. Tente uma menor ou mais simples.");
  return new File([blob], comAlpha ? "logo.png" : "logo.jpg", { type: blob.type });
}

export default function AparenciaForm() {
  const { me, recarregar } = useAuth();
  const ap = me!.aparencia;
  const [personalizar, setPersonalizar] = useState(!!ap.cor_primaria);
  const [cor, setCor] = useState(ap.cor_primaria ?? "#15803d");
  const [completo, setCompleto] = useState(ap.tema_completo);
  const [opacidade, setOpacidade] = useState(ap.logo_opacidade);
  const [escala, setEscala] = useState(ap.logo_escala);
  const [posicao, setPosicao] = useState<Aparencia["logo_posicao"]>(ap.logo_posicao);
  const [previa, setPrevia] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  // a imagem do logo para a prévia (o endpoint exige login, então busca como blob)
  useEffect(() => {
    let url: string | null = null;
    let cancelado = false;
    if (ap.tem_logo) urlDeImagemProtegida("/api/academia/logo").then((u) => { url = u; if (!cancelado) setPrevia(u); });
    else setPrevia(null);
    return () => { cancelado = true; if (url) URL.revokeObjectURL(url); };
  }, [ap.tem_logo, ap.logo_versao]);

  const rascunho: Aparencia = useMemo(() => ({
    cor_primaria: personalizar ? cor : null, tema_completo: completo, tem_logo: ap.tem_logo, logo_versao: ap.logo_versao,
    logo_opacidade: opacidade, logo_escala: escala, logo_posicao: posicao,
  }), [personalizar, cor, completo, opacidade, escala, posicao, ap.tem_logo, ap.logo_versao]);

  // prévia ao vivo no app inteiro; ao sair da tela volta para o tema salvo
  useEffect(() => { definirRascunho({ ap: rascunho, logo: ap.tem_logo ? previa : null }); }, [rascunho, previa, ap.tem_logo]);
  useEffect(() => () => definirRascunho(null), []);

  async function executar(fn: () => Promise<unknown>, ok: string) {
    setMsg(""); setErro(""); setEnviando(true);
    try { await fn(); await recarregar(); setMsg(ok); } catch (e) { setErro((e as Error).message); } finally { setEnviando(false); }
  }
  const salvar = (e: FormEvent) => {
    e.preventDefault();
    executar(() => api.put("/api/academia/aparencia", {
      cor_primaria: personalizar ? cor : null, tema_completo: completo, logo_opacidade: opacidade, logo_escala: escala, logo_posicao: posicao,
    }), "Aparência salva para todos os usuários da academia.");
  };
  const trocarLogo = (f: File | undefined) => {
    if (f) executar(async () => enviarArquivo("/api/academia/logo", await reduzirImagem(f)), "Logo atualizado.");
  };
  const removerLogo = () => {
    if (confirm("Remover o logo de fundo?")) executar(() => api.del("/api/academia/logo"), "Logo removido.");
  };
  const escolher = (c: string) => { setPersonalizar(true); setCor(c); };

  return (
    <form className="cartao form" onSubmit={salvar}>
      <h2>Aparência</h2>
      <p className="mudo">Escolha a paleta do app e o logo do grupo. As mudanças aparecem na hora, para você ver; clique em <b>Salvar aparência</b> para valer para todos.</p>

      <h2 style={{ fontSize: ".95rem" }}>Paleta de cores</h2>
      <div className="seletor-paleta">
        <button type="button" className={`paleta ${!personalizar ? "ativa" : ""}`} onClick={() => setPersonalizar(false)}>
          <i style={{ background: "#c2410c" }} /> Padrão
        </button>
        {PALETAS.map((p) => (
          <button type="button" key={p.nome} className={`paleta ${personalizar && cor.toLowerCase() === p.cor ? "ativa" : ""}`} onClick={() => escolher(p.cor)}>
            <i style={{ background: p.cor }} /> {p.nome}
          </button>
        ))}
      </div>
      <div className="cores">
        <label style={{ flexDirection: "row", alignItems: "center", gap: ".5rem", margin: 0 }}>
          Outra cor:
          <input type="color" value={cor} onChange={(e) => escolher(e.target.value)} aria-label="Escolher outra cor" />
        </label>
        {personalizar && <code>{cor}</code>}
      </div>
      <label className="check">
        <input type="checkbox" checked={completo} disabled={!personalizar} onChange={(e) => setCompleto(e.target.checked)} />
        Colorir também o fundo, os cartões e as bordas (o app inteiro no tom da cor, no modo claro e no escuro)
      </label>

      <h2 style={{ fontSize: ".95rem", marginTop: "1.25rem" }}>Logo de fundo</h2>
      <div className="acoes" style={{ alignItems: "flex-start" }}>
        {previa ? <img className="previa-logo" src={previa} alt="Logo atual" /> : <span className="mudo">Nenhum logo enviado.</span>}
        <div>
          <label className="botao" style={{ cursor: "pointer", marginBottom: ".5rem" }}>
            {ap.tem_logo ? "Trocar logo" : "Enviar logo"}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={enviando}
              onChange={(e) => { trocarLogo(e.target.files?.[0]); e.target.value = ""; }} />
          </label>{" "}
          {ap.tem_logo && <button type="button" className="perigo" onClick={removerLogo} disabled={enviando}>Remover</button>}
          <p className="mudo" style={{ marginBottom: 0 }}>PNG, JPG ou WEBP. PNG com fundo transparente fica melhor. Imagens grandes são reduzidas automaticamente.</p>
        </div>
      </div>

      {ap.tem_logo && (
        <div className="dois-col" style={{ marginTop: ".75rem" }}>
          <label>Tamanho: {escala}%
            <input type="range" min={15} max={140} step={5} value={escala} onChange={(e) => setEscala(Number(e.target.value))} />
          </label>
          <label>Visibilidade: {opacidade}%
            <input type="range" min={2} max={60} value={opacidade} onChange={(e) => setOpacidade(Number(e.target.value))} />
          </label>
          <label>Posição
            <select value={posicao} onChange={(e) => setPosicao(e.target.value as Aparencia["logo_posicao"])}>
              {POSICOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </label>
        </div>
      )}

      {erro && <p className="erro">{erro}</p>}
      {msg && <p className="ok-texto">{msg}</p>}
      <button className="primario" disabled={enviando}>Salvar aparência</button>
    </form>
  );
}
