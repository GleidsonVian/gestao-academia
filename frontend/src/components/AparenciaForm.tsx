import { useEffect, useState, type FormEvent } from "react";
import { api, enviarArquivo, urlDeImagemProtegida } from "../api";
import { useAuth } from "../auth";

const SUGESTOES = ["#c2410c", "#b91c1c", "#a16207", "#15803d", "#0f766e", "#1d4ed8", "#6d28d9", "#be185d", "#111827"];
const MAX_BYTES = 1024 * 1024;

/** Reduz imagens grandes no navegador (máx. 1000 px) para caber no limite de 1 MB. */
async function reduzirImagem(arquivo: File): Promise<File> {
  const tiposOk = ["image/png", "image/jpeg", "image/webp"];
  if (!tiposOk.includes(arquivo.type)) throw new Error("Use uma imagem PNG, JPG ou WEBP.");
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
  const [cor, setCor] = useState(ap.cor_primaria ?? "#c2410c");
  const [opacidade, setOpacidade] = useState(ap.logo_opacidade);
  const [previa, setPrevia] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelado = false;
    if (ap.tem_logo) urlDeImagemProtegida("/api/academia/logo").then((u) => { url = u; if (!cancelado) setPrevia(u); });
    else setPrevia(null);
    return () => { cancelado = true; if (url) URL.revokeObjectURL(url); };
  }, [ap.tem_logo, ap.logo_versao]);

  async function executar(fn: () => Promise<unknown>, ok: string) {
    setMsg(""); setErro(""); setEnviando(true);
    try { await fn(); await recarregar(); setMsg(ok); } catch (e) { setErro((e as Error).message); } finally { setEnviando(false); }
  }
  const salvar = (e: FormEvent) => {
    e.preventDefault();
    executar(() => api.put("/api/academia/aparencia", { cor_primaria: personalizar ? cor : null, logo_opacidade: opacidade }), "Aparência salva.");
  };
  const trocarLogo = (f: File | undefined) => {
    if (f) executar(async () => enviarArquivo("/api/academia/logo", await reduzirImagem(f)), "Logo atualizado.");
  };
  const removerLogo = () => {
    if (confirm("Remover o logo de fundo?")) executar(() => api.del("/api/academia/logo"), "Logo removido.");
  };

  return (
    <form className="cartao form" onSubmit={salvar}>
      <h2>Aparência</h2>
      <p className="mudo">Escolha a cor do app e coloque o logo do grupo de fundo. Vale para o painel, para a página dos pais e para a ficha de inscrição.</p>

      <label className="check">
        <input type="checkbox" checked={personalizar} onChange={(e) => setPersonalizar(e.target.checked)} /> Usar uma cor personalizada
      </label>
      {personalizar && (
        <>
          <div className="cores">
            <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} aria-label="Escolher cor" />
            {SUGESTOES.map((s) => (
              <button type="button" key={s} className="amostra" style={{ background: s, outline: s === cor ? "3px solid var(--txt)" : "none" }} onClick={() => setCor(s)} aria-label={`Cor ${s}`} />
            ))}
            <code>{cor}</code>
          </div>
          <p>
            <span className="mudo">Prévia: </span>
            <span className="selo" style={{ background: cor, color: "#fff", borderColor: cor }}>Botão</span>{" "}
            <span className="selo" style={{ borderColor: cor, color: cor }}>Destaque</span>
          </p>
        </>
      )}

      <h2 style={{ marginTop: "1.25rem" }}>Logo de fundo</h2>
      <div className="acoes" style={{ alignItems: "flex-start" }}>
        {previa ? <img className="previa-logo" src={previa} alt="Logo atual" /> : <span className="mudo">Nenhum logo enviado.</span>}
        <div>
          <label className="botao" style={{ cursor: "pointer", marginBottom: ".5rem" }}>
            {ap.tem_logo ? "Trocar logo" : "Enviar logo"}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={enviando}
              onChange={(e) => { trocarLogo(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {ap.tem_logo && <button type="button" className="perigo" onClick={removerLogo} disabled={enviando}>Remover</button>}
          <p className="mudo" style={{ marginBottom: 0 }}>PNG, JPG ou WEBP. Fundo transparente (PNG) fica melhor. Imagens grandes são reduzidas automaticamente.</p>
        </div>
      </div>

      {ap.tem_logo && (
        <label>
          Visibilidade do logo no fundo: {opacidade}%
          <input type="range" min={2} max={40} value={opacidade} onChange={(e) => setOpacidade(Number(e.target.value))} />
        </label>
      )}

      {erro && <p className="erro">{erro}</p>}
      {msg && <p className="ok-texto">{msg}</p>}
      <button className="primario" disabled={enviando}>Salvar aparência</button>
    </form>
  );
}
