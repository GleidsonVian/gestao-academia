import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, enviarInscricao } from "../api";
import { CLAUSULA_IMAGEM, CLAUSULA_SAUDE, TERMOS_VERSAO } from "../termos";

/** Formulário público: o responsável preenche a ficha de inscrição pelo link do professor. */
export default function Inscricao() {
  const { token } = useParams();
  const [info, setInfo] = useState<{ academia: string; modalidade: string; contato_privacidade: string | null } | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);
  const [f, setF] = useState({
    nome: "", nascimento: "", responsavel_nome: "", responsavel_telefone: "", email: "", observacoes: "",
  });
  const [imagem, setImagem] = useState(false);
  const [termos, setTermos] = useState(false);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    api.publico<{ academia: string; modalidade: string; contato_privacidade: string | null }>(`/inscricao/${token}`).then(setInfo).catch(() => setIndisponivel(true));
  }, [token]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => v && fd.append(k, v));
    fd.append("autoriza_imagem", String(imagem));
    fd.append("aceite_termos", String(termos));
    fd.append("termos_versao", TERMOS_VERSAO);
    arquivos.forEach((a) => fd.append("arquivos", a));
    try {
      await enviarInscricao(token!, fd);
      setEnviado(true);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (indisponivel) return <div className="login"><div className="cartao"><h1>Link indisponível</h1><p className="mudo">Peça um novo link de inscrição à academia.</p></div></div>;
  if (!info) return <p className="centro mudo">Carregando…</p>;
  if (enviado) return (
    <div className="login"><div className="cartao">
      <h1>Inscrição recebida!</h1>
      <p>A {info.academia} vai analisar os dados e entrar em contato pelo telefone informado.</p>
    </div></div>
  );

  return (
    <div className="pais">
      <header>
        <small>{info.academia} · {info.modalidade}</small>
        <h1>Ficha de inscrição</h1>
      </header>

      <form onSubmit={enviar}>
        <div className="cartao form">
          <h2>Dados do aluno</h2>
          <label>Nome completo<input required value={f.nome} onChange={set("nome")} /></label>
          <label>Data de nascimento<input type="date" required max={new Date().toISOString().slice(0, 10)} value={f.nascimento} onChange={set("nascimento")} /></label>
          <label>
            Informações de saúde (doenças, alergias, medicamentos, lesões, restrições)
            <textarea rows={4} placeholder="Informe tudo que a professora/professor precisa saber. Se não houver, escreva: nenhuma." value={f.observacoes} onChange={set("observacoes")} />
          </label>
        </div>

        <div className="cartao form">
          <h2>Dados do responsável</h2>
          <label>Nome do responsável<input required value={f.responsavel_nome} onChange={set("responsavel_nome")} /></label>
          <label>Telefone / WhatsApp<input required minLength={8} value={f.responsavel_telefone} onChange={set("responsavel_telefone")} /></label>
          <label>E-mail<input type="email" value={f.email} onChange={set("email")} /></label>
        </div>

        <div className="cartao form">
          <h2>Documentos (opcional)</h2>
          <p className="mudo">PDF, JPG ou PNG, até 5 arquivos de 5 MB (ex.: atestado médico, documento do aluno).</p>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} />
        </div>

        <div className="cartao form">
          <h2>{CLAUSULA_SAUDE.titulo}</h2>
          <div className="clausula">{CLAUSULA_SAUDE.texto.map((t, k) => <p key={k}>{t}</p>)}</div>
          <label className="check">
            <input type="checkbox" required checked={termos} onChange={(e) => setTermos(e.target.checked)} />
            {CLAUSULA_SAUDE.aceite} <b>(obrigatório)</b>
          </label>
        </div>

        <div className="cartao form">
          <h2>{CLAUSULA_IMAGEM.titulo} <span className="selo">opcional</span></h2>
          <div className="clausula">{CLAUSULA_IMAGEM.texto.map((t, k) => <p key={k}>{t}</p>)}</div>
          <label className="check">
            <input type="checkbox" checked={imagem} onChange={(e) => setImagem(e.target.checked)} />
            {CLAUSULA_IMAGEM.aceite}
          </label>
        </div>

        {erro && <p className="erro">{erro}</p>}
        <p className="mudo">
          Seus dados serão usados apenas para a matrícula e o acompanhamento do aluno. Leia a{" "}
          <a href="/privacidade" target="_blank" rel="noreferrer">política de privacidade</a>.
          Você pode pedir acesso, correção ou eliminação dos dados a qualquer momento
          {info.contato_privacidade ? <>, pelo contato: <b>{info.contato_privacidade}</b></> : <>, falando com a academia</>}.
        </p>
        <button className="primario" disabled={enviando}>{enviando ? "Enviando…" : "Enviar inscrição"}</button>
      </form>
    </div>
  );
}
