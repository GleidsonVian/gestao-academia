import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function Login() {
  const { me, entrar } = useAuth();
  const [modo, setModo] = useState<"login" | "registro">("login");
  const [f, setF] = useState({ academia: "", modalidade: "", nome: "", email: "", senha: "" });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (me) return <Navigate to="/" replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const r = modo === "login" ? await api.login(f.email, f.senha) : await api.registrar(f);
      await entrar(r.access_token);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="cartao" onSubmit={enviar}>
        <h1>Gestão de Academias</h1>
        <p className="mudo">{modo === "login" ? "Entre na sua conta" : "Cadastre sua academia"}</p>

        {modo === "registro" && (
          <>
            <label>Nome da academia<input required value={f.academia} onChange={set("academia")} /></label>
            <label>
              Modalidade
              <input required placeholder="Capoeira, Muay Thai, Kickboxing…" value={f.modalidade} onChange={set("modalidade")} />
            </label>
            <label>Seu nome<input required value={f.nome} onChange={set("nome")} /></label>
          </>
        )}
        <label>E-mail<input type="email" required value={f.email} onChange={set("email")} /></label>
        <label>Senha<input type="password" required minLength={6} value={f.senha} onChange={set("senha")} /></label>

        {erro && <p className="erro">{erro}</p>}
        <button className="primario" disabled={enviando}>{modo === "login" ? "Entrar" : "Criar conta"}</button>
        <button type="button" className="link" onClick={() => { setModo(modo === "login" ? "registro" : "login"); setErro(""); }}>
          {modo === "login" ? "Ainda não tenho conta" : "Já tenho conta"}
        </button>
      </form>
    </div>
  );
}
